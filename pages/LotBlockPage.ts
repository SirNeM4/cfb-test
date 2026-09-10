import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LotBlockPage extends BasePage {
  private readonly fileUploadLabel: Locator = this.page.locator('label[for="file-upload"]');
  private readonly fileUploadInput: Locator = this.page.locator('#file-upload');
  private readonly uploadButton: Locator = this.page.getByRole('button', {
    name: 'Upload a new file to process',
  });
  private readonly viewAllLabel: Locator = this.page.locator('span.text-sm.truncate[title="View all"]');
  private readonly viewAllButton: Locator = this.page.locator('div.cursor-pointer:has(span[title="View all"])');
  private readonly mapLoadingIndicator: Locator = this.page.locator('[class~="text-white/20"][class~="text-xs"]');
  private readonly leftPanel: Locator = this.page.locator('[data-lbm-framing-chrome]');
  private readonly leftPanelGroupItems: Locator = this.page.locator('[data-zone-group-container="true"]');
  private readonly canvas: Locator = this.page.locator('canvas[data-engine]');
  private readonly smokeEmAllMenuItem: Locator = this.page.getByRole('menuitem', { name: "Smoke'em All" });
  private readonly gradingQueueTitle: Locator = this.page.locator(
    'header.cursor-grab span.text-xs.font-medium.text-primary-default'
  );
  private readonly backButton: Locator = this.page.locator('button[aria-label="Back"]');
  private readonly showLotMeshButton: Locator = this.page.locator('button[aria-label="Show lot mesh"]');

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

  /**
   * Waits for the map to finish loading after a file is uploaded: waits for the loading
   * placeholders (class "text-white/20 text-xs") to appear and then to fully disappear.
   * The indicator can flicker (briefly hit 0 between lots/blocks while more are still
   * loading), so once it reaches 0 we keep checking for `stableForMs` and only accept it
   * as "done" if it never reappears during that window.
   */
  async waitForMapToFinishLoading(timeout = 240000, stableForMs = 10000): Promise<void> {
    await this.mapLoadingIndicator
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => {});

    const deadline = Date.now() + timeout;
    while (true) {
      await expect(this.mapLoadingIndicator).toHaveCount(0, { timeout: Math.max(1000, deadline - Date.now()) });

      const stableDeadline = Date.now() + stableForMs;
      let reappeared = false;
      while (Date.now() < stableDeadline) {
        await this.page.waitForTimeout(250);
        if ((await this.mapLoadingIndicator.count()) > 0) {
          reappeared = true;
          break;
        }
      }

      if (!reappeared) return;
      if (Date.now() >= deadline) {
        throw new Error('Map loading indicator kept reappearing and never stabilized within the timeout');
      }
    }
  }

  /** Verifies that the left panel (groups & zones tree) has been populated with content. */
  async expectLeftPanelPopulated(timeout = 30000): Promise<void> {
    await expect(this.leftPanel).toBeVisible({ timeout });
    await expect(this.leftPanelGroupItems.first()).toBeVisible({ timeout });
  }

  /** Clicks "View all" in the left panel and waits for the map's fit-to-bounds animation to settle. */
  async clickViewAll(): Promise<void> {
    await this.viewAllButton.click();
    await this.page.waitForTimeout(2000);
  }

  /** True if this Group/Zone entry is a Zone (not a Group) that isn't nested inside an Area. */
  private async isStandaloneZone(item: Locator): Promise<boolean> {
    const title = (await item.locator('span[title]').first().getAttribute('title')) ?? '';
    if (!title.startsWith('Zone')) {
      return false;
    }

    const nestedInArea = await item
      .locator('xpath=ancestor::div[div[contains(@class,"cursor-default")]][1]')
      .count();
    return nestedInArea === 0;
  }

  /**
   * Clicks the first "valid" Group/Zone entry in the left panel tree at or after `startIndex`
   * (0-based, DOM/panel order — this list already flattens entries nested inside Areas, since
   * Areas themselves aren't clickable). A standalone Zone that isn't nested inside an Area is
   * skipped: the target must be a Group, or any entry nested inside an Area. Returns the index
   * of the entry that was clicked, so callers can resume the search after it.
   */
  async clickFirstValidGroupOrZone(startIndex = 0): Promise<number> {
    const count = await this.leftPanelGroupItems.count();
    for (let i = startIndex; i < count; i++) {
      const item = this.leftPanelGroupItems.nth(i);
      if (await this.isStandaloneZone(item)) {
        continue;
      }

      await item.locator('[role="button"]').first().click();
      await this.page.waitForTimeout(2000);
      return i;
    }
    throw new Error(`No valid Group/Zone entry found at or after index ${startIndex}`);
  }

  /** Clicks the "Back" button (e.g. to leave a solution view and return to the groups/zones tree). */
  async clickBack(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForTimeout(1000);
  }

  /** Clicks the "Show lot mesh" toggle in the viewer's floating toolbar. */
  async clickShowLotMesh(): Promise<void> {
    await this.showLotMeshButton.click();
  }

  /** Right-clicks the center of the 3D canvas while holding Ctrl+Shift to open its context menu. */
  async openCanvasContextMenu(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error('Canvas bounding box not available; the 3D view may not be loaded yet.');
    }
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.keyboard.down('Control');
    await this.page.keyboard.down('Shift');
    try {
      await this.page.mouse.down({ button: 'right' });
      await this.page.mouse.up({ button: 'right' });
    } finally {
      await this.page.keyboard.up('Shift');
      await this.page.keyboard.up('Control');
    }
  }

  /** Clicks "Smoke'em All" in the canvas context menu. */
  async clickSmokeEmAll(): Promise<void> {
    await this.smokeEmAllMenuItem.click();
  }

  /** Waits for the grading queue panel to report "Grading complete" (up to 300s by default). */
  async expectGradingComplete(timeout = 300000): Promise<void> {
    await expect(this.gradingQueueTitle).toBeVisible({ timeout: 30000 });
    await expect(this.gradingQueueTitle).toHaveText('Grading complete', { timeout });
  }
}
