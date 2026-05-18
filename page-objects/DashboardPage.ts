import { Page, Locator } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class DashboardPage extends BasePage {
  /** Certificates count card inside `data-testid="dashboard-counts"`. */
  readonly certificatesTile: Locator;

  constructor(page: Page) {
    super(page);
    this.certificatesTile = this.page.getByTestId('dashboard-counts')
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { name: 'Certificates', exact: true }) });
  }
}
