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
  private readonly leftPanelAllTreeItems: Locator = this.page.locator(
    '[data-zone-group-container="true"], [data-child-zone-id]'
  );
  private readonly canvas: Locator = this.page.locator('canvas[data-engine]');
  private readonly smokeEmAllMenuItem: Locator = this.page.getByRole('menuitem', { name: "Smoke'em All" });
  private readonly taskPanelTitle: Locator = this.page.locator(
    'header.cursor-grab span.text-xs.font-medium.text-primary-default'
  );
  private readonly backButton: Locator = this.page.locator('button[aria-label="Back"]');
  private readonly showLotMeshButton: Locator = this.page.locator('button[aria-label="Show lot mesh"]');
  private readonly minimapButton: Locator = this.page.locator('button[aria-label="Minimap"]');
  private readonly minimapSlider: Locator = this.page.locator('input[type="range"]');
  private readonly solutionSummaryButton: Locator = this.page.locator('button[aria-label="Solution summary"]');
  private readonly presetsUsedHeader: Locator = this.page.locator('button.summary-panel-presets-used__header');
  private readonly presetDetailsButton: Locator = this.page.locator('button.summary-panel-presets-used__details');
  private readonly presetDetailsHeading: Locator = this.page.getByText('From grading solution');
  private readonly presetDetailsTable: Locator = this.page
    .locator('table')
    .filter({ hasText: 'Preset Settings / Lots' });
  private readonly skipExportButton: Locator = this.page.getByRole('button', { name: 'Skip export' });
  private readonly switchTo3DButton: Locator = this.page.locator('button[aria-label="Switch to 3D view"]');
  private readonly switchTo2DButton: Locator = this.page.locator('button[aria-label="Switch to 2D view"]');

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
  async waitForMapToFinishLoading(timeout = 600000, stableForMs = 4000): Promise<void> {
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

  /**
   * The enclosing Area wrapper for this tree entry, if it's nested inside one. The Area header
   * row is non-interactive ("cursor-default") before grading, and becomes a clickable "Review"
   * row ("areaReview") once grading completes — match either.
   */
  private enclosingArea(item: Locator): Locator {
    return item.locator(
      'xpath=ancestor::div[div[contains(@class,"cursor-default") or contains(@class,"areaReview")]][1]',
    );
  }

  /** The enclosing Area's label (e.g. "Area 2"), or null if this entry isn't nested in one. */
  private async enclosingAreaLabel(item: Locator): Promise<string | null> {
    const area = this.enclosingArea(item);
    if ((await area.count()) === 0) {
      return null;
    }
    return area.locator('span[title]').first().getAttribute('title');
  }

  /** True if this Group/Zone entry is a Zone (not a Group) that isn't nested inside an Area. */
  private async isStandaloneZone(item: Locator): Promise<boolean> {
    const title = (await item.locator('span[title]').first().getAttribute('title')) ?? '';
    if (!title.startsWith('Zone')) {
      return false;
    }

    return (await this.enclosingArea(item).count()) === 0;
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
      // The 3D view (and the lot mesh, once enabled) takes a moment to finish rendering the
      // newly selected group, so give it a beat before any screenshot is taken.
      await this.page.waitForTimeout(5000);
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

  /** Gives the canvas time to finish rendering the lot mesh after it's toggled on (can take up to 5 minutes). */
  async waitForMeshToRender(timeout = 300000): Promise<void> {
    await this.waitForMapToFinishLoading(timeout, 5000);
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
    await expect(this.taskPanelTitle).toBeVisible({ timeout: 30000 });
    await expect(this.taskPanelTitle).toHaveText('Grading complete', { timeout });
  }

  /** Dismisses the "Grading complete" toast via "Skip export" — it otherwise stays on screen and overlaps later panels. */
  async clickSkipExport(): Promise<void> {
    await this.skipExportButton.click();
    await expect(this.skipExportButton).toHaveCount(0, { timeout: 10000 });
  }

  /** Clicks the "3D" toggle next to the minimap, switching the canvas into 3D navigation mode. */
  async clickSwitchTo3D(): Promise<void> {
    await this.switchTo3DButton.click();
    await this.page.waitForTimeout(2000);
  }

  /** Clicks the "2D" toggle next to the minimap, switching the canvas back to 2D. */
  async clickSwitchTo2D(): Promise<void> {
    await this.switchTo2DButton.click();
    await this.page.waitForTimeout(2000);
  }

  /** Moves the cursor to a corner of the page, off the canvas, so it and any hover tooltips it triggers don't show up in a screenshot. */
  async moveMouseAway(): Promise<void> {
    await this.page.mouse.move(2, 2);
  }

  /**
   * Right-clicks the canvas center and, holding the button down, drags the mouse through a
   * sequence of waypoints (each `{dx, dy}` offset from the previous point) — used to orbit the 3D
   * camera the way a real drag with several changes of direction would. Leaves the mouse button
   * held; call `releaseRightDrag()` afterward.
   */
  async orbitWithRightDrag(waypoints: { dx: number; dy: number }[]): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error('Canvas bounding box not available; the 3D view may not be loaded yet.');
    }
    let x = box.x + box.width / 2;
    let y = box.y + box.height / 2;

    await this.page.mouse.move(x, y);
    await this.page.mouse.down({ button: 'right' });

    // Move in small increments with a short pause between each, rather than one fast jump — a
    // real drag is gradual, and moving too fast makes the resulting camera angle inconsistent
    // between runs.
    const pxPerStep = 4;
    const msPerStep = 15;
    for (const { dx, dy } of waypoints) {
      const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / pxPerStep));
      for (let i = 0; i < steps; i++) {
        x += dx / steps;
        y += dy / steps;
        await this.page.mouse.move(x, y);
        await this.page.waitForTimeout(msPerStep);
      }
    }
  }

  /** Releases the right mouse button after `orbitWithRightDrag()`. */
  async releaseRightDrag(): Promise<void> {
    await this.page.mouse.up({ button: 'right' });
  }

  /**
   * Opens the minimap size slider and drags it to `targetPercent` (0-100). The drag is done
   * with the mouse, then fine-tuned with arrow-key nudges (the slider's step is 0.5) so the
   * final value lands exactly on target for a deterministic screenshot.
   */
  async setMinimapSizeTo(targetPercent: number): Promise<void> {
    await this.minimapButton.click();
    await expect(this.minimapSlider).toBeVisible({ timeout: 10000 });

    const box = await this.minimapSlider.boundingBox();
    if (!box) {
      throw new Error('Minimap slider bounding box not available.');
    }

    const currentValue = Number(await this.minimapSlider.inputValue());
    const startX = box.x + (box.width * currentValue) / 100;
    const targetX = box.x + (box.width * targetPercent) / 100;
    const y = box.y + box.height / 2;

    await this.page.mouse.move(startX, y);
    await this.page.mouse.down();
    await this.page.mouse.move(targetX, y, { steps: 10 });
    await this.page.mouse.up();

    for (let i = 0; i < 40; i++) {
      const value = Number(await this.minimapSlider.inputValue());
      if (Math.abs(value - targetPercent) < 0.25) {
        break;
      }
      await this.page.keyboard.press(value < targetPercent ? 'ArrowRight' : 'ArrowLeft');
    }
  }

  /** Reads the current zoom percentage shown on the "Minimap" button (e.g. "43%" -> 43). */
  async getMinimapPercent(): Promise<number> {
    const text = (await this.minimapButton.textContent()) ?? '';
    return Number(text.replace('%', '').trim());
  }

  /** If the current minimap zoom is below `minPercent`, sets it to `targetPercent`. */
  async ensureMinimapZoomAtLeast(minPercent: number, targetPercent: number): Promise<void> {
    const current = await this.getMinimapPercent();
    if (current < minPercent) {
      await this.setMinimapSizeTo(targetPercent);
    }
  }

  /**
   * A stable per-entry selector, a short filename-safe label (e.g. "group-2", "pond-1"), and
   * the label of the enclosing Area (null if the entry isn't nested inside one).
   */
  async listTreeItems(): Promise<{ selector: string; label: string; areaLabel: string | null }[]> {
    const count = await this.leftPanelAllTreeItems.count();
    const items: { selector: string; label: string; areaLabel: string | null }[] = [];

    for (let i = 0; i < count; i++) {
      const item = this.leftPanelAllTreeItems.nth(i);

      const id = await item.getAttribute('id');
      const childZoneId = await item.getAttribute('data-child-zone-id');
      const selector = id ? `[id="${id}"]` : `[data-child-zone-id="${childZoneId}"]`;

      const titleSpan = item.locator('span[title]').first();
      const text = (await titleSpan.count())
        ? ((await titleSpan.getAttribute('title')) ?? '')
        : ((await item.textContent()) ?? '');
      const slug = text
        .replace(/└─/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '');

      items.push({ selector, label: slug || `item-${i}`, areaLabel: await this.enclosingAreaLabel(item) });
    }

    return items;
  }

  /**
   * Clicks a tree entry located by the stable `selector` from `listTreeItems()` — re-locating
   * by id/attribute (rather than a raw index) avoids drift if the panel re-sorts entries while
   * they're being visited one by one. Groups/Zones expose their clickable element as a nested
   * `[role="button"]`; Pond entries are the `[role="button"]` themselves.
   */
  async clickTreeItem(selector: string): Promise<void> {
    const item = this.page.locator(selector);
    const target = (await item.getAttribute('role')) === 'button' ? item : item.locator('[role="button"]').first();
    await target.click();
    await this.page.waitForTimeout(5000);
  }

  /** True if the "Back" button (e.g. from a solution view) is currently visible. */
  async isBackButtonVisible(): Promise<boolean> {
    return this.backButton.isVisible();
  }

  /** Opens the "Solution summary" panel for the currently viewed solution. */
  async openSolutionSummary(): Promise<void> {
    await this.solutionSummaryButton.click({ timeout: 15000 });
    await expect(this.presetsUsedHeader).toBeVisible({ timeout: 10000 });
  }

  /**
   * Expands the "Presets used" section within the Solution summary panel. The panel can still be
   * mid slide-in when this is called, so a click right after it opens can miss — retry a couple
   * times, checking `aria-expanded` first so an already-successful click isn't toggled back shut.
   * Every call here is explicitly bounded: without a `timeout`, Playwright locator actions wait
   * indefinitely (up to the test's own timeout) rather than failing fast.
   */
  async expandPresetsUsed(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await this.presetsUsedHeader.getAttribute('aria-expanded', { timeout: 5000 })) !== 'true') {
        await this.presetsUsedHeader.click({ timeout: 5000 });
      }
      try {
        await expect(this.presetDetailsButton).toBeVisible({ timeout: 5000 });
        return;
      } catch {
        // Not visible yet — loop around and try again.
      }
    }
    await expect(this.presetDetailsButton).toBeVisible({ timeout: 5000 });
  }

  /** Clicks "View details" to open the full preset details side panel. */
  async openPresetDetails(): Promise<void> {
    await this.presetDetailsButton.click({ timeout: 15000 });
    await expect(this.presetDetailsHeading).toBeVisible({ timeout: 10000 });
  }

  /** The value cell for a given row label (e.g. "max allowed slope") in the preset details table. */
  private presetDetailValue(label: string): Locator {
    return this.presetDetailsTable
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: label }) })
      .locator('td');
  }

  /**
   * Verifies the preset actually used for grading matches the Default Preset values configured
   * by the grading-settings setup (tests/specs/grading-settings.setup.ts): max slope 6%, stem
   * walls and retaining walls off, no fence.
   */
  async expectPresetMatchesGradingDefaults(): Promise<void> {
    await expect(this.presetDetailValue('max allowed slope')).toHaveText('6%');
    await expect(this.presetDetailValue('allow stem walls?')).toHaveText('No');
    await expect(this.presetDetailValue('allow retaining walls?')).toHaveText('No');
    await expect(this.presetDetailValue('do you want a fence?')).toHaveText('No');
  }
}
