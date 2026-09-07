import { Page, Locator } from '@playwright/test';
import { uploadFilePath, saveDownload } from '../utils/downloadHelper';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  /** Uploads a file from data/uploads/<fileName> using an input[type=file]. */
  protected async uploadFile(locator: Locator, fileName: string): Promise<void> {
    await locator.setInputFiles(uploadFilePath(fileName));
  }

  /** Triggers an action that starts a download and saves it to DOWNLOADS_DIR. */
  protected async downloadTriggeredBy(action: () => Promise<void>, fileName?: string): Promise<string> {
    const [download] = await Promise.all([this.page.waitForEvent('download'), action()]);
    return saveDownload(download, fileName);
  }
}
