import { expect, Page } from '@playwright/test';
import { DashboardPage } from '../page-objects/DashboardPage';
import { StatisticsClient } from '../utils/api/statistics-client';
import { log } from '../utils/log';

export class DashboardKeywords {
  private dashboardPage?: DashboardPage;
  private browserPage?: Page;

  constructor(
    private readonly statisticsClient: StatisticsClient,
    page?: Page,
  ) {
    if (page) {
      this.bindPage(page);
    }
  }

  bindPage(page: Page): void {
    this.browserPage = page;
    this.dashboardPage = new DashboardPage(page);
  }

  private requireDashboardPage(): DashboardPage {
    if (!this.dashboardPage) {
      throw new Error('UI methods require a Page — use the UI fixture or call bindPage(page)');
    }
    return this.dashboardPage;
  }

  private requireBrowserPage(): Page {
    if (!this.browserPage) {
      throw new Error('UI methods require a Page — use the UI fixture or call bindPage(page)');
    }
    return this.browserPage;
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  async getCertificatesTileCount(): Promise<number> {
    const page = this.requireDashboardPage();
    await expect(page.certificatesTile).toBeVisible();
    const text = await page.certificatesTile.innerText();
    const match = text.match(/\d+/);
    if (!match) throw new Error(`Could not parse certificate count from: "${text}"`);
    return parseInt(match[0], 10);
  }

  async captureCertificatesTileCount(): Promise<number> {
    log.step('open dashboard certificates tab');
    await this.requireDashboardPage().navigateTo.dashboardCertificates();
    const count = await this.getCertificatesTileCount();
    log.ok(`certificates tile count: ${count}`);
    return count;
  }

  async captureCertificatesTileCountAfterReload(): Promise<number> {
    log.step('reload dashboard certificates tab');
    await this.requireDashboardPage().navigateTo.dashboardCertificates();
    await this.requireBrowserPage().reload();
    return this.getCertificatesTileCount();
  }

  async assertCertificatesTileCountIncreasedBy(previousCount: number, increaseBy: number): Promise<number> {
    const newCount = await this.captureCertificatesTileCountAfterReload();
    log.info(`tile count: ${previousCount} → ${newCount}`);
    expect(newCount, `Tile count should increase by ${increaseBy}`).toBe(previousCount + increaseBy);
    return newCount;
  }

  async assertCertificatesTileCountDecreasedBy(previousCount: number, decreaseBy: number): Promise<number> {
    const newCount = await this.captureCertificatesTileCountAfterReload();
    log.info(`tile count: ${previousCount} → ${newCount}`);
    expect(newCount, `Tile count should decrease by ${decreaseBy}`).toBe(previousCount - decreaseBy);
    return newCount;
  }

  async assertCertificatesTileLinksToInventory(): Promise<void> {
    const href = await this.requireDashboardPage()
      .certificatesTile.getByRole('link')
      .first()
      .getAttribute('href');
    log.info(`certificates tile link: ${href}`);
    expect(href, 'Tile link should point to certificate inventory').toMatch(/certificates/i);
  }

  async openCertificatesInventory(): Promise<void> {
    log.step('open certificate inventory');
    await this.requireDashboardPage().navigateTo.certificates();
    await expect(this.requireBrowserPage()).toHaveURL(/#\/certificates/i);
  }

  // ── UI + API ────────────────────────────────────────────────────────────────

  async assertCertificatesTileCountMatchesStatisticsViaApi(): Promise<void> {
    log.step('compare tile count with statistics API');
    const stats = await this.statisticsClient.get();
    const tileCount = await this.getCertificatesTileCount();
    log.info(`statistics API: ${stats.totalCertificates} | tile: ${tileCount}`);
    expect(tileCount, 'Tile count should match statistics API').toBe(stats.totalCertificates);
  }
}
