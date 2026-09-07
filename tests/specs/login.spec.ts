import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { env } from '../../config/env';

test.describe('Login', () => {
  test('the login page shows the sign in button', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.open();
    await loginPage.expectLoginButtonVisible();
  });

  test('the user can sign in with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.open();
    await loginPage.login(env.defaultUser.username, env.defaultUser.password);
    await loginPage.expectLoggedIn();
  });
});
