import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { lotBlockFiles } from '../../config/lotBlockFiles';
import { compareOrSaveBaseline } from '../../utils/visualCompare';
import { recordAndCheckTiming } from '../../utils/timingTracker';

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

      // Measured start-to-finish (recorded in the `finally` below even if the test fails partway)
      // so a slow run against the current environment can be told apart from a genuine visual
      // regression — see recordAndCheckTiming.
      const startedAt = Date.now();
      let appVersion: string | undefined;

      const loginPage = new LoginPage(page);
      const homePage = new HomePage(page);

      try {
        await loginPage.open();
        await loginPage.login(env.defaultUser.username, env.defaultUser.password);
        await loginPage.expectLoggedIn();
        appVersion = await homePage.getAppVersion();

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
        // Dismiss the "Grading complete" toast — left open, it overlaps the canvas in screenshots.
        await lotBlockPage.clickSkipExport();

        // Skip export drops us back on the tree/overview, not inside a solution view — enter the
        // first Group (not a Zone/Pond, which show a different preset panel) so "Solution summary"
        // is available. Right after grading (instead of later, after the heavier 3D-orbit/mesh
        // passes) confirm the preset actually used for grading matches the values
        // grading-settings.setup.ts configured — doing it immediately avoids the tab hang/crash
        // seen on larger files when this ran at the end of the mesh pass.
        await lotBlockPage.clickViewAll();
        await lotBlockPage.expectLeftPanelPopulated();
        await lotBlockPage.clickFirstGroup();
        await lotBlockPage.openSolutionSummary();
        await lotBlockPage.expandPresetsUsed();
        await lotBlockPage.openPresetDetails();
        await lotBlockPage.expectPresetMatchesGradingDefaults();
        await lotBlockPage.closePresetDetails();
        await lotBlockPage.closeSolutionSummary();
        // Leave the solution view the same way the rest of the test does, back to the tree.
        await lotBlockPage.clickBack();

        // Keeps a consistent zoom level across entries: if entering the area left the minimap
        // below 50%, bring it up to 56% before capturing.
        const defaultPrepareForCapture = () => lotBlockPage.ensureMinimapZoomAtLeast(50, 56);

        // Orbits the 3D camera with a right-click drag (single continuous move, then release)
        // before capturing — calibrated (with the slow/smooth movement in orbitWithRightDrag) so a
        // ~130px drag lands on a natural angled view rather than the near edge-on extreme that
        // larger drags produce.
        const orbitBeforeCapture = async () => {
          await lotBlockPage.orbitWithRightDrag([{ dx: 0, dy: -130 }]);
          await lotBlockPage.releaseRightDrag();
          // Move the cursor off the canvas so it doesn't show up (and doesn't trigger hover
          // tooltips/highlights) in the screenshot.
          await lotBlockPage.moveMouseAway();
          // Give the 3D view a moment to finish settling after the orbit before capturing —
          // without this, a slower environment can catch it mid-render.
          await lotBlockTab.waitForTimeout(500);
        };

        // Walks every Group/Zone/Pond entry, capturing a screenshot per entry. Filenames are keyed
        // by each item's own label (not its position in the panel), so the comparison stays correct
        // even if the panel re-sorts entries between runs. `suffix` keeps the passes below (2D,
        // 3D-orbit, mesh) from overwriting each other's baselines.
        const inspectAllAreas = async (
          suffix: string,
          prepareForCapture: () => Promise<void> = defaultPrepareForCapture
        ) => {
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

          for (const { selector, label } of itemsToVisit) {
            await lotBlockPage.clickTreeItem(selector);
            await prepareForCapture();
            await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-inspect-${key}-${label}${suffix}.png`);

            // Clicking a graded Group/Zone opens its solution view; return to the tree before the
            // next entry. Ponds don't navigate away, so this is a no-op for them.
            if (await lotBlockPage.isBackButtonVisible()) {
              await lotBlockPage.clickBack();
            } else {
              await lotBlockPage.clickViewAll();
            }
          }
        };

        // Pass 1: inspect every area with the lot mesh off (default 2D view).
        await inspectAllAreas('');

        // Pass 2: switch to 3D and orbit the camera on each entry before capturing.
        await lotBlockPage.clickViewAll();
        await lotBlockPage.clickSwitchTo3D();
        await inspectAllAreas('-3d', orbitBeforeCapture);

        // Back to 2D before turning on the mesh.
        await lotBlockPage.clickViewAll();
        await lotBlockPage.clickSwitchTo2D();

        // Pass 3: turn on the lot mesh and inspect every area again. The canvas takes a moment to
        // finish rendering the mesh, so give it time before the first screenshot of this pass.
        await lotBlockPage.clickViewAll();
        await lotBlockPage.clickShowLotMesh();
        await lotBlockPage.waitForMeshToRender();
        await inspectAllAreas('-mesh');
      } finally {
        // Recorded even on failure, so a slow run can be correlated with a visual diff from the
        // same run instead of only ever seeing timings for passing runs.
        recordAndCheckTiming(testInfo, key, new URL(env.baseUrl).host, Date.now() - startedAt, appVersion);
      }
    });
  }
});
