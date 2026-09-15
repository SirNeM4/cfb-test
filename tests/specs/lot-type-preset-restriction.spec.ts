import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { GradingSettingsPage } from '../../pages/GradingSettingsPage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { lotBlockFiles } from '../../config/lotBlockFiles';
import { recordAppVersion } from '../../utils/appVersion';
import { checkScreenshotForNonTypeALots } from '../../utils/lotTypeOcr';

// Restricting a preset to "Lot Type A" should mean every lot graded with it comes back as Type A —
// not B, C, or a mixed "A/B" match. The Solution summary's "Preset Issues" table (LOT TYPE / LOT /
// STATUS) only lists what the app itself decided to flag as a "Mismatch" — which, per manual
// testing, does NOT catch every case where a non-A type actually got applied. So the real check
// here is visual: screenshot the map (after hiding every UI overlay) at a zoom where the "LotN /
// type / FF: ..." labels the app draws directly on the canvas are legible, isolate that label
// text's specific orange color from everything else on the map (grid, ponds, zone labels), and OCR
// it — asserting the recognized text never contains a "B" or "C" (see utils/lotTypeOcr.ts for why
// a plain substring check is enough: "LotN" and "FF: ..." never contain those letters, so a B or C
// found in the isolated text can only be a real type label). The Preset Issues table is still read
// too and included in the failure message as extra (non-authoritative) context.
//
// Only Groups are graded with this preset (Zones/Ponds get the account's default constraint), so
// only Groups are walked here — but because the map is one continuous canvas, clicking into any
// one Group's view still brings neighboring Groups' lots into frame too, which only helps coverage.
//
// Only run against Lake Louisa for now — validated and stable there (see
// [[feedback_new_test_workflow]]). Coleman Ridge and Goose Creek land on a "Latest Civil 3D
// Plugin" dev-tools index page instead of the real lot-block-v2 app after clickLotBlockV2(),
// which needs its own investigation before those two files can run this check too.
// Shares one preset (created once, on whichever file's test gets there first, and reused — never
// deleted) across all of them, so run this file with a single worker: a delete+recreate from one
// parallel worker would otherwise invalidate another's already-made assignment to it.
const PRESET_NAME = 'QA Preset';
const MAP_ZOOM_PERCENT = 62; // small enough to fit several lots in frame, still legible for OCR.
const filesToCheck = lotBlockFiles.filter(({ key }) => key === 'lake-louisa');

for (const { file, key } of filesToCheck) {
  test(`a preset restricted to Lot Type A never grades a lot as Type B or C ("${file}")`, async (
    { page, context },
    testInfo
  ) => {
    test.setTimeout(1200000);

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);

    await loginPage.open();
    await loginPage.login(env.defaultUser.username, env.defaultUser.password);
    await loginPage.expectLoggedIn();
    await recordAppVersion(testInfo, page);

    const [settingsTab] = await Promise.all([
      context.waitForEvent('page', { timeout: 30000 }),
      homePage.clickSettings(),
    ]);
    await settingsTab.waitForLoadState('domcontentloaded', { timeout: 30000 });

    const gradingSettingsPage = new GradingSettingsPage(settingsTab);
    await gradingSettingsPage.openGradingSettings();
    await gradingSettingsPage.openLotPresets();
    await gradingSettingsPage.ensurePresetExists(PRESET_NAME);
    await gradingSettingsPage.openPreset(PRESET_NAME);
    await gradingSettingsPage.ensureOnlyLotTypeAEnabled();
    await gradingSettingsPage.saveIfChanged();

    await settingsTab.reload();
    await gradingSettingsPage.openGradingSettings();
    await gradingSettingsPage.openLotPresets();
    await gradingSettingsPage.openPreset(PRESET_NAME);
    const presetValues = await gradingSettingsPage.getFullPresetValues();
    expect(presetValues.lotTypeAEnabled).toBe(true);
    expect(presetValues.lotTypeBEnabled).toBe(false);
    await settingsTab.close();

    const [lotBlockTab] = await Promise.all([context.waitForEvent('page'), homePage.clickLotBlockV2()]);
    await lotBlockTab.waitForLoadState('domcontentloaded');

    const lotBlockPage = new LotBlockPage(lotBlockTab);
    await lotBlockPage.expectUploadModalVisible();
    await lotBlockPage.selectFile(file);
    await lotBlockPage.submitUpload();
    await lotBlockPage.waitForMapToFinishLoading();
    await lotBlockPage.expectViewAllVisible();
    await lotBlockPage.expectLeftPanelPopulated();
    await lotBlockPage.clickViewAll();

    // Groups get the Type-A-only preset; Zones/Ponds get the default constraint (dynamic —
    // depends on the file and how grading splits it into Areas, so this walks whatever's there).
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

    await lotBlockPage.clickViewAll();
    await lotBlockPage.expectLeftPanelPopulated();

    const groupItems = (await lotBlockPage.listTreeItems()).filter((item) => item.label.startsWith('group-'));
    expect(groupItems.length).toBeGreaterThan(0);

    const violations: { group: string; recognizedText: string }[] = [];
    const presetIssuesByGroup: Record<string, { lotType: string; lot: string; status: string }[]> = {};

    for (const item of groupItems) {
      await lotBlockPage.clickTreeItem(item.selector);

      // Extra (non-authoritative) context for the failure message — see the top-of-file comment
      // on why this alone isn't trusted as the actual check.
      await lotBlockPage.openSolutionSummary();
      presetIssuesByGroup[item.label] = await lotBlockPage.getPresetIssues();
      await lotBlockPage.closeSolutionSummary();

      const screenshotPath = testInfo.outputPath(`lot-type-check-${key}-${item.label}.png`);
      await lotBlockPage.captureCleanMapScreenshot(MAP_ZOOM_PERCENT, screenshotPath);
      await testInfo.attach(`${item.label} map screenshot`, { path: screenshotPath, contentType: 'image/png' });

      const { recognizedText, hasViolation } = await checkScreenshotForNonTypeALots(screenshotPath);
      if (hasViolation) {
        violations.push({ group: item.label, recognizedText });
      }

      // Back to the tree before the next entry — a Group's solution view has no "View all" of
      // its own (that's on the tree panel this replaced), so leaving needs "Back" first.
      if (await lotBlockPage.isBackButtonVisible()) {
        await lotBlockPage.clickBack();
      } else {
        await lotBlockPage.clickViewAll();
      }
      await lotBlockPage.expectLeftPanelPopulated();
    }

    expect(
      violations,
      `Expected every lot graded with "${PRESET_NAME}" (Lot Type A only) to render as Type A on ` +
        `the map, but found a "B" or "C" in the recognized label text for: ` +
        `${JSON.stringify(violations, null, 2)}\n` +
        `For reference, the Solution summary's own (incomplete) "Preset Issues" tables were: ` +
        `${JSON.stringify(presetIssuesByGroup, null, 2)}`
    ).toEqual([]);
  });
}
