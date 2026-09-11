import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { GradingSettingsPage } from '../../pages/GradingSettingsPage';
import { env } from '../../config/env';

// Runs once, before the "chrome" project (see the `dependencies` wiring in playwright.config.ts),
// to make sure the Default Preset's grading options are in the expected state for every spec.
test('grading defaults are configured', async ({ page, context }) => {
  test.setTimeout(120000);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.open();
  await loginPage.login(env.defaultUser.username, env.defaultUser.password);
  await loginPage.expectLoggedIn();

  // The "settings" link opens a new tab, just like "lot-block-v2".
  const [settingsTab] = await Promise.all([context.waitForEvent('page'), homePage.clickSettings()]);
  await settingsTab.waitForLoadState('domcontentloaded');

  const gradingSettingsPage = new GradingSettingsPage(settingsTab);
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.openDefaultPreset();

  await gradingSettingsPage.setMaxSlope(6);
  await gradingSettingsPage.ensureStemWallsOff();
  await gradingSettingsPage.ensureRetainingWallsOff();
  await gradingSettingsPage.ensureFenceNo();

  await gradingSettingsPage.saveIfChanged();

  // Reload and re-open the Default Preset from a clean state, to confirm the values just saved
  // actually persisted (rather than trusting the "Save Changes" button disappearing).
  await settingsTab.reload();
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.openDefaultPreset();
  await gradingSettingsPage.expectDefaultsPersisted();
});
