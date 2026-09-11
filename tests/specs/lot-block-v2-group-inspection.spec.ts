import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { lotBlockFiles } from '../../config/lotBlockFiles';
import { compareOrSaveBaseline } from '../../utils/visualCompare';

// Deep visual inspection after grading: since every Group/Zone/Pond within the same Area opens
// the same "Area - Solutions" view, only the first entry per Area needs checking — the rest of
// that Area is skipped. Standalone entries (not nested in any Area) are always checked.
const files = lotBlockFiles;

test.describe('Lot Block V2 - group-by-group inspection', () => {
  for (const { file, key } of files) {
    test(`every group/zone/pond looks the same on entry after grading "${file}"`, async ({
      page,
      context,
    }, testInfo) => {
      test.setTimeout(1200000);

      const loginPage = new LoginPage(page);
      const homePage = new HomePage(page);

      await loginPage.open();
      await loginPage.login(env.defaultUser.username, env.defaultUser.password);
      await loginPage.expectLoggedIn();

      // The "lot-block-v2" link opens a new tab with the upload modal.
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
      await lotBlockPage.clickFirstValidGroupOrZone();

      await lotBlockPage.openCanvasContextMenu();
      await lotBlockPage.clickSmokeEmAll();
      await lotBlockPage.expectGradingComplete();
      // Dismiss the "Grading complete" toast — left open, it overlaps later panels (e.g. the
      // Solution summary) in screenshots.
      await lotBlockPage.clickSkipExport();

      // Walks every Group/Zone/Pond entry, capturing a screenshot per entry. Filenames are keyed
      // by each item's own label (not its position in the panel), so the comparison stays correct
      // even if the panel re-sorts entries between runs. `suffix` keeps the two passes below
      // (mesh off/on) from overwriting each other's baselines. On the last Group entry of the
      // final pass (`verifyPresetOnLastItem`), also confirms the preset actually used for
      // grading matches the Default Preset values set up in grading-settings.setup.ts. Zones and
      // Ponds are skipped for that check: they open a different "zone preset" panel with
      // unrelated fields (grading strategy, drainage), not the Lot-level preset we configured.
      const inspectAllAreas = async (suffix: string, verifyPresetOnLastItem: boolean) => {
        // Reset to a known state (the full tree) before walking every entry one by one.
        await lotBlockPage.clickViewAll();
        await lotBlockPage.expectLeftPanelPopulated();

        const allItems = await lotBlockPage.listTreeItems();
        const visitedAreas = new Set<string>();
        const itemsToVisit = allItems.filter(({ areaLabel }) => {
          if (!areaLabel) {
            return true; // Not in an Area: always check it.
          }
          if (visitedAreas.has(areaLabel)) {
            return false; // Already checked this Area's first entry — same "Area - Solutions" view.
          }
          visitedAreas.add(areaLabel);
          return true;
        });

        let lastGroupIndex = -1;
        if (verifyPresetOnLastItem) {
          for (let i = itemsToVisit.length - 1; i >= 0; i--) {
            if (!itemsToVisit[i].label.startsWith('zone-') && !itemsToVisit[i].label.startsWith('pond-')) {
              lastGroupIndex = i;
              break;
            }
          }
        }

        for (const [index, { selector, label }] of itemsToVisit.entries()) {
          await lotBlockPage.clickTreeItem(selector);
          // Keep a consistent zoom level across entries: if entering the area left the minimap
          // below 50%, bring it up to 56% before capturing.
          await lotBlockPage.ensureMinimapZoomAtLeast(50, 56);
          await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-inspect-${key}-${label}${suffix}.png`);

          if (index === lastGroupIndex) {
            await lotBlockPage.openSolutionSummary();
            await lotBlockPage.expandPresetsUsed();
            await lotBlockPage.openPresetDetails();
            await lotBlockPage.expectPresetMatchesGradingDefaults();
            continue;
          }

          // Clicking a graded Group/Zone opens its solution view; return to the tree before the
          // next entry. Ponds don't navigate away, so this is a no-op for them.
          if (await lotBlockPage.isBackButtonVisible()) {
            await lotBlockPage.clickBack();
          } else {
            await lotBlockPage.clickViewAll();
          }
        }
      };

      // Pass 1: inspect every area with the lot mesh off (default view).
      await inspectAllAreas('', false);

      // Pass 2: turn on the lot mesh and inspect every area again. The canvas takes a moment to
      // finish rendering the mesh, so give it time before the first screenshot of this pass.
      await lotBlockPage.clickViewAll();
      await lotBlockPage.clickShowLotMesh();
      await lotBlockPage.waitForMeshToRender();
      await inspectAllAreas('-mesh', true);
    });
  }
});
