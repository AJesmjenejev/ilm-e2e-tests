import { Page, expect } from '@playwright/test';

/**
 * URL routes — use as `pageObject.navigateTo.dashboardCertificates()` etc.
 *
 *   /#/dashboard/certificates  — dashboard certificates tab (count tiles)
 *   /#/dashboard/secrets        — dashboard secrets tab
 *   /#/certificates              — certificate inventory (table, upload)
 */
export class NavigateTo {
  constructor(private readonly page: Page) {}

  async dashboardCertificates(): Promise<void> {
    await this.page.goto('/#/dashboard/certificates');
    await this.page.waitForLoadState('load');
    await expect(this.page).toHaveURL(/#\/dashboard\/certificates/i);
  }

  async dashboardSecrets(): Promise<void> {
    await this.page.goto('/#/dashboard/secrets');
    await this.page.waitForLoadState('load');
    await expect(this.page).toHaveURL(/#\/dashboard\/secrets/i);
  }

  async certificates(): Promise<void> {
    await this.page.goto('/#/certificates');
    await this.page.waitForLoadState('load');
    await expect(this.page).toHaveURL(/#\/certificates/i);
  }
}
