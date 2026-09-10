import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';
import { lotBlockFiles } from '../../config/lotBlockFiles';
import { compareOrSaveBaseline } from '../../utils/visualCompare';

test.describe('Lot Block V2 - multi file upload', () => {
  for (const { file, key } of lotBlockFiles) {
    test(`the user can upload "${file}" and process it from lot-block-v2`, async ({ page, context }, testInfo) => {
      test.setTimeout(600000);

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

      // Visual check: first run saves the baseline, later runs compare against it within tolerance.
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-view-all-${key}.png`);

      await lotBlockPage.clickFirstValidGroupOrZone();
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-first-group-${key}.png`);

      await lotBlockPage.openCanvasContextMenu();
      await lotBlockPage.clickSmokeEmAll();
      // The test is successful once grading finishes.
      await lotBlockPage.expectGradingComplete();

      const firstGroupIndex = await lotBlockPage.clickFirstValidGroupOrZone();
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-graded-first-group-${key}.png`);

      await lotBlockPage.clickBack();
      await lotBlockPage.clickFirstValidGroupOrZone(firstGroupIndex + 1);
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-graded-second-group-${key}.png`);

      await lotBlockPage.clickShowLotMesh();
      await lotBlockTab.waitForTimeout(10000);
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-lot-mesh-${key}.png`);

      await lotBlockPage.clickBack();
      await lotBlockPage.clickFirstValidGroupOrZone();
      await compareOrSaveBaseline(lotBlockTab, testInfo, `lot-block-lot-mesh-first-group-${key}.png`);
    });
  }
});
