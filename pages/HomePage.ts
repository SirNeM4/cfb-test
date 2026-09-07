import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  private readonly lotBlockV2Link: Locator = this.page.locator('a[href="/lot-block-v2"]');

  constructor(page: Page) {
    super(page);
  }

  /** Clicks the "lot-block-v2" link. This link opens a new tab. */
  async clickLotBlockV2(): Promise<void> {
    await this.lotBlockV2Link.click();
  }
}
