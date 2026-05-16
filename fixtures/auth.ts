import {
  test as base,
  request as playwrightRequest,
  expect,
} from '@playwright/test';
import { loadEnv } from '../utils/env';
import { adminCertBase64 } from '../utils/cert';
import { BaseApiClient } from '../utils/api/base-client';
import { CertificateClient } from '../utils/api/certificate-client';
import { StatisticsClient } from '../utils/api/statistics-client';

export { expect };

type WorkerFixtures = {
  /**
   * Shared HTTP client for the lifetime of a worker — one APIRequestContext,
   * one ssl-client-cert handshake. Domain clients (certificateClient,
   * statisticsClient) are composed on top of this.
   */
  baseApiClient: BaseApiClient;
  certificateClient: CertificateClient;
  statisticsClient: StatisticsClient;
};

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
  baseApiClient: [
    async ({}, use) => {
      const env = loadEnv();
      const ctx = await playwrightRequest.newContext({
        baseURL: env.apiBaseUrl,
        extraHTTPHeaders: {
          'ssl-client-cert': encodeURIComponent(adminCertBase64()),
          Accept: 'application/json',
        },
        ignoreHTTPSErrors: true,
      });
      await use(new BaseApiClient(ctx));
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],

  certificateClient: [
    async ({ baseApiClient }, use) => {
      await use(new CertificateClient(baseApiClient));
    },
    { scope: 'worker' },
  ],

  statisticsClient: [
    async ({ baseApiClient }, use) => {
      await use(new StatisticsClient(baseApiClient));
    },
    { scope: 'worker' },
  ],
});