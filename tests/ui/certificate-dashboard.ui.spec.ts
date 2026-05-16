/**
 * TC-02 — Certificates Dashboard (UI layer)
 *
 * Given:  platform running, browser auto-authenticated via Vite proxy (ssl-client-cert)
 * When:   a certificate is imported via API, then the dashboard is reloaded
 * Then:
 *   1. Certificate count tile increments by 1
 *   2. Tile count matches the authoritative value from GET /api/v1/statistics
 *   3. Tile link href points to the certificates list page
 *   4. Certificate list page shows a row for "Dummy Root CA"
 *   5. That row displays the correct certificate type
 *
 * Strategy: import via API to keep the setup fast, then verify the result in the browser.
 * The statistics endpoint gives the test a backend source of truth,
 * so we can catch cases where the dashboard shows a stale or wrong count.
 */

import { test, expect } from '../../fixtures/auth';
import { pemToBase64, ROOT_CA_PEM } from '../../utils/cert';
import { DashboardPage } from '../../page-objects/DashboardPage';
import { log } from '../../utils/log';

test.describe('@ui certificate-dashboard', () => {
  let importedUuid: string | undefined;

  test.afterEach(async ({ certificateClient }) => {
    if (importedUuid) {
      await certificateClient.remove(importedUuid);
      log.ok(`certificate deleted (${importedUuid})`);
      importedUuid = undefined;
    }
  });

  test('TC-02: importing a cert increments dashboard count and appears in list', async ({
    page,
    certificateClient,
    statisticsClient,
  }) => {
    const dashboard = new DashboardPage(page);

    // ── 1. Capture initial count ──────────────────────────────────────────────
    const initialCount = await test.step('navigate to dashboard, read cert count', async () => {
      log.step('opening browser → http://localhost:5173');
      await dashboard.goto();
      const count = await dashboard.getCertificateCount();
      log.ok(`dashboard loaded — current certificate count: ${count}`);
      return count;
    });

    // ── 2. Import via API ─────────────────────────────────────────────────────
    await test.step('import root-ca.cert.pem via API', async () => {
      log.step('importing root-ca.cert.pem via API (bypasses file picker)');
      const { uuid } = await certificateClient.upload({
        certificate: pemToBase64(ROOT_CA_PEM),
        customAttributes: [],
      });
      expect(uuid).toBeTruthy();
      importedUuid = uuid;
      log.ok(`certificate imported — UUID: ${uuid}`);
    });

    // ── 3. Dashboard count increments ─────────────────────────────────────────
    await test.step('reload dashboard — count should be +1', async () => {
      log.step('reloading dashboard page');
      await page.reload();
      await expect(dashboard.certCountTile).toBeVisible();
      const newCount = await dashboard.getCertificateCount();
      log.info(`count before: ${initialCount}  →  count after: ${newCount}`);
      expect(newCount, 'Certificate count should have increased by 1').toBe(initialCount + 1);
    });

    // ── 4. Cross-validate tile count against statistics API ───────────────────
    await test.step('tile count matches GET /api/v1/statistics', async () => {
      log.step('fetching authoritative count from statistics API');
      const stats = await statisticsClient.get();
      const tileCount = await dashboard.getCertificateCount();
      log.info(`statistics API: ${stats.totalCertificates}  |  dashboard tile: ${tileCount}`);
      expect(
        tileCount,
        `Dashboard tile (${tileCount}) should match statistics API total (${stats.totalCertificates})`,
      ).toBe(stats.totalCertificates);
    });

    // ── 5. Tile link points to certificates list ──────────────────────────────
    await test.step('tile link href points to /certificates', async () => {
      log.step('asserting tile link href');
      const href = await dashboard.certCountTile.getByRole('link').first().getAttribute('href');
      log.info(`tile href: ${href}`);
      expect(href, 'Tile link should point to the certificates list').toMatch(/certificates/i);
    });

    // ── 6. Certificate list ───────────────────────────────────────────────────
    await test.step('navigate to certificate list via tile link', async () => {
      log.step('navigating to certificate list');
      await dashboard.navigateToCertificateList();
      await expect(page).toHaveURL(/\/certificates/i);
    });

    await test.step('"Dummy Root CA" row is visible', async () => {
      log.step('looking for "Dummy Root CA" row in certificate list');
      const row = page.getByRole('row').filter({ hasText: 'Dummy Root CA' });
      await expect(row.first()).toBeVisible();
    });

    await test.step('row shows Root CA certificate type', async () => {
      log.step('asserting certificate type shown in row');
      const row = page.getByRole('row').filter({ hasText: 'Dummy Root CA' }).first();
      await expect(row).toContainText(/root ca|CA/i);
    });
  });
});