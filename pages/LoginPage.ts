import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  private readonly usernameInput = this.page.locator('#username');
  private readonly passwordInput = this.page.locator('#current-password');
  private readonly signInButton = this.page.getByRole('button', { name: /sign in/i });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/login');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoginButtonVisible(): Promise<void> {
    await expect(this.signInButton).toBeVisible({ timeout: 10000 });
  }

  /** Fills the login form and clicks "Sign In". */
  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async expectLoggedIn(): Promise<void> {
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  }
}
