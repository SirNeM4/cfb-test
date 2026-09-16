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
  private readonly skipExportButton: Locator = this.page.getByRole('button', { name: 'Skip export' });
  private readonly switchTo3DButton: Locator = this.page.locator('button[aria-label="Switch to 3D view"]');
  private readonly switchTo2DButton: Locator = this.page.locator('button[aria-label="Switch to 2D view"]');
  private readonly solutionSummaryButton: Locator = this.page.locator('button[aria-label="Solution summary"]');
  private readonly presetsUsedHeader: Locator = this.page.locator('button.summary-panel-presets-used__header');
  private readonly presetDetailsButton: Locator = this.page.locator('button.summary-panel-presets-used__details');
  private readonly presetDetailsHeading: Locator = this.page.getByText('From grading solution');
  private readonly presetDetailsTable: Locator = this.page
    .locator('table')
    .filter({ hasText: 'Preset Settings / Lots' });
  // "Preset Issues" table: LOT TYPE / LOT / STATUS / ZOOM, listing only mismatches — a Type-A-only
  // preset should leave this empty for every Group it was assigned to.
  private readonly presetIssuesTable: Locator = this.page.locator('table').filter({ hasText: 'LOT TYPE' });
  private readonly presetDetailsCloseButton: Locator = this.page
    .locator('h3', { has: this.page.getByText('From grading solution') })
    .locator('xpath=following-sibling::button');
  // Per-element (Group/Zone/Pond) preset & constraint assignment, used instead of "Smoke'em All"
  // when a specific preset/constraint needs to be applied rather than the account-wide default.
  private readonly presetAssignmentDropdownTrigger: Locator = this.page
    .locator('input[name="preset"]')
    .locator('xpath=preceding-sibling::div[1]');
  private readonly constraintAssignmentDropdownTrigger: Locator = this.page.locator(
    'span.min-w-0.flex-1.truncate',
    { hasText: 'Apply constraints' }
  );
  private readonly applyConstraintsButton: Locator = this.page.getByRole('button', {
    name: 'Apply constraints',
    exact: true,
  });
  private readonly areaSubmitButton: Locator = this.page.locator('button.rounded-full.bg-primary-default');
  private readonly areaProcessingIndicator: Locator = this.page.getByText('Processing...');

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

  /**
   * Clicks "Upload a new file to process" and confirms the upload modal actually closed —
   * failing fast here instead of silently proceeding into the much longer
   * `waitForMapToFinishLoading` wait if the click never actually submitted anything.
   */
  async submitUpload(): Promise<void> {
    await this.uploadButton.click();
    await expect(this.fileUploadLabel).toBeHidden({ timeout: 20000 });
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

  /**
   * Waits for the grading queue panel to report "Grading complete" (up to 600s by default —
   * some of the larger upload files genuinely need most of that).
   */
  async expectGradingComplete(timeout = 600000): Promise<void> {
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
   * Screenshots just the map canvas at `zoomPercent`, with every known UI overlay (toolbar,
   * solutions panel, zoom controls, top-right icon cluster, right icon rail) hidden first — used
   * for pixel/OCR-based checks (see utils/lotTypeOcr.ts) where button/panel text would otherwise
   * read as noise. The canvas spans the full viewport underneath these overlays, so hiding them is
   * the only way to exclude them from an element screenshot. Visibility is restored immediately
   * after: the hidden "Back" button in particular is needed by normal navigation afterward (e.g.
   * `clickViewAll()` expects to be able to leave the solution view first), so leaving it hidden
   * silently breaks whatever the test does next.
   */
  async captureCleanMapScreenshot(zoomPercent: number, screenshotPath: string): Promise<void> {
    await this.setMinimapSizeTo(zoomPercent);
    await this.moveMouseAway();
    await this.setMapChromeVisibility('hidden');
    await this.page.waitForTimeout(500);

    try {
      await this.canvas.screenshot({ path: screenshotPath });
    } finally {
      await this.setMapChromeVisibility('');
    }
  }

  /** Toggles every known UI overlay drawn on top of the map canvas — see `captureCleanMapScreenshot`. */
  private async setMapChromeVisibility(visibility: 'hidden' | ''): Promise<void> {
    await this.page.evaluate((value) => {
      const findPanelFor = (matchText: string, tag = 'button') => {
        const el = Array.from(document.querySelectorAll(tag)).find((b) => b.textContent?.trim() === matchText);
        return (el?.closest('div.pointer-events-auto') as HTMLElement | null) ?? (el as HTMLElement | null);
      };
      const elements = [
        findPanelFor('Back'),
        findPanelFor('Add solution'),
        findPanelFor('-'),
        findPanelFor('Help'),
        // Right icon rail: the vertical stack of icon-only buttons along the far right edge.
        ...Array.from(document.querySelectorAll('div')).filter((d) => {
          const rect = d.getBoundingClientRect();
          return rect.x > 1200 && rect.width < 80 && rect.height > 100 && rect.height < 400;
        }),
      ].filter((el): el is HTMLElement => el != null);
      elements.forEach((el) => {
        el.style.visibility = value;
      });
    }, visibility);
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
   * they're being visited one by one. Pond entries are the `[role="button"]` themselves. A
   * Group/Zone container's own `[role="button"]` wrapper spans its *entire* card, including any
   * nested child Pond rows below it — clicking that wrapper directly lands on whatever's at its
   * bounding-box center, which for a zone with ponds is a pond row, not the zone's own header.
   * Its header content is marked `[data-parent-zone="true"]` regardless of whether it has
   * children, so target that specifically instead.
   */
  async clickTreeItem(selector: string): Promise<void> {
    const item = this.page.locator(selector);
    const role = await item.getAttribute('role', { timeout: 10000 });
    const target = role === 'button' ? item : item.locator('[data-parent-zone="true"]').first();
    await target.click({ timeout: 10000 });
    await this.page.waitForTimeout(5000);
  }

  /**
   * Clicks the first "Group" entry in the tree — a Zone or Pond won't do, since they show a
   * different "zone preset" panel with unrelated fields.
   */
  async clickFirstGroup(): Promise<void> {
    const items = await this.listTreeItems();
    const group = items.find((item) => item.label.startsWith('group-'));
    if (!group) {
      throw new Error('No Group entry found in the tree.');
    }
    await this.clickTreeItem(group.selector);
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

  /** Clicks "Solution summary" again to hide the panel. */
  async closeSolutionSummary(): Promise<void> {
    await this.solutionSummaryButton.click({ timeout: 15000 });
    await expect(this.presetsUsedHeader).toBeHidden({ timeout: 10000 });
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
    // The heading renders before the data table does — wait for the table itself, and for the
    // specific row this is checked against, so we don't read values before they're populated.
    await expect(this.presetDetailsTable).toBeVisible({ timeout: 15000 });
    await expect(this.presetDetailValue('max allowed slope')).toBeVisible({ timeout: 15000 });
  }

  /** Closes the preset details side panel via its "X" button. */
  async closePresetDetails(): Promise<void> {
    await this.presetDetailsCloseButton.click({ timeout: 15000 });
    await expect(this.presetDetailsHeading).toBeHidden({ timeout: 10000 });
  }

  /**
   * Reads the "Preset Issues" table (Lot Type / Lot / Status) for whichever Group/Zone/Pond is
   * currently selected in the Solution summary panel. Empty when there are no mismatches, or when
   * the selected element has no such section at all (e.g. a Zone/Pond graded with a constraint
   * rather than a Lot preset).
   */
  async getPresetIssues(): Promise<{ lotType: string; lot: string; status: string }[]> {
    const rows = await this.presetIssuesTable.locator('tbody tr').all();
    const issues: { lotType: string; lot: string; status: string }[] = [];
    for (const row of rows) {
      const [lotType, lot, status] = await row.locator('td').allTextContents();
      issues.push({ lotType: lotType?.trim() ?? '', lot: lot?.trim() ?? '', status: status?.trim() ?? '' });
    }
    return issues;
  }

  /**
   * The value cell for a given row label (e.g. "max allowed slope") in the preset details table.
   * `exact` matches the row's th text exactly (case-insensitive) instead of as a substring — use
   * it when `label` would otherwise also match a longer row (e.g. "reference point" is itself a
   * substring of "additional feet above reference point").
   */
  private presetDetailValue(label: string, exact = false): Locator {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = exact ? new RegExp(`^${escaped}$`, 'i') : label;
    return this.presetDetailsTable
      .locator('tr')
      .filter({ has: this.page.locator('th', { hasText: matcher }) })
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

  /**
   * Verifies a single row's value in the currently open preset details table. Pass `exact: true`
   * when `label` would otherwise also match a longer row's text (see `presetDetailValue`).
   */
  async expectPresetDetailValue(label: string, expectedValue: string, exact = false): Promise<void> {
    await expect(this.presetDetailValue(label, exact)).toHaveText(expectedValue);
  }

  /** Assigns `presetName` to the currently selected Group via the "Apply preset" dropdown. */
  async assignPresetToSelection(presetName: string): Promise<void> {
    await this.presetAssignmentDropdownTrigger.click({ timeout: 10000 });
    await this.page.getByRole('menuitem', { name: presetName, exact: true }).click({ timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  /**
   * Confirms the default Zone Constraint for the currently selected Zone/Pond. There's no list to
   * pick from here — the dropdown opens an inline form (Grading Strategy, Elevation, Slopes)
   * already pre-filled with the default values, and "Apply constraints" is already enabled.
   */
  async applyDefaultConstraintToSelection(): Promise<void> {
    await this.constraintAssignmentDropdownTrigger.click({ timeout: 10000 });
    await this.applyConstraintsButton.click({ timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  /** True once every Group/Zone/Pond in the current Area has a preset/constraint assigned. */
  async isAreaSubmitReady(): Promise<boolean> {
    return this.areaSubmitButton.isVisible().catch(() => false);
  }

  /** Clicks the round per-Area "Submit" action, grading every configured element at once. */
  async submitAreaForGrading(): Promise<void> {
    await this.areaSubmitButton.click({ timeout: 15000 });
  }

  /** Waits for the "Processing..." toolbar state to clear after `submitAreaForGrading()`. */
  async waitForAreaGradingComplete(timeout = 300000): Promise<void> {
    await this.areaProcessingIndicator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await expect(this.areaProcessingIndicator).toBeHidden({ timeout });
  }
}
