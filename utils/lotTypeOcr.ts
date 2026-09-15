import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';

const TESSERACT_LANG_PATH = path.resolve(__dirname, '..', 'test-data', 'tesseract');

/**
 * The map draws each lot's label ("LotN" / type / "FF: X ft") in this same orange, regardless of
 * type or file — sampled directly from a real screenshot. Everything else on the canvas (grid
 * dots, ponds, zone labels, the lot outlines themselves) is a different color, so isolating this
 * hue reliably strips the map down to just the label text before OCR sees it.
 */
function isOrangeLabelPixel(r: number, g: number, b: number): boolean {
  return r - g > 20 && g - b > 5 && r > 100;
}

/**
 * Produces a black-and-white, upscaled copy of `inputPath` with only the lot-label-orange pixels
 * kept (as white, on black) — everything else the map renders (grid, ponds, zone labels, UI icons
 * that survived hiding) is noise for OCR purposes and gets dropped. Upscaling (nearest-neighbor,
 * so edges stay hard) compensates for how small the labels render at a legible map zoom.
 */
export function isolateLotLabelText(inputPath: string, outputPath: string, scale = 3): void {
  const src = PNG.sync.read(fs.readFileSync(inputPath));
  const dst = new PNG({ width: src.width * scale, height: src.height * scale });

  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const idx = (src.width * y + x) << 2;
      const isLabel = isOrangeLabelPixel(src.data[idx], src.data[idx + 1], src.data[idx + 2]);
      const value = isLabel ? 255 : 0;

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const dstIdx = (dst.width * (y * scale + dy) + (x * scale + dx)) << 2;
          dst.data[dstIdx] = value;
          dst.data[dstIdx + 1] = value;
          dst.data[dstIdx + 2] = value;
          dst.data[dstIdx + 3] = 255;
        }
      }
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(dst));
}

/**
 * Runs OCR against an already color-isolated (see `isolateLotLabelText`) lot-label image and
 * returns the raw recognized text. Uses PSM AUTO (full-page layout analysis) rather than
 * SPARSE_TEXT — SPARSE_TEXT was found, experimentally, to silently drop the short single/double
 * -letter type line ("A", "A/B", ...) that sits between a lot's "LotN" and "FF: ..." lines, while
 * AUTO reliably picks up all three. No character whitelist: forcing one (e.g. to "ABC/") was found
 * to make Tesseract misread every OTHER stray mark as one of those characters too, which is worse
 * than letting it recognize freely and filtering the result afterward.
 */
async function recognizeText(imagePath: string): Promise<string> {
  const worker = await createWorker('eng', 1, {
    langPath: TESSERACT_LANG_PATH,
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    const {
      data: { text },
    } = await worker.recognize(imagePath);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * True if the recognized lot-label text contains a Type B or C marker anywhere — i.e. some lot on
 * screen was graded as (or including) a type other than A. Deliberately doesn't try to parse which
 * lot each letter belongs to, or reconstruct multi-type labels like "A/B": OCR's own read of the
 * "/" separator is unreliable (frequently misread as "l"/"I"/"1"), but since "LotN" and "FF: ..."
 * never contain the letters A, B, or C, any B/C found in this pre-isolated text can only have come
 * from a type label — so a plain substring check on the recognized text is enough to catch it.
 */
export function containsNonTypeALetter(recognizedText: string): boolean {
  return /[BC]/.test(recognizedText);
}

/**
 * Full pipeline: isolate the lot-label text in `screenshotPath`, OCR it, and report whether
 * anything other than Type A was found. `debugPrefix`, when given, keeps the intermediate
 * (isolated/upscaled) image next to the original for manual inspection instead of discarding it.
 */
export async function checkScreenshotForNonTypeALots(
  screenshotPath: string,
  debugPrefix?: string
): Promise<{ recognizedText: string; hasViolation: boolean }> {
  const isolatedPath = debugPrefix ? `${debugPrefix}-isolated.png` : `${screenshotPath}.isolated.png`;
  isolateLotLabelText(screenshotPath, isolatedPath);
  try {
    const recognizedText = await recognizeText(isolatedPath);
    return { recognizedText, hasViolation: containsNonTypeALetter(recognizedText) };
  } finally {
    if (!debugPrefix) fs.unlinkSync(isolatedPath);
  }
}
