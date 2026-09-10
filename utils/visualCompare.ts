import { expect, Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Visual regression helper: if no baseline screenshot exists yet for `name`, it saves the
 * current page as the baseline (test passes). If a baseline already exists, it compares the
 * current page against it within `maxDiffPixelRatio` tolerance. A mismatch fails the test and
 * Playwright attaches the actual/expected/diff images to the report, with the differing area
 * highlighted in the diff image.
 */
export async function compareOrSaveBaseline(
  page: Page,
  testInfo: TestInfo,
  name: string,
  maxDiffPixelRatio = 0.02
): Promise<void> {
  const snapshotPath = testInfo.snapshotPath(name, { kind: 'screenshot' });

  if (!fs.existsSync(snapshotPath)) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    await page.screenshot({ path: snapshotPath });
    testInfo.annotations.push({ type: 'visual-baseline', description: `Created baseline screenshot: ${name}` });
    return;
  }

  await expect(page).toHaveScreenshot(name, { maxDiffPixelRatio });
}
