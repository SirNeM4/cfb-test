import * as fs from 'fs';
import * as path from 'path';
import { Download } from '@playwright/test';
import { env } from '../config/env';

fs.mkdirSync(env.downloadsDir, { recursive: true });

/**
 * Saves a Playwright Download to the folder configured in DOWNLOADS_DIR (.env).
 * Typical usage inside a Page Object:
 *   const [download] = await Promise.all([
 *     page.waitForEvent('download'),
 *     page.click('#export'),
 *   ]);
 *   const savedPath = await saveDownload(download);
 */
export async function saveDownload(download: Download, fileName?: string): Promise<string> {
  const destination = path.join(env.downloadsDir, fileName ?? download.suggestedFilename());
  await download.saveAs(destination);
  return destination;
}

export function uploadFilePath(fileName: string): string {
  return path.join(env.uploadsDir, fileName);
}
