import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  private readonly lotBlockV2Link: Locator = this.page.locator('a[href="/lot-block-v2"]');
  private readonly settingsLink: Locator = this.page.locator('a[href="/settings"]');
  private readonly appVersionText: Locator = this.page.locator('p.text-xs.text-primary-default');

  constructor(page: Page) {
    super(page);
  }

  /** Clicks the "lot-block-v2" link. This link opens a new tab. */
  async clickLotBlockV2(): Promise<void> {
    await this.lotBlockV2Link.click();
  }

  /** Clicks the "settings" link. Like "lot-block-v2", this link opens a new tab. */
  async clickSettings(): Promise<void> {
    await this.settingsLink.click();
  }

  /**
   * Reads the "Source: <environment> · v<version>" label shown on the home page (e.g.
   * "Source: Development · v0.74.109") — lets timing/visual comparisons record which app build
   * they ran against, since dev and staging can be on different versions.
   *
   * This text renders in two stages: "Source: <environment>" appears first, then "· v<version>"
   * is appended a moment later once the version itself loads. Wait for the version number to
   * show up before reading, or this can capture the label mid-render, missing the version.
   */
  async getAppVersion(): Promise<string> {
    await expect(this.appVersionText).toContainText(/v\d+\.\d+\.\d+/, { timeout: 15000 });
    return (await this.appVersionText.textContent())?.trim() ?? '';
  }
}
