import { CertificateKeywords } from '../keywords/certificate.keywords';
import { DashboardKeywords } from '../keywords/dashboard.keywords';
import { authTest } from './auth';

export { expect } from './auth';

type KeywordFixtures = {
  certificateKeywords: CertificateKeywords;
  dashboardKeywords: DashboardKeywords;
};

/** Playwright test with API clients and domain keywords. */
export const test = authTest.extend<KeywordFixtures>({
  certificateKeywords: async ({ certificateClient }, use) => {
    await use(new CertificateKeywords(certificateClient));
  },

  dashboardKeywords: async ({ statisticsClient }, use) => {
    await use(new DashboardKeywords(statisticsClient));
  },
});
