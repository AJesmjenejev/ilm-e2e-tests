import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class DashboardPage extends BasePage {
  readonly certCountTile: Locator;

  constructor(page: Page) {
    super(page);
    this.certCountTile = this.getByTestId('dashboard-counts')
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { name: 'Certificates', exact: true }) });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page).toHaveURL(/#\/dashboard\/certificates/i);
  }

  async getCertificateCount(): Promise<number> {
    await expect(this.certCountTile).toBeVisible();
    const text = await this.certCountTile.innerText();
    const match = text.match(/\d+/);
    if (!match) throw new Error(`Could not parse certificate count from: "${text}"`);
    return parseInt(match[0], 10);
  }

  async navigateToCertificateList(): Promise<void> {
    const link = this.certCountTile.getByRole('link').first();
    await expect(link).toBeVisible();
    await Promise.all([
      this.page.waitForURL(/\/certificates/i, { waitUntil: 'domcontentloaded' }),
      link.click(),
    ]);
  }
}