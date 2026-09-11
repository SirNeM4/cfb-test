import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

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
  private readonly saveChangesButton: Locator = this.page.getByRole('button', { name: 'Save Changes' });

  constructor(page: Page) {
    super(page);
  }

  /** Clicks "Grading settings" in the Settings modal's side navigation. */
  async openGradingSettings(): Promise<void> {
    await expect(this.gradingSettingsLink).toBeVisible({ timeout: 30000 });
    await this.gradingSettingsLink.click();
    await expect(this.lotPresetsLink).toBeVisible({ timeout: 30000 });
  }

  /** Clicks "Lot presets" and waits for the preset list to render. */
  async openLotPresets(): Promise<void> {
    await this.lotPresetsLink.click();
    await expect(this.defaultPresetButton).toBeVisible({ timeout: 30000 });
  }

  /** Expands the "Default Preset" accordion so its fields become visible/editable. */
  async openDefaultPreset(): Promise<void> {
    if (await this.maxSlopeInput.isVisible().catch(() => false)) {
      return; // Already expanded.
    }
    await this.defaultPresetButton.click();
    await expect(this.maxSlopeInput).toBeVisible({ timeout: 10000 });
  }

  /** Sets "Max slope" to the given percentage, only touching the field if it differs. */
  async setMaxSlope(value: number): Promise<void> {
    const current = await this.maxSlopeInput.inputValue();
    if (current === String(value)) {
      return;
    }
    // The field doesn't reliably clear its previous value before accepting new input, which can
    // leave old and new digits mixed together (e.g. "6" typed into "6" becoming "66") — clear it
    // explicitly first.
    await this.maxSlopeInput.fill('');
    await this.maxSlopeInput.fill(String(value));
    await this.maxSlopeInput.blur();
  }

  private async ensureToggleOff(toggle: Locator): Promise<void> {
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
      await toggle.click();
    }
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
   * Clicks "Save Changes" only if it's enabled (nothing to save when the fields already matched
   * the desired values). The button unmounts entirely once the save succeeds.
   */
  async saveIfChanged(): Promise<void> {
    if ((await this.saveChangesButton.count()) === 0) {
      return;
    }
    if (await this.saveChangesButton.isEnabled()) {
      await this.saveChangesButton.click();
      await expect(this.saveChangesButton).toHaveCount(0, { timeout: 10000 });
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
}
