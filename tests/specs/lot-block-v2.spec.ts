import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { LotBlockPage } from '../../pages/LotBlockPage';
import { env } from '../../config/env';

const FILE_TO_UPLOAD = 'Lake Louisa without sidewalk.json';

test.describe('Lot Block V2 - file upload', () => {
  test('the user can upload a file and process it from lot-block-v2', async ({ page, context }) => {
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

    await lotBlockPage.selectFile(FILE_TO_UPLOAD);
    await lotBlockPage.submitUpload();

    await lotBlockTab.waitForTimeout(15000);

    await lotBlockPage.expectViewAllVisible();
  });
});
