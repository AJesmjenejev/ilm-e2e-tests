import { Page, Locator } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class CertificatesPage extends BasePage {
  readonly certificateInventoryFilter: Locator;
  readonly listOfCertificates: Locator;
  readonly table: Locator;
  readonly tableRows: Locator;

  readonly refreshButton: Locator;
  readonly addCertificateButton: Locator;
  readonly deleteButton: Locator;
  readonly uploadButton: Locator;
  readonly groupButton: Locator;
  readonly archiveButton: Locator;
  readonly unarchiveButton: Locator;

  readonly selectAllCheckbox: Locator;
  readonly includeArchivedSwitch: Locator;

  readonly uploadDialog: Locator;
  readonly uploadDialogHeading: Locator;
  readonly uploadCloseButton: Locator;
  readonly uploadFileInput: Locator;
  readonly uploadFileNameInput: Locator;
  readonly uploadContentTypeInput: Locator;
  readonly uploadFileContentTextarea: Locator;
  readonly uploadCancelButton: Locator;
  readonly uploadSubmitButton: Locator;

  readonly deleteConfirmDialog: Locator;
  readonly deleteConfirmButton: Locator;

  constructor(page: Page) {
    super(page);

    this.certificateInventoryFilter = this.page
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { name: 'Certificate Inventory Filter', exact: true }) });

    this.listOfCertificates = this.page
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { name: 'List of Certificates', exact: true }) });

    this.table = this.listOfCertificates.getByTestId('custom-table').locator('table');
    this.tableRows = this.table.locator('tbody tr[data-id]');

    this.refreshButton = this.listOfCertificates.getByTestId('refresh-icon');
    this.addCertificateButton = this.listOfCertificates.getByTestId('add-certificate-button');
    this.deleteButton = this.listOfCertificates.getByTestId('delete-button');
    this.uploadButton = this.listOfCertificates.getByTestId('upload-button');
    this.groupButton = this.listOfCertificates.getByTestId('group-button');
    this.archiveButton = this.listOfCertificates.getByTestId('archive-button');
    this.unarchiveButton = this.listOfCertificates.getByTestId('unarchive-button');

    this.selectAllCheckbox = this.table.locator('thead input[data-testid="checkbox"]');
    this.includeArchivedSwitch = this.certificateInventoryFilter.getByTestId('switch-archived-switch-input');

    this.uploadDialog = this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'Upload Certificate', exact: true }) });
    this.uploadDialogHeading = this.uploadDialog.getByRole('heading', { name: 'Upload Certificate', exact: true });
    this.uploadCloseButton = this.uploadDialog.getByRole('button', { name: 'Close' });
    this.uploadFileInput = this.uploadDialog.locator('#__fileUpload__file');
    this.uploadFileNameInput = this.uploadDialog.getByTestId('text-input-__fileUpload__fileName');
    this.uploadContentTypeInput = this.uploadDialog.getByTestId('text-input-__fileUpload__contentType');
    this.uploadFileContentTextarea = this.uploadDialog.locator('#__fileUpload__fileContent');
    this.uploadCancelButton = this.uploadDialog.getByRole('button', { name: 'Cancel' });
    this.uploadSubmitButton = this.uploadDialog.getByTestId('progress-button');

    this.deleteConfirmDialog = this.page.getByRole('dialog', {
      name: 'Delete Certificate',
    });
    this.deleteConfirmButton = this.deleteConfirmDialog
      .locator('.modal-footer')
      .getByRole('button', { name: 'Delete', exact: true });
  }

  /** Certificate row: `<tr data-id="{uuid}">`. Scope other cells from here. */
  rowByUuid(uuid: string): Locator {
    return this.table.locator(`tbody tr[data-id="${uuid}"]`);
  }

  rowByCommonName(commonName: string): Locator {
    return this.tableRows.filter({
      has: this.page.getByRole('link', { name: commonName, exact: true }),
    });
  }

  rowCheckboxByUuid(uuid: string): Locator {
    return this.rowByUuid(uuid).getByTestId('checkbox');
  }

  rowBadge(row: Locator, text: RegExp | string): Locator {
    return row.getByTestId('badge').filter({ hasText: text });
  }
}
