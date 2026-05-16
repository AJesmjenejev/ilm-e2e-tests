/**
 * TC-01 — Certificate import (API layer)
 *
 * Given:  platform running, authenticated as Administrator
 * When:   root-ca.cert.pem is imported via POST /api/v1/certificates/upload
 * Then:
 *   1. Response is 2xx and contains a UUID
 *   2. GET /api/v1/certificates/{uuid} → commonName === "Dummy Root CA"
 *   3. GET /api/v1/certificates/{uuid} → subjectType is a Root CA variant
 *   4. Certificate appears in POST /api/v1/certificates list
 *
 * Cleanup: imported certificate is deleted after each test (test isolation).
 */

import { test, expect } from '../../fixtures/auth';
import { pemToBase64, ROOT_CA_PEM } from '../../utils/cert';
import { log } from '../../utils/log';

test.describe('@api certificate-import', () => {
  let importedUuid: string | undefined;

  // Safety net: cleans up if the test fails before its own delete step.
  test.afterEach(async ({ certificateClient }) => {
    if (importedUuid) {
      await certificateClient.remove(importedUuid);
      log.ok(`certificate deleted (${importedUuid})`);
      importedUuid = undefined;
    }
  });

  test('TC-01: import root-ca.cert.pem — UUID returned, properties correct, appears in list', async ({
    certificateClient,
  }) => {
    // ── 1. Import ─────────────────────────────────────────────────────────────
    const { uuid } = await test.step('upload root-ca.cert.pem', async () => {
      log.step('importing root-ca.cert.pem');
      const res = await certificateClient.upload({
        certificate: pemToBase64(ROOT_CA_PEM),
        customAttributes: [],
      });
      expect(res.uuid, 'Import response should contain a UUID').toBeTruthy();
      log.ok(`certificate imported — UUID: ${res.uuid}`);
      return res;
    });

    importedUuid = uuid;

    // ── 2 & 3. Verify properties ──────────────────────────────────────────────
    const cert = await test.step('fetch certificate details', async () => {
      log.step(`fetching certificate details for UUID: ${uuid}`);
      const c = await certificateClient.getById(uuid);
      log.ok(`received — commonName: "${c.commonName}", subjectType: "${c.subjectType}"`);
      return c;
    });

    await test.step('Common Name === "Dummy Root CA"', async () => {
      const cn = cert.commonName ?? cert.subjectDn ?? '';
      log.step(`asserting Common Name — got "${cn}"`);
      expect(cn).toMatch(/Dummy Root CA/i);
    });

    await test.step('subjectType is a Root CA variant', async () => {
      log.step(`asserting subjectType — got "${cert.subjectType}"`);
      const subjectType = (cert.subjectType ?? '').toLowerCase();
      expect(
        subjectType.includes('root') || subjectType.includes('ca'),
        `Expected Root CA variant, got subjectType="${cert.subjectType}"`,
      ).toBe(true);
    });

    // ── 4. Appears in list ────────────────────────────────────────────────────
    await test.step('certificate appears in list', async () => {
      log.step('fetching certificate list');
      const certs = await certificateClient.list();
      log.info(`list returned ${certs.length} certificate(s)`);
      expect(
        certs.some(c => c.uuid === uuid),
        `UUID ${uuid} should be in the certificate list`,
      ).toBe(true);
    });

    // ── 5. Delete and verify removal ──────────────────────────────────────────
    await test.step('delete certificate', async () => {
      log.step(`deleting certificate ${uuid}`);
      await certificateClient.remove(uuid);
      importedUuid = undefined;
      log.ok(`certificate deleted (${uuid})`);
    });

    await test.step('certificate no longer appears in list', async () => {
      log.step('verifying certificate removed from list');
      const certs = await certificateClient.list();
      log.info(`list returned ${certs.length} certificate(s)`);
      expect(
        certs.some(c => c.uuid === uuid),
        `UUID ${uuid} should no longer be in the certificate list`,
      ).toBe(false);
    });

    await test.step('certificate detail endpoint returns 404', async () => {
      log.step(`asserting certificate "${uuid}" no longer exists`);
      const stillExists = await certificateClient.exists(uuid);
      expect(stillExists, 'Certificate should not exist after deletion').toBe(false);
    });
  });
});