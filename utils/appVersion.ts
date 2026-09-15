import { Page, TestInfo } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * Reads the app's "Source: <environment> · v<version>" label from the home page (call this right
 * after login, since that's where the label lives) and records it as an 'app-version' annotation
 * so utils/testRunReporter.ts can show which build every test ran against — not just the ones
 * that also track grading duration via utils/timingTracker.ts.
 */
export async function recordAppVersion(testInfo: TestInfo, page: Page): Promise<string> {
  const version = await new HomePage(page).getAppVersion();
  testInfo.annotations.push({ type: 'app-version', description: version });
  return version;
}
