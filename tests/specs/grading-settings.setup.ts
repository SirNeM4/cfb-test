import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { GradingSettingsPage, FullPresetValues } from '../../pages/GradingSettingsPage';
import { env } from '../../config/env';
import { recordAppVersion } from '../../utils/appVersion';

// "Default Preset" is shared across the whole account, so leaving any of its fields to whatever a
// previous manual session set them to makes grading (and its visual regression baselines) drift
// between runs. Pin every field to a fixed, known-good configuration instead — matching what the
// account was manually verified to have.
const DEFAULT_PRESET_VALUES: FullPresetValues = {
  frontSetback: 10,
  sideSetback: 5,
  rearSetback: 10,
  rearSetbackMaxSlope: 20,
  sideSetbackMaxSlope: 33,
  minSlope: 1,
  maxSlope: 6,
  maxDrivewaySlope: 15,
  finishedFloorFeetAbove: 1,
  finishedFloorFoundationRise: 0.67,
  referencePoint: 'highest-elevation',
  lotTypeAEnabled: true,
  lotTypeBEnabled: true,
  stemWallsEnabled: false,
  retainingWallsEnabled: false,
  fence: 'No',
  rearYardDrainage: true,
  waterCrossing: true,
  sideYardSwale: 'on',
  rearYardSwale: 'on',
};

// Runs once, before the "chrome" project (see the `dependencies` wiring in playwright.config.ts),
// to make sure the Default Preset's grading options are in the expected state for every spec.
test('grading defaults are configured', async ({ page, context }, testInfo) => {
  test.setTimeout(120000);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.open();
  await loginPage.login(env.defaultUser.username, env.defaultUser.password);
  await loginPage.expectLoggedIn();
  await recordAppVersion(testInfo, page);

  // The "settings" link opens a new tab, just like "lot-block-v2".
  const [settingsTab] = await Promise.all([context.waitForEvent('page'), homePage.clickSettings()]);
  await settingsTab.waitForLoadState('domcontentloaded');

  const gradingSettingsPage = new GradingSettingsPage(settingsTab);
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.openDefaultPreset();

  await gradingSettingsPage.setFullPresetValues(DEFAULT_PRESET_VALUES);
  await gradingSettingsPage.saveIfChanged();

  // Reload and re-open the Default Preset from a clean state, to confirm the values just saved
  // actually persisted (rather than trusting the "Save Changes" button disappearing).
  await settingsTab.reload();
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.openDefaultPreset();
  await gradingSettingsPage.expectFullPresetValues(DEFAULT_PRESET_VALUES);
});
