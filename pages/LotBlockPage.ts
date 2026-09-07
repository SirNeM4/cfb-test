import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LotBlockPage extends BasePage {
  private readonly fileUploadLabel: Locator = this.page.locator('label[for="file-upload"]');
  private readonly fileUploadInput: Locator = this.page.locator('#file-upload');
  private readonly uploadButton: Locator = this.page.getByRole('button', {
    name: 'Upload a new file to process',
  });
  private readonly viewAllLabel: Locator = this.page.locator('span.text-sm.truncate[title="View all"]');

  constructor(page: Page) {
    super(page);
  }

  /** Verifies that the file upload modal is visible. */
  async expectUploadModalVisible(): Promise<void> {
    await expect(this.fileUploadLabel).toBeVisible({ timeout: 10000 });
  }

  /** Uploads a file from data/uploads/<fileName> using the input linked to the "Select File" label. */
  async selectFile(fileName: string): Promise<void> {
    await this.uploadFile(this.fileUploadInput, fileName);
  }

  /** Clicks "Upload a new file to process". */
  async submitUpload(): Promise<void> {
    await this.uploadButton.click();
  }

  /** Verifies that the "View all" element exists after the file is processed. */
  async expectViewAllVisible(): Promise<void> {
    await expect(this.viewAllLabel).toBeVisible({ timeout: 10000 });
  }
}
