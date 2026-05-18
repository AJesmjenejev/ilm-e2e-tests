/**
 * TC-02 — Certificates Dashboard (UI layer)
 *
 * Given:  platform running, browser auto-authenticated via Vite proxy (ssl-client-cert)
 * When:   a certificate is imported via the upload dialog, then deleted via inventory UI
 * Then:
 *   1. Certificate count tile increments by 1 after import
 *   2. Tile count matches GET /api/v1/statistics after import
 *   3. Inventory shows the row (by common name / uuid) with correct type badge (X.509)
 *   4. Delete via row checkbox + delete button removes the row
 *   5. Certificate is gone from API (by uuid)
 *   6. Dashboard tile count decreases by 1 and matches statistics
 *
 * Strategy: import through the browser, verify list, verify dashboard, delete in UI, verify API + dashboard.
 */

import { test } from '../../fixtures/keywords';
import {
  CERTIFICATE_TYPE_X509_PATTERN,
  ROOT_CA_COMMON_NAME,
} from '../../utils/constants';
import { ROOT_CA_PEM } from '../../utils/cert';

test.describe('@ui certificate-dashboard', () => {
  test.beforeEach(async ({ page, certificateKeywords, dashboardKeywords }) => {
    certificateKeywords.bindPage(page);
    dashboardKeywords.bindPage(page);
    await certificateKeywords.removeCertificateByCommonNameViaApi(ROOT_CA_COMMON_NAME);
  });

  test.afterEach(async ({ certificateKeywords }) => {
    await certificateKeywords.removeCertificateByCommonNameViaApi(ROOT_CA_COMMON_NAME);
  });

  test('TC-02: import via UI, verify dashboard and list, delete via UI, verify API and dashboard', async ({
    certificateKeywords,
    dashboardKeywords,
  }) => {
    let initialCount: number;
    let uuid: string;
    let countAfterImport: number;

    // Given: open dashboard and read certificate count
    initialCount = await test.step('Open dashboard and read certificate count', () =>
      dashboardKeywords.captureCertificatesTileCount(),
    );

    // When: import certificate via upload dialog in UI
    uuid = await test.step('Import certificate via upload dialog', () =>
      certificateKeywords.uploadCertificateViaUi(ROOT_CA_PEM, ROOT_CA_COMMON_NAME),
    );

    // Then: Certificate added to inventory and additional checks are performed
    await test.step('Verify inventory row by common name and uuid', async () => {
      await certificateKeywords.assertInventoryRowVisible(ROOT_CA_COMMON_NAME);
      await certificateKeywords.assertInventoryRowVisibleByUuid(uuid);
    });

    await test.step('Verify certificate type badge on inventory row', () =>
      certificateKeywords.assertInventoryCertificateTypeByUuid(uuid, CERTIFICATE_TYPE_X509_PATTERN),
    );

    countAfterImport = await test.step('Verify dashboard count increased by one', () =>
      dashboardKeywords.assertCertificatesTileCountIncreasedBy(initialCount, 1),
    );

    await test.step('Verify dashboard count matches statistics API', () =>
      dashboardKeywords.assertCertificatesTileCountMatchesStatisticsViaApi(),
    );

    await test.step('Verify certificates tile links to inventory', () =>
      dashboardKeywords.assertCertificatesTileLinksToInventory(),
    );

    await test.step('Delete certificate via inventory UI', async () => {
      await certificateKeywords.openCertificatesInventory();
      await certificateKeywords.deleteCertificateViaUi(uuid);
    });

    await test.step('Verify row removed from inventory', () =>
      certificateKeywords.assertInventoryRowNotVisibleByUuid(uuid),
    );

    await test.step('Verify certificate removed via API', () =>
      certificateKeywords.assertCertificateDeletedViaApi(uuid),
    );

    await test.step('Verify dashboard count decreased by one', () =>
      dashboardKeywords.assertCertificatesTileCountDecreasedBy(countAfterImport, 1),
    );

    await test.step('Verify dashboard count matches statistics after delete', () =>
      dashboardKeywords.assertCertificatesTileCountMatchesStatisticsViaApi(),
    );
  });
});
