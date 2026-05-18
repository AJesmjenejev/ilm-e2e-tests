import * as path from 'path';
import { expect, Locator, Page } from '@playwright/test';
import { CertificatesPage } from '../page-objects/CertificatesPage';
import { CertificateClient } from '../utils/api/certificate-client';
import { CertificateDto } from '../types/certificate';
import { pemToBase64 } from '../utils/cert';
import { log } from '../utils/log';

const LIST_PAGE_SIZE = 1000;

export interface ExpectedCertificateProperties {
  commonName: string | RegExp;
  certificateType?: string | RegExp;
}

export class CertificateKeywords {
  private certificatesPage?: CertificatesPage;

  constructor(
    private readonly certificateClient: CertificateClient,
    page?: Page,
  ) {
    if (page) {
      this.bindPage(page);
    }
  }

  bindPage(page: Page): void {
    this.certificatesPage = new CertificatesPage(page);
  }

  private requireCertificatesPage(): CertificatesPage {
    if (!this.certificatesPage) {
      throw new Error('UI methods require a Page — use the UI fixture or call bindPage(page)');
    }
    return this.certificatesPage;
  }

  private inventoryRowByCommonName(commonName: string): Locator {
    return this.requireCertificatesPage().rowByCommonName(commonName);
  }

  private inventoryRowByUuid(uuid: string): Locator {
    return this.requireCertificatesPage().rowByUuid(uuid);
  }

  private async listCertificatesViaApi() {
    return this.certificateClient.list({ itemsPerPage: LIST_PAGE_SIZE, pageNumber: 1 });
  }

  // ── API ─────────────────────────────────────────────────────────────────────

  async importCertificateViaApi(pemPath: string): Promise<string> {
    log.step(`importing certificate — ${path.basename(pemPath)}`);
    const { uuid } = await this.certificateClient.upload({
      certificate: pemToBase64(pemPath),
      customAttributes: [],
    });
    expect(uuid, 'Import response should contain a UUID').toBeTruthy();
    log.ok(`certificate imported — UUID: ${uuid}`);
    return uuid;
  }

  async getCertificateViaApi(uuid: string): Promise<CertificateDto> {
    log.step(`fetching certificate details for UUID: ${uuid}`);
    const cert = await this.certificateClient.getById(uuid);
    log.ok(
      `received — commonName: "${cert.commonName}", certificateType: "${cert.certificateType}"`,
    );
    return cert;
  }

  async assertCertificatePropertiesViaApi(
    uuid: string,
    expected: ExpectedCertificateProperties,
  ): Promise<void> {
    const cert = await this.getCertificateViaApi(uuid);
    const cn = cert.commonName ?? cert.subjectDn ?? '';
    log.step(`asserting Common Name — got "${cn}"`);
    expect(cn).toMatch(expected.commonName);
    if (expected.certificateType) {
      log.step(`asserting certificateType — got "${cert.certificateType}"`);
      expect(
        cert.certificateType ?? '',
        `Unexpected certificateType="${cert.certificateType}"`,
      ).toMatch(expected.certificateType);
    }
  }

  async assertCertificateInListViaApi(uuid: string): Promise<void> {
    log.step('fetching certificate list');
    const certs = await this.listCertificatesViaApi();
    log.info(`list returned ${certs.length} certificate(s)`);
    expect(
      certs.some((c) => c.uuid === uuid),
      `UUID ${uuid} should be in the certificate list`,
    ).toBe(true);
  }

  async assertCertificateNotInListViaApi(uuid: string): Promise<void> {
    log.step('verifying certificate removed from list');
    const certs = await this.listCertificatesViaApi();
    log.info(`list returned ${certs.length} certificate(s)`);
    expect(
      certs.some((c) => c.uuid === uuid),
      `UUID ${uuid} should no longer be in the certificate list`,
    ).toBe(false);
  }

  async assertCertificateNotExistsViaApi(uuid: string): Promise<void> {
    log.step(`asserting certificate "${uuid}" no longer exists`);
    const stillExists = await this.certificateClient.exists(uuid);
    expect(stillExists, 'Certificate should not exist after deletion').toBe(false);
  }

  async removeCertificateByUuidViaApi(uuid: string): Promise<void> {
    log.step(`deleting certificate ${uuid}`);
    await this.certificateClient.remove(uuid);
    log.ok(`certificate removed (${uuid})`);
  }

  async removeCertificateByCommonNameViaApi(commonName: string): Promise<void> {
    const pattern = new RegExp(commonName, 'i');
    const matches = (await this.listCertificatesViaApi()).filter((cert) =>
      pattern.test(cert.commonName ?? cert.subjectDn ?? ''),
    );
    for (const cert of matches) {
      await this.removeCertificateByUuidViaApi(cert.uuid);
    }
    if (matches.length > 0) {
      log.ok(`removed ${matches.length} certificate(s) matching "${commonName}"`);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  async openCertificatesInventory(): Promise<void> {
    const page = this.requireCertificatesPage();
    await page.navigateTo.certificates();
    await expect(page.listOfCertificates).toBeVisible();
    await expect(page.uploadButton).toBeVisible();
  }

  async openUploadDialog(): Promise<void> {
    const page = this.requireCertificatesPage();
    await page.uploadButton.click();
    await expect(page.uploadDialog).toBeVisible();
    await expect(page.uploadDialogHeading).toBeVisible();
  }

  async attachCertificateFile(filePath: string): Promise<void> {
    const page = this.requireCertificatesPage();
    await page.uploadFileInput.setInputFiles(filePath);
    await expect(page.uploadFileNameInput).not.toHaveValue('');
    await expect(page.uploadSubmitButton).toBeEnabled();
  }

  async confirmUpload(): Promise<void> {
    const page = this.requireCertificatesPage();
    await expect(page.uploadSubmitButton).toBeEnabled();
    await page.uploadSubmitButton.click();
    await expect(page.uploadDialog).toBeHidden({ timeout: 15_000 });
  }

  async uploadCertificateFromPath(filePath: string): Promise<void> {
    await this.openUploadDialog();
    await this.attachCertificateFile(filePath);
    await this.confirmUpload();
  }

  async selectInventoryRowByUuid(uuid: string): Promise<void> {
    const page = this.requireCertificatesPage();
    const row = this.inventoryRowByUuid(uuid);
    const checkbox = page.rowCheckboxByUuid(uuid);

    await expect(row).toBeVisible();
    await expect(page.deleteButton).toBeDisabled();

    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.deleteButton).toBeEnabled({ timeout: 10_000 });
  }

  async resolveInventoryUuidByCommonName(commonName: string): Promise<string> {
    const row = this.inventoryRowByCommonName(commonName);
    await expect(row).toBeVisible();
    const uuid = await row.getAttribute('data-id');
    expect(uuid, `Row for "${commonName}" should have data-id (uuid)`).toBeTruthy();
    return uuid!;
  }

  async confirmDeleteDialogViaUi(): Promise<void> {
    const page = this.requireCertificatesPage();
    await expect(page.deleteConfirmDialog).toBeVisible({ timeout: 10_000 });
    await page.deleteConfirmButton.click();
    await expect(page.deleteConfirmDialog).toBeHidden({ timeout: 15_000 });
  }

  async deleteCertificateViaUi(uuid: string): Promise<void> {
    log.step(`delete certificate via UI — ${uuid}`);
    await this.selectInventoryRowByUuid(uuid);

    const page = this.requireCertificatesPage();
    await page.deleteButton.click();
    await this.confirmDeleteDialogViaUi();
    await page.refreshButton.click();

    await expect(this.inventoryRowByUuid(uuid)).toBeHidden({ timeout: 15_000 });
    log.ok(`certificate row removed from inventory — ${uuid}`);
  }

  async assertCertificateDeletedViaApi(uuid: string): Promise<void> {
    log.step(`verify certificate deleted via API — ${uuid}`);
    await this.assertCertificateNotExistsViaApi(uuid);
    await this.assertCertificateNotInListViaApi(uuid);
    log.ok(`certificate absent from API — ${uuid}`);
  }

  async uploadCertificateViaUi(pemPath: string, commonName: string): Promise<string> {
    log.step(`upload certificate via UI — ${path.basename(pemPath)}`);
    await this.openCertificatesInventory();
    await this.uploadCertificateFromPath(pemPath);
    await this.assertInventoryRowVisible(commonName);
    const uuid = await this.resolveInventoryUuidByCommonName(commonName);
    log.ok(`certificate listed — "${commonName}" (${uuid})`);
    return uuid;
  }

  async assertInventoryRowVisible(commonName: string): Promise<void> {
    await expect(this.inventoryRowByCommonName(commonName)).toBeVisible();
  }

  async assertInventoryRowVisibleByUuid(uuid: string): Promise<void> {
    await expect(this.inventoryRowByUuid(uuid)).toBeVisible();
  }

  async assertInventoryRowNotVisibleByUuid(uuid: string): Promise<void> {
    await expect(this.inventoryRowByUuid(uuid)).toBeHidden();
  }

  async assertInventoryRowNotVisible(commonName: string): Promise<void> {
    await expect(this.inventoryRowByCommonName(commonName)).toBeHidden();
  }

  /** Certificate Type column uses `data-testid="badge"` (e.g. X.509). */
  async assertInventoryCertificateType(commonName: string, typePattern: RegExp): Promise<void> {
    const page = this.requireCertificatesPage();
    const row = this.inventoryRowByCommonName(commonName);
    await expect(page.rowBadge(row, typePattern)).toBeVisible();
  }

  async assertInventoryCertificateTypeByUuid(uuid: string, typePattern: RegExp): Promise<void> {
    const page = this.requireCertificatesPage();
    const row = this.inventoryRowByUuid(uuid);
    await expect(page.rowBadge(row, typePattern)).toBeVisible();
  }
}
