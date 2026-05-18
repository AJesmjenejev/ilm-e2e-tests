import { Page } from '@playwright/test';
import { NavigateTo } from '../NavigateTo';

export abstract class BasePage {
  readonly navigateTo: NavigateTo;

  constructor(protected readonly page: Page) {
    this.navigateTo = new NavigateTo(page);
  }

  async waitForPageToLoad(): Promise<void> {
    await this.page.waitForLoadState('load');
  }
}
