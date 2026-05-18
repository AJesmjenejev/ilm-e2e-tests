/**
 * TC-01 — Certificate import (API layer)
 *
 * Given:  platform running, authenticated as Administrator
 * When:   POST /api/v1/certificates/upload returns 2xx with a UUID for root-ca.cert.pem
 * Then:
 *   1. Certificate appears in POST /api/v1/certificates list
 *   2. GET /api/v1/certificates/{uuid} → commonName === "Dummy Root CA"
 *   3. GET /api/v1/certificates/{uuid} → certificateType is X.509
 *
 * Cleanup: imported certificate is deleted in afterEach (test isolation).
 */

import { test } from '../../fixtures/keywords';
import {
  CERTIFICATE_TYPE_X509_PATTERN,
  ROOT_CA_COMMON_NAME,
} from '../../utils/constants';
import { ROOT_CA_PEM } from '../../utils/cert';

test.describe('@api certificate-import', () => {
  let importedUuid: string | undefined;

  test.afterEach(async ({ certificateKeywords }) => {
    if (importedUuid) {
      await certificateKeywords.removeCertificateByUuidViaApi(importedUuid);
      importedUuid = undefined;
    }
  });

  test('TC-01: import root-ca.cert.pem — UUID returned, properties correct, appears in list', async ({
    certificateKeywords,
  }) => {
    let uuid: string;
    // Given: Certificate "Dummy Root CA"
    // When: Upload certificate via API
    uuid = await test.step('Upload certificate', () =>
      certificateKeywords.importCertificateViaApi(ROOT_CA_PEM),
    );
    importedUuid = uuid;

    // Then: Certificate added via API and properties are correct
    await test.step('Verify certificate appears in list', () =>
      certificateKeywords.assertCertificateInListViaApi(uuid),
    );

    await test.step('Verify certificate properties', () =>
      certificateKeywords.assertCertificatePropertiesViaApi(uuid, {
        commonName: ROOT_CA_COMMON_NAME,
        certificateType: CERTIFICATE_TYPE_X509_PATTERN,
      }),
    );
  });
});
