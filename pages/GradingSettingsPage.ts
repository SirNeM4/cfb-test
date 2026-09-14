import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** A full snapshot of every field on a Lot preset — see `GradingSettingsPage.getFullPresetValues`. */
export interface FullPresetValues {
  frontSetback: number;
  sideSetback: number;
  rearSetback: number;
  rearSetbackMaxSlope: number;
  sideSetbackMaxSlope: number;
  minSlope: number;
  maxSlope: number;
  maxDrivewaySlope: number;
  finishedFloorFeetAbove: number;
  finishedFloorFoundationRise: number;
  lotTypeAEnabled: boolean;
  lotTypeBEnabled: boolean;
  stemWallsEnabled: boolean;
  retainingWallsEnabled: boolean;
  fence: 'Yes' | 'No';
  rearYardDrainage: boolean;
  waterCrossing: boolean;
  sideYardSwale: 'on' | 'off';
  rearYardSwale: 'on' | 'off';
}

export class GradingSettingsPage extends BasePage {
  private readonly gradingSettingsLink: Locator = this.page.locator('a[aria-label="Grading settings"]');
  private readonly lotPresetsLink: Locator = this.page.locator('a[aria-label="Lot presets"]');
  private readonly defaultPresetButton: Locator = this.page.getByRole('button', {
    name: 'Default Preset',
    exact: true,
  });
  private readonly maxSlopeInput: Locator = this.page.locator('#max_slope');
  private readonly stemWallsToggle: Locator = this.page.locator('#stem_walls');
  private readonly retainingWallsToggle: Locator = this.page.locator('#retaining_walls');
  private readonly fenceNoRadio: Locator = this.page
    .locator('[aria-labelledby="fence-label"] label', { hasText: 'No' })
    .locator('input[type="radio"]');
  private readonly fenceYesRadio: Locator = this.page
    .locator('[aria-labelledby="fence-label"] label', { hasText: 'Yes' })
    .locator('input[type="radio"]');
  private readonly saveChangesButton: Locator = this.page.getByRole('button', { name: 'Save Changes' });
  private readonly addPresetButton: Locator = this.page.getByRole('button', { name: 'Add Preset' });
  private readonly presetNameInput: Locator = this.page.locator('input[maxlength="50"][type="text"]');
  private readonly presetDescriptionTextarea: Locator = this.page.locator('textarea[maxlength="250"]');
  private readonly createPresetButton: Locator = this.page.getByRole('button', { name: 'Create' });
  private readonly frontSetbackInput: Locator = this.page.locator('#front_setback_distance');
  private readonly sideSetbackInput: Locator = this.page.locator('#side_setback_distance');
  private readonly rearSetbackInput: Locator = this.page.locator('#rear_setback_distance');
  private readonly rearSetbackMaxSlopeInput: Locator = this.page.locator('#rear_setback_max_slope');
  private readonly sideSetbackMaxSlopeInput: Locator = this.page.locator('#max_side_setback_slope');
  private readonly lotTypeAToggle: Locator = this.page.locator('#base_a_lots');
  private readonly lotTypeBToggle: Locator = this.page.locator('#base_b_lots');
  private readonly presetNameButtons: Locator = this.page.locator('button.font-bold');
  // Drainage Lot Slopes
  private readonly minSlopeInput: Locator = this.page.locator('#min_slope');
  private readonly maxDrivewaySlopeInput: Locator = this.page.locator('#max_driveway_slope');
  // PAD & Finished Floor (Type A only — the preset only ever grades as Lot Type A here)
  private readonly finishedFloorFeetAboveInput: Locator = this.page.locator('[id="finished_floor.0.feet_above"]');
  private readonly finishedFloorFoundationRiseInput: Locator = this.page.locator(
    '[id="finished_floor.0.foundation_rise"]'
  );
  // Water Flow and Swale Options
  private readonly rearYardDrainageToggle: Locator = this.page.locator('#allow_rear_yard_drainage');
  private readonly waterCrossingToggle: Locator = this.page.locator('#allow_water_crossing_lot_line');
  private readonly sideYardSwaleOnButton: Locator = this.page
    .locator('[aria-labelledby="side_yard_swale_position-label"]')
    .locator('button')
    .filter({ has: this.page.locator('img[alt="Swales placed ON lot line"]') });
  private readonly sideYardSwaleOffButton: Locator = this.page
    .locator('[aria-labelledby="side_yard_swale_position-label"]')
    .locator('button')
    .filter({ has: this.page.locator('img[alt="Swales placed OFF lot line"]') });
  private readonly rearYardSwaleOnButton: Locator = this.page
    .locator('[aria-labelledby="rear_yard_swale_position-label"]')
    .locator('button')
    .filter({ has: this.page.locator('img[alt="Swales placed ON lot line"]') });
  private readonly rearYardSwaleOffButton: Locator = this.page
    .locator('[aria-labelledby="rear_yard_swale_position-label"]')
    .locator('button')
    .filter({ has: this.page.locator('img[alt="Swales placed OFF lot line"]') });

  constructor(page: Page) {
    super(page);
  }

  /** Clicks "Grading settings" in the Settings modal's side navigation. */
  async openGradingSettings(): Promise<void> {
    await expect(this.gradingSettingsLink).toBeVisible();
    await this.gradingSettingsLink.click();
    await expect(this.lotPresetsLink).toBeVisible();
  }

  /** Clicks "Lot presets" and waits for the preset list to render and finish loading. */
  async openLotPresets(): Promise<void> {
    await this.lotPresetsLink.click();
    await expect(this.defaultPresetButton).toBeVisible();
    await this.waitForPresetListStable();
  }

  /**
   * The preset list can still be fetching/rendering additional rows right after
   * "Default Preset" first appears — checking `presetExists()` too early can miss a preset
   * that's really there. Wait until the row count stops changing before trusting it.
   */
  private async waitForPresetListStable(stableForMs = 1000, timeout = 5000): Promise<void> {
    const deadline = Date.now() + timeout;
    let lastCount = -1;
    let stableSince = Date.now();
    while (Date.now() < deadline) {
      const count = await this.presetNameButtons.count();
      if (count !== lastCount) {
        lastCount = count;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= stableForMs) {
        return;
      }
      await this.page.waitForTimeout(150);
    }
  }

  /** The preset row button for a given preset name, in the "Lot presets" list. */
  private presetButtonByName(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Expands the "Default Preset" accordion so its fields become visible/editable. */
  async openDefaultPreset(): Promise<void> {
    await this.openPreset('Default Preset');
  }

  /** Expands the named preset's accordion so its fields become visible/editable. */
  async openPreset(name: string): Promise<void> {
    const heading = this.page.getByRole('heading', { name, exact: true, level: 2 });
    if (await heading.isVisible().catch(() => false)) {
      return; // This preset's panel is already the one expanded.
    }
    await this.presetButtonByName(name).click();
    await expect(heading).toBeVisible();
    await expect(this.maxSlopeInput).toBeVisible();
  }

  /** True if a preset with this name already exists in the "Lot presets" list. */
  async presetExists(name: string): Promise<boolean> {
    return (await this.presetButtonByName(name).count()) > 0;
  }

  /** Clicks "Add Preset" and waits for the "Add Preset" modal to open. */
  async openAddPresetModal(): Promise<void> {
    await this.addPresetButton.click();
    await expect(this.presetNameInput).toBeVisible();
  }

  /** Fills in the "Add Preset" modal and clicks "Create". */
  async createPreset(name: string, description = ''): Promise<void> {
    await this.presetNameInput.fill(name);
    if (description) {
      await this.presetDescriptionTextarea.fill(description);
    }
    await this.createPresetButton.click();
    await expect(this.presetNameInput).toBeHidden();
  }

  /**
   * Creates `name` from a clean slate: if a preset with that name already exists (e.g. left over
   * from an interrupted previous run), deletes it first, then always creates it fresh.
   */
  async ensureFreshPreset(name: string, description = ''): Promise<void> {
    if (await this.presetExists(name)) {
      await this.deletePreset(name);
    }
    await this.openAddPresetModal();
    await this.createPreset(name, description);
    // Guard against a silent creation failure (e.g. the modal closing without actually
    // persisting a new preset) — without this, later steps would edit whatever preset
    // happens to already be expanded instead of the one this test thinks it created.
    await expect(this.presetButtonByName(name)).toBeVisible();
  }

  private async setNumericField(field: Locator, value: number): Promise<void> {
    const current = await field.inputValue();
    if (current === String(value)) {
      return;
    }
    // The field doesn't reliably clear its previous value before accepting new input, which can
    // leave old and new digits mixed together (e.g. "6" typed into "6" becoming "66") — clear it
    // explicitly first.
    await field.fill('');
    await field.fill(String(value));
    await field.blur();
  }

  /** Sets "Max slope" to the given percentage, only touching the field if it differs. */
  async setMaxSlope(value: number): Promise<void> {
    await this.setNumericField(this.maxSlopeInput, value);
  }

  private async ensureToggleOff(toggle: Locator): Promise<void> {
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
  }

  private async ensureToggleOn(toggle: Locator): Promise<void> {
    if ((await toggle.getAttribute('aria-checked')) !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
  }

  /** Ensures only Lot Type A is enabled under "Optimization Priorities" (B and C off). */
  async ensureOnlyLotTypeAEnabled(): Promise<void> {
    await this.ensureToggleOn(this.lotTypeAToggle);
    await this.ensureToggleOff(this.lotTypeBToggle);
    // Lot Type C renders disabled/grayed out in this environment — leave it alone rather than
    // risk clicking a toggle that isn't meant to be interactive.
  }

  /** Ensures the "Allow stem Walls?" priority toggle is off. */
  async ensureStemWallsOff(): Promise<void> {
    await this.ensureToggleOff(this.stemWallsToggle);
  }

  /** Ensures the "Allow Retaining Walls?" priority toggle is off. */
  async ensureRetainingWallsOff(): Promise<void> {
    await this.ensureToggleOff(this.retainingWallsToggle);
  }

  /** Ensures "Do you want a fence?" is set to "No". */
  async ensureFenceNo(): Promise<void> {
    if (!(await this.fenceNoRadio.isChecked())) {
      await this.fenceNoRadio.check();
    }
  }

  /**
   * Matches the "selected" ring class ("border-primary") on a swale option button, but not the
   * unrelated "hover:border-primary/50" hover utility that's present on BOTH buttons regardless
   * of selection — a plain `/border-primary/` match would wrongly hit that substring too.
   */
  private static readonly SELECTED_SWALE_CLASS = /(?<!:)\bborder-primary\b(?!\/)/;

  /** The selected swale option is styled with a "border-primary" ring; the other isn't. */
  private async expectSwaleSelected(onButton: Locator, offButton: Locator, position: 'on' | 'off'): Promise<void> {
    const selected = position === 'on' ? onButton : offButton;
    const unselected = position === 'on' ? offButton : onButton;
    await expect(selected).toHaveClass(GradingSettingsPage.SELECTED_SWALE_CLASS);
    await expect(unselected).not.toHaveClass(GradingSettingsPage.SELECTED_SWALE_CLASS);
  }

  /** Confirms the side yard swale position persisted as expected. */
  async expectSideYardSwalePosition(position: 'on' | 'off'): Promise<void> {
    await this.expectSwaleSelected(this.sideYardSwaleOnButton, this.sideYardSwaleOffButton, position);
  }

  /** Confirms the rear yard swale position persisted as expected. */
  async expectRearYardSwalePosition(position: 'on' | 'off'): Promise<void> {
    await this.expectSwaleSelected(this.rearYardSwaleOnButton, this.rearYardSwaleOffButton, position);
  }

  /**
   * Clicks "Save Changes" only if it's enabled (nothing to save when the fields already matched
   * the desired values). The button normally unmounts once the save succeeds, but a toggle edit
   * can be flagged as a separate pending change slightly after the main save lands, making the
   * button reappear needing another click — so keep clicking until it actually stays gone.
   */
  async saveIfChanged(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((await this.saveChangesButton.count()) === 0) {
        return;
      }
      await expect(this.saveChangesButton).toBeEnabled();
      await this.saveChangesButton.click();
      await expect(this.saveChangesButton).toHaveCount(0);
      // Give any delayed "still dirty" re-flagging a moment to surface before declaring victory.
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Confirms the values just saved actually stuck: re-opens the Default Preset (the caller
   * should navigate back to Lot presets and call this after a page reload, so the fields reflect
   * what the backend has, not just leftover client-side state) and checks each field.
   */
  async expectDefaultsPersisted(): Promise<void> {
    await expect(this.maxSlopeInput).toHaveValue('6');
    await expect(this.stemWallsToggle).toHaveAttribute('aria-checked', 'false');
    await expect(this.retainingWallsToggle).toHaveAttribute('aria-checked', 'false');
    await expect(this.fenceNoRadio).toBeChecked();
  }

  /**
   * A full, dynamic snapshot of every field on the currently-open preset — not just the ones
   * this test happens to edit. Reading whatever is actually there (rather than assuming a fixed
   * default for fields left untouched) lets the caller compare this same snapshot against what
   * persists after a reload, and later against what the Solution Summary shows post-grading.
   */
  async getFullPresetValues(): Promise<FullPresetValues> {
    const isChecked = async (toggle: Locator) => (await toggle.getAttribute('aria-checked')) === 'true';
    const swalePosition = async (onButton: Locator): Promise<'on' | 'off'> =>
      GradingSettingsPage.SELECTED_SWALE_CLASS.test((await onButton.getAttribute('class')) ?? '') ? 'on' : 'off';

    return {
      frontSetback: Number(await this.frontSetbackInput.inputValue()),
      sideSetback: Number(await this.sideSetbackInput.inputValue()),
      rearSetback: Number(await this.rearSetbackInput.inputValue()),
      rearSetbackMaxSlope: Number(await this.rearSetbackMaxSlopeInput.inputValue()),
      sideSetbackMaxSlope: Number(await this.sideSetbackMaxSlopeInput.inputValue()),
      minSlope: Number(await this.minSlopeInput.inputValue()),
      maxSlope: Number(await this.maxSlopeInput.inputValue()),
      maxDrivewaySlope: Number(await this.maxDrivewaySlopeInput.inputValue()),
      finishedFloorFeetAbove: Number(await this.finishedFloorFeetAboveInput.inputValue()),
      finishedFloorFoundationRise: Number(await this.finishedFloorFoundationRiseInput.inputValue()),
      lotTypeAEnabled: await isChecked(this.lotTypeAToggle),
      lotTypeBEnabled: await isChecked(this.lotTypeBToggle),
      stemWallsEnabled: await isChecked(this.stemWallsToggle),
      retainingWallsEnabled: await isChecked(this.retainingWallsToggle),
      fence: (await this.fenceYesRadio.isChecked()) ? 'Yes' : 'No',
      rearYardDrainage: await isChecked(this.rearYardDrainageToggle),
      waterCrossing: await isChecked(this.waterCrossingToggle),
      sideYardSwale: await swalePosition(this.sideYardSwaleOnButton),
      rearYardSwale: await swalePosition(this.rearYardSwaleOnButton),
    };
  }

  /**
   * Confirms the currently-open preset's fields match a previously-captured `getFullPresetValues`
   * snapshot. Call after a reload so this reads what the backend actually persisted, not
   * leftover client-side state.
   */
  async expectFullPresetValues(expected: FullPresetValues): Promise<void> {
    await expect(this.frontSetbackInput).toHaveValue(String(expected.frontSetback));
    await expect(this.sideSetbackInput).toHaveValue(String(expected.sideSetback));
    await expect(this.rearSetbackInput).toHaveValue(String(expected.rearSetback));
    await expect(this.rearSetbackMaxSlopeInput).toHaveValue(String(expected.rearSetbackMaxSlope));
    await expect(this.sideSetbackMaxSlopeInput).toHaveValue(String(expected.sideSetbackMaxSlope));
    await expect(this.minSlopeInput).toHaveValue(String(expected.minSlope));
    await expect(this.maxSlopeInput).toHaveValue(String(expected.maxSlope));
    await expect(this.maxDrivewaySlopeInput).toHaveValue(String(expected.maxDrivewaySlope));
    await expect(this.finishedFloorFeetAboveInput).toHaveValue(String(expected.finishedFloorFeetAbove));
    await expect(this.finishedFloorFoundationRiseInput).toHaveValue(String(expected.finishedFloorFoundationRise));
    await expect(this.lotTypeAToggle).toHaveAttribute('aria-checked', String(expected.lotTypeAEnabled));
    await expect(this.lotTypeBToggle).toHaveAttribute('aria-checked', String(expected.lotTypeBEnabled));
    await expect(this.stemWallsToggle).toHaveAttribute('aria-checked', String(expected.stemWallsEnabled));
    await expect(this.retainingWallsToggle).toHaveAttribute('aria-checked', String(expected.retainingWallsEnabled));
    await expect(expected.fence === 'Yes' ? this.fenceYesRadio : this.fenceNoRadio).toBeChecked();
    await expect(this.rearYardDrainageToggle).toHaveAttribute('aria-checked', String(expected.rearYardDrainage));
    await expect(this.waterCrossingToggle).toHaveAttribute('aria-checked', String(expected.waterCrossing));
    await this.expectSideYardSwalePosition(expected.sideYardSwale);
    await this.expectRearYardSwalePosition(expected.rearYardSwale);
  }

  /** The row `<div>` in the "Lot presets" list that contains the named preset's button. */
  private presetRow(name: string): Locator {
    return this.page
      .locator('div.flex.items-center.relative')
      .filter({ has: this.presetButtonByName(name) });
  }

  /** The "..." (more options) button for a given preset's row in the "Lot presets" list. */
  private presetOptionsButton(name: string): Locator {
    return this.presetRow(name).getByRole('button', { name: 'More options for comparison preset' });
  }

  /**
   * Deletes a preset via its row's "..." menu -> "Delete" -> confirm "Delete". Used to clean up a
   * preset created for a test run so it doesn't linger in this shared environment.
   */
  async deletePreset(name: string): Promise<void> {
    await this.presetOptionsButton(name).click();
    await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(this.presetButtonByName(name)).toHaveCount(0);
  }
}
