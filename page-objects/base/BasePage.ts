import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  protected getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }
}