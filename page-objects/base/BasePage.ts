import { Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async waitForPageToLoad(): Promise<void> {
    await this.page.waitForLoadState('load');
  }
}