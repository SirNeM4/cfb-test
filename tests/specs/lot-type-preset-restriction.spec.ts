import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { GradingSettingsPage } from '../../pages/GradingSettingsPage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { lotBlockFiles } from '../../config/lotBlockFiles';
import { recordAppVersion } from '../../utils/appVersion';
import { checkScreenshotForDisallowedLotTypes, LotType } from '../../utils/lotTypeOcr';

// Restricting a preset to a single Lot Type should mean every lot graded with it comes back as
// that type only — not any other, or a mixed "A/B"-style match. The Solution summary's "Preset
// Issues" table (LOT TYPE / LOT / STATUS) only lists what the app itself decided to flag as a
// "Mismatch" — which, per manual testing, does NOT catch every case where a disallowed type
// actually got applied. So the real check here is visual: screenshot the map (after hiding every
// UI overlay) at a zoom where the "LotN / type / FF: ..." labels the app draws directly on the
// canvas are legible, isolate that label text's specific orange color from everything else on the
// map (grid, ponds, zone labels), and OCR it — asserting the recognized text never contains a
// letter for any type OTHER than the one the preset was restricted to (see utils/lotTypeOcr.ts for
// why a plain substring check is enough: "LotN" and "FF: ..." never contain the letters A, B, or
// C, so a disallowed one found in the isolated text can only be a real type label). The Preset
// Issues table is still read too and included in the failure message as extra, non-authoritative
// context.
//
// Only Groups are graded with a Lot preset (Zones/Ponds get the account's default constraint), so
// only Groups are walked here — but because the map is one continuous canvas, clicking into any
// one Group's view still brings neighboring Groups' lots into frame too, which only helps coverage.
//
// Only run against Lake Louisa for now — validated and stable there (see
// [[feedback_new_test_workflow]]). Coleman Ridge and Goose Creek land on a "Latest Civil 3D
// Plugin" dev-tools index page instead of the real lot-block-v2 app after clickLotBlockV2(),
// which needs its own investigation before those two files can run this check too.
const MAP_ZOOM_PERCENT = 62; // small enough to fit several lots in frame, still legible for OCR.
const filesToCheck = lotBlockFiles.filter(({ key }) => key === 'lake-louisa');

const CASES: { presetName: string; lotType: LotType; configurePreset: (gsp: GradingSettingsPage) => Promise<void> }[] = [
  { presetName: 'QA Preset', lotType: 'A', configurePreset: (gsp) => gsp.ensureOnlyLotTypeAEnabled() },
  {
    presetName: 'QAlotB',
    lotType: 'B',
    // Only these 4 explicitly changed when the preset is created — everything else (setbacks,
    // drainage slopes, fence, water flow, swale position, ...) is left at whatever it defaults to.
    configurePreset: async (gsp) => {
      await gsp.ensureOnlyLotTypeBEnabled();
      await gsp.ensureStemWallsOff();
      await gsp.ensureRetainingWallsOff();
      await gsp.ensureReferencePointHighestElevation();
    },
  },
];

for (const { presetName, lotType, configurePreset } of CASES) {
  for (const { file, key } of filesToCheck) {
    test(`a preset restricted to Lot Type ${lotType} never grades a lot as another type ("${file}")`, async (
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
      await gradingSettingsPage.ensurePresetExists(presetName);
      await gradingSettingsPage.openPreset(presetName);
      await configurePreset(gradingSettingsPage);
      await gradingSettingsPage.saveIfChanged();

      await settingsTab.reload();
      await gradingSettingsPage.openGradingSettings();
      await gradingSettingsPage.openLotPresets();
      await gradingSettingsPage.openPreset(presetName);
      const presetValues = await gradingSettingsPage.getFullPresetValues();
      expect(presetValues.lotTypeAEnabled).toBe(lotType === 'A');
      expect(presetValues.lotTypeBEnabled).toBe(lotType === 'B');
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

      // Groups get the single-type-only preset; Zones/Ponds get the default constraint (dynamic —
      // depends on the file and how grading splits it into Areas, so this walks whatever's there).
      const allItems = await lotBlockPage.listTreeItems();
      const itemsInAreas = allItems.filter((item) => item.areaLabel !== null);
      for (const item of itemsInAreas) {
        await lotBlockPage.clickTreeItem(item.selector);
        if (item.label.startsWith('zone-') || item.label.startsWith('pond-')) {
          await lotBlockPage.applyDefaultConstraintToSelection();
        } else {
          await lotBlockPage.assignPresetToSelection(presetName);
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

        const screenshotPath = testInfo.outputPath(`lot-type-check-${lotType}-${key}-${item.label}.png`);
        await lotBlockPage.captureCleanMapScreenshot(MAP_ZOOM_PERCENT, screenshotPath);
        await testInfo.attach(`${item.label} map screenshot`, { path: screenshotPath, contentType: 'image/png' });

        const { recognizedText, hasViolation } = await checkScreenshotForDisallowedLotTypes(screenshotPath, lotType);
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
        `Expected every lot graded with "${presetName}" (Lot Type ${lotType} only) to render as ` +
          `Type ${lotType} on the map, but found a different type's letter in the recognized ` +
          `label text for: ${JSON.stringify(violations, null, 2)}\n` +
          `For reference, the Solution summary's own (incomplete) "Preset Issues" tables were: ` +
          `${JSON.stringify(presetIssuesByGroup, null, 2)}`
      ).toEqual([]);
    });
  }
}
