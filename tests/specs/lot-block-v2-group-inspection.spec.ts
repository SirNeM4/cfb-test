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

      // Reset to a known state (the full tree) before walking every entry one by one.
      await lotBlockPage.clickViewAll();

      // Filenames are keyed by each item's own label (not its position in the panel), so the
      // comparison stays correct even if the panel re-sorts entries between runs.
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
        // Keep a consistent zoom level across entries: if entering the area left the minimap
        // below 50%, bring it up to 56% before capturing.
        await lotBlockPage.ensureMinimapZoomAtLeast(50, 56);
        await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-inspect-${key}-${label}.png`);

        // Clicking a graded Group/Zone opens its solution view; return to the tree before the
        // next entry. Ponds don't navigate away, so this is a no-op for them.
        if (await lotBlockPage.isBackButtonVisible()) {
          await lotBlockPage.clickBack();
        } else {
          await lotBlockPage.clickViewAll();
        }
      }
    });
  }
});
