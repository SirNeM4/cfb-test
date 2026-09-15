import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { GradingSettingsPage } from '../../pages/GradingSettingsPage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { recordAppVersion } from '../../utils/appVersion';

// One-off (Lake Louisa only, the fastest file — see [[feedback_new_test_workflow]]): creates a
// custom Lot preset (deleting a stale one from a previous run first, so this stays idempotent
// instead of accumulating duplicates) and explicitly edits a handful of fields on it: restrict it
// to Lot Type A only, turn stem walls / retaining walls / fence off, and pin the PAD & Finished
// Floor reference point to "Highest Elevation Point of the Lot" (this one's deliberately a real
// requirement, not just captured, since relying on whatever a fresh preset defaults to here would
// silently pass even if it inherited the wrong value — which is exactly what happened once).
// Every other field is left at whatever a freshly-created preset defaults to — this test reads
// that actual value dynamically (rather than assuming one) so it can confirm the SAME value shows
// up later in the graded Solution Summary, proving the whole preset (edited fields and untouched
// ones alike) really gets applied during grading, not just the fields this test happens to change.
// The preset is intentionally left in place afterward (not deleted) for later inspection.
//
// The set of Groups/Zones/Ponds is dynamic — it depends on the uploaded file and how grading
// splits it up — so this walks whatever `listTreeItems()` finds rather than hardcoding names.
const PRESET_NAME = 'QA Preset';

test('custom Lot preset is created, edited, assigned per-Group, and applied during grading', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(600000);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.open();
  await loginPage.login(env.defaultUser.username, env.defaultUser.password);
  await loginPage.expectLoggedIn();
  await recordAppVersion(testInfo, page);

  // --- Settings: create/edit the custom Lot preset, from a clean slate ---
  const [settingsTab] = await Promise.all([
    context.waitForEvent('page', { timeout: 30000 }),
    homePage.clickSettings(),
  ]);
  await settingsTab.waitForLoadState('domcontentloaded', { timeout: 30000 });

  const gradingSettingsPage = new GradingSettingsPage(settingsTab);
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.ensureFreshPreset(PRESET_NAME);
  await gradingSettingsPage.openPreset(PRESET_NAME);

  await gradingSettingsPage.ensureOnlyLotTypeAEnabled();
  await gradingSettingsPage.ensureStemWallsOff();
  await gradingSettingsPage.ensureRetainingWallsOff();
  await gradingSettingsPage.ensureFenceNo();
  await gradingSettingsPage.ensureReferencePointHighestElevation();

  // Snapshot every field on the preset — the three just edited above, and whatever the untouched
  // ones (Lot Setbacks, drainage slopes, PAD/finished floor, water crossing, swale position, ...)
  // happen to default to — as the single source of truth this test compares against, both after
  // reload and later in the graded Solution Summary.
  const presetValues = await gradingSettingsPage.getFullPresetValues();
  await gradingSettingsPage.saveIfChanged();

  // Confirm it actually persisted before relying on it during grading.
  await settingsTab.reload();
  await gradingSettingsPage.openGradingSettings();
  await gradingSettingsPage.openLotPresets();
  await gradingSettingsPage.openPreset(PRESET_NAME);
  await gradingSettingsPage.expectFullPresetValues(presetValues);

  // --- lot-block-v2: assign the preset per Group, default constraints per Zone/Pond, grade ---
  // "Settings" and "lot-block-v2" both open into the same named popup window. With the Settings
  // tab still open, clicking "lot-block-v2" just navigates that existing window to the new URL
  // instead of opening a genuinely new one — so no "page" event ever fires. Close it first so the
  // click behaves like it normally would, opening a fresh tab.
  await settingsTab.close();
  const [lotBlockTab] = await Promise.all([context.waitForEvent('page'), homePage.clickLotBlockV2()]);
  await lotBlockTab.waitForLoadState('domcontentloaded');

  const lotBlockPage = new LotBlockPage(lotBlockTab);
  await lotBlockPage.expectUploadModalVisible();
  await lotBlockPage.selectFile('Lake Louisa without sidewalk.json');
  await lotBlockPage.submitUpload();

  await lotBlockPage.waitForMapToFinishLoading();
  await lotBlockPage.expectViewAllVisible();
  await lotBlockPage.expectLeftPanelPopulated();
  await lotBlockPage.clickViewAll();

  // Walk every Group/Zone/Pond found in the tree (dynamic — depends on the file and how grading
  // splits it into Areas). Groups get the custom preset; Zones/Ponds get the default constraint.
  const allItems = await lotBlockPage.listTreeItems();
  const itemsInAreas = allItems.filter((item) => item.areaLabel !== null);

  for (const item of itemsInAreas) {
    await lotBlockPage.clickTreeItem(item.selector);
    if (item.label.startsWith('zone-') || item.label.startsWith('pond-')) {
      await lotBlockPage.applyDefaultConstraintToSelection();
    } else {
      await lotBlockPage.assignPresetToSelection(PRESET_NAME);
    }
  }

  expect(await lotBlockPage.isAreaSubmitReady()).toBe(true);
  await lotBlockPage.submitAreaForGrading();
  await lotBlockPage.waitForAreaGradingComplete();

  // --- Verify the custom preset was actually applied to a graded Group's solution ---
  await lotBlockPage.clickViewAll();
  await lotBlockPage.expectLeftPanelPopulated();
  await lotBlockPage.clickFirstGroup();

  await lotBlockPage.openSolutionSummary();
  await lotBlockPage.expandPresetsUsed();
  await lotBlockPage.openPresetDetails();

  // Verify every field this test tracks — the ones it explicitly edited (walls, fence) and the
  // ones it only captured from the fresh preset's real defaults (setbacks, drainage slopes, PAD,
  // water flow, swale position) — actually made it into the graded solution's applied preset.
  await lotBlockPage.expectPresetDetailValue(
    'front setback distance to property line',
    `${presetValues.frontSetback} ft`
  );
  await lotBlockPage.expectPresetDetailValue(
    'side setback distance to property line',
    `${presetValues.sideSetback} ft`
  );
  await lotBlockPage.expectPresetDetailValue(
    'rear setback distance to property line',
    `${presetValues.rearSetback} ft`
  );
  await lotBlockPage.expectPresetDetailValue(
    'rear setback to property line max slope',
    `${presetValues.rearSetbackMaxSlope}%`
  );
  await lotBlockPage.expectPresetDetailValue(
    'side setback to property line max slope',
    `${presetValues.sideSetbackMaxSlope}%`
  );
  await lotBlockPage.expectPresetDetailValue('minimum slope', `${presetValues.minSlope}%`);
  await lotBlockPage.expectPresetDetailValue('max allowed slope', `${presetValues.maxSlope}%`);
  await lotBlockPage.expectPresetDetailValue('max allowed driveway slope', `${presetValues.maxDrivewaySlope}%`);
  await lotBlockPage.expectPresetDetailValue('allow stem walls?', presetValues.stemWallsEnabled ? 'Yes' : 'No');
  await lotBlockPage.expectPresetDetailValue(
    'allow retaining walls?',
    presetValues.retainingWallsEnabled ? 'Yes' : 'No'
  );
  await lotBlockPage.expectPresetDetailValue(
    'additional feet above reference point',
    `${presetValues.finishedFloorFeetAbove} ft`
  );
  await lotBlockPage.expectPresetDetailValue('pad elevation', `${presetValues.finishedFloorFoundationRise} ft`);
  await lotBlockPage.expectPresetDetailValue(
    'reference point',
    presetValues.referencePoint === 'highest-elevation' ? 'Highest Elevation Point of the Lot' : 'Road Center line',
    true
  );
  await lotBlockPage.expectPresetDetailValue(
    'allow rear yard drainage?',
    presetValues.rearYardDrainage ? 'Yes' : 'No'
  );
  await lotBlockPage.expectPresetDetailValue(
    'allow water crossing between lots',
    presetValues.waterCrossing ? 'Yes' : 'No'
  );
  await lotBlockPage.expectPresetDetailValue('do you want a fence?', presetValues.fence);
  await lotBlockPage.expectPresetDetailValue(
    'side yard swale position',
    presetValues.sideYardSwale === 'on' ? 'Swales placed ON lot line' : 'Swales placed OFF lot line'
  );
  await lotBlockPage.expectPresetDetailValue(
    'rear yard swale position',
    presetValues.rearYardSwale === 'on' ? 'Swales placed ON lot line' : 'Swales placed OFF lot line'
  );

  await lotBlockPage.closePresetDetails();
  await lotBlockPage.closeSolutionSummary();
});
