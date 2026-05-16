# ILM Certificate Import — SDET Take-Home Assignment

Playwright + TypeScript test suite covering the certificate import scenario from the ILM platform.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18+ |
| Docker Desktop | running |
| git | any recent |
| curl | any |

---

## Quick Start

### 1. Bootstrap the platform

Run once on a fresh machine. Clones all repos, starts Docker, registers the admin, prepares the frontend:

```bash
bash setup.sh
```

| Step | Action |
|------|--------|
| 1 | Checks prerequisites (node 18+, docker daemon, git, curl) |
| 2 | Clones 5 repos into `~/ilm-local/` (skips if already present) |
| 3 | Creates `~/ilm-local/development-environment/.env` from `.env.example`, sets `CZERTAINLY_SOURCES_BASE_DIR` |
| 4 | Downloads the dummy Root CA cert into `secrets/trusted_certificates.pem` |
| 5 | Starts Docker Compose (`czertainly-compose.yml` + `postgres-compose.yml`); polls `GET /api/v1/health/liveness` until `"UP"` (up to 5 min) |
| 6 | Registers the first administrator via the Local API (skips if already registered) |
| 7 | Verifies API authentication (`superadmin` role confirmed) |
| 8 | Runs `npm install` for the frontend and writes `src/setupProxy.js` with the admin cert |
| 9 | Creates test suite `.env`, installs test suite dependencies, installs Chromium for Playwright |

### 2. Start the frontend

In a separate terminal (keep it running):

```bash
cd ~/ilm-local/fe-administrator && npm start
# → http://localhost:5173  (auto-logged in as admin via Vite proxy)
```

### 3. Run the tests

```bash
# All tests (API + UI)
npm test

# API tests only — no browser, fast
npm run test:api

# UI tests only — Chromium (headless)
npm run test:ui

# UI tests with browser visible
npm run test:ui -- --headed

# Open HTML report
npm run test:report
```

---

## Environment

`.env` ships pre-configured for local development. No changes needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:5173` | Frontend (Vite dev server) |
| `API_BASE_URL` | `http://localhost:8280` | Core API |

---

## Project structure

```
setup.sh                                     # One-command environment bootstrap
fixtures/
  auth.ts                                    # Worker-scoped baseApiClient, certificateClient, statisticsClient
global-setup.ts                              # Downloads certs if missing, handles HTTP redirects
types/
  certificate.ts                             # DTOs: UploadCertificateRequest/Response, CertificateDto, StatisticsDto
utils/
  api/
    http-client.ts                           # IHttpClient interface: get, post, delete
    base-client.ts                           # BaseApiClient implements IHttpClient
    certificate-client.ts                    # CertificateClient: upload, getById, list, remove
    statistics-client.ts                     # StatisticsClient: get() → totalCertificates, totalGroups, …
  cert.ts                                    # pemToBase64 (handles openssl x509 -text output), adminCertBase64
  env.ts                                     # Typed env loader
  log.ts                                     # log.step / log.ok / log.info
page-objects/
  base/
    BasePage.ts                              # Abstract base: getByTestId
  DashboardPage.ts                           # Certificate count tile, list navigation
tests/
  api/
    certificate-import.api.spec.ts           # TC-01: pure API
  ui/
    certificate-dashboard.ui.spec.ts         # TC-02: import via API, assert in browser
```

---

## Test cases

| ID | Layer | What is verified |
|----|-------|-----------------|
| TC-01 | API | `POST /api/v1/certificates/upload` returns a UUID; `GET /api/v1/certificates/{uuid}` has `commonName: "Dummy Root CA"` and `subjectType` of Root CA variant; certificate appears in list |
| TC-02 | UI | Import via API; dashboard count increments by 1; tile count matches `GET /api/v1/statistics`; tile link points to `/certificates`; list shows `"Dummy Root CA"` row with correct type |

---

## Approach and reasoning

### Why hybrid (API + UI)?

The assignment requires verifying three things: the certificate is stored, its properties are correct, and the Dashboard reflects it. The first two are naturally API concerns; the third requires a real browser.

| Option | Pro | Con |
|--------|-----|-----|
| Pure UI | Full user journey | Slow; file-picker interaction is fragile |
| Pure API | Fast, deterministic | Does not exercise the Dashboard UI at all |
| **Hybrid (chosen)** | Fast + covers all three requirements + demonstrates both skills | Slightly more setup |

The import itself is done via API in both tests — faster and no file-picker to wrestle with. TC-02 runs all Dashboard and list assertions in a real Chromium browser against the live UI.

### Architecture

`CertificateClient` and `StatisticsClient` talk to an `IHttpClient` interface, not directly to Playwright's `APIRequestContext`. One `BaseApiClient` instance is shared across both via a worker-scoped fixture, so each worker keeps a single HTTP context without repeated handshakes. Swapping the transport (say, for a mock in unit tests) touches one file.

### Statistics cross-validation

TC-02 cross-validates the dashboard tile count against `GET /api/v1/statistics` after import. This catches stale-cache or wrong-tenant bugs that a pure DOM +1 check cannot detect.

### Test isolation

Each test uses `afterEach` to delete the imported certificate by UUID, keeping runs independent and idempotent.

---
