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
global-setup.ts                              # Downloads certs if missing, handles HTTP redirects
fixtures/
  auth.ts                                    # Worker-scoped API clients (ssl-client-cert auth)
  keywords.ts                                # Composes keyword fixtures on top of authTest — entry point for specs
types/
  certificate.ts                             # DTOs: UploadCertificateRequest/Response, CertificateDto, StatisticsDto
utils/
  api/
    http-client.ts                           # IHttpClient interface: get, post, delete
    base-client.ts                           # BaseApiClient implements IHttpClient
    certificate-client.ts                    # CertificateClient: upload, getById, list, remove
    statistics-client.ts                     # StatisticsClient: get() → totalCertificates, totalGroups, …
  cert.ts                                    # pemToBase64 (handles openssl x509 -text output), adminCertBase64
  constants.ts                               # Shared values: ROOT_CA_COMMON_NAME, CERTIFICATE_TYPE_X509_PATTERN
  env.ts                                     # Typed env loader
  log.ts                                     # log.step / log.ok / log.info
page-objects/
  base/
    BasePage.ts                              # Abstract base: owns Page + NavigateTo
  NavigateTo.ts                              # Centralised URL routes (dashboard, inventory)
  DashboardPage.ts                           # Certificate count tile, list navigation
  CertificatesPage.ts                        # Inventory: table, upload dialog, delete dialog, row helpers
keywords/
  certificate.keywords.ts                    # Domain actions: import/list/get/delete via API; upload/select/delete via UI
  dashboard.keywords.ts                      # Domain actions: read tile count, assert increment/decrement, cross-check API
tests/
  api/
    certificate-import.api.spec.ts           # TC-01: pure API
  ui/
    certificate-dashboard.ui.spec.ts         # TC-02: import + delete via UI, assert in browser + API
```

---

## Test cases

| ID | Layer | What is verified |
|----|-------|-----------------|
| TC-01 | API | `POST /api/v1/certificates/upload` returns a UUID; `GET /api/v1/certificates/{uuid}` has `commonName: "Dummy Root CA"` and `certificateType` matching `/X\.509/i`; certificate appears in list |
| TC-02 | UI | Import via upload dialog; inventory row visible by common name and UUID with X.509 type badge; dashboard tile count increments by 1; tile count matches `GET /api/v1/statistics`; tile link points to `/certificates`; delete via inventory UI; row removed; certificate gone from API; tile count decrements by 1 and re-matches statistics |

---

## Approach and reasoning

### Why hybrid (API + UI)?

The assignment requires verifying three things: the certificate is stored, its properties are correct, and the Dashboard reflects it. The first two are naturally API concerns; the third requires a real browser.

| Option | Pro | Con |
|--------|-----|-----|
| Pure UI | Full user journey | Slow; file-picker interaction is fragile |
| Pure API | Fast, deterministic | Does not exercise the Dashboard UI at all |
| **Hybrid (chosen)** | Fast + covers all three requirements + demonstrates both skills | Slightly more setup |

TC-01 stays on the API for speed and determinism. TC-02 drives the full user flow in Chromium — import through the upload dialog, dashboard assertions, delete through the inventory — and cross-validates each visible step against the API.

### Architecture

Layers, top-down: **specs → keywords → page-objects / API clients → transport**.

- **Specs** (`tests/`) describe Given/When/Then at the scenario level only; no locators, no HTTP details.
- **Keywords** (`keywords/`) — one class per domain (`CertificateKeywords`, `DashboardKeywords`). Each keyword class owns both API and UI methods for its domain. UI methods require a `Page`; specs call `bindPage(page)` in `beforeEach` to enable them. Pure-API specs just don't bind and can't accidentally call UI methods (runtime guard).
- **Page objects** (`page-objects/`) hold locators only — no assertions, no flow. `BasePage` injects a shared `NavigateTo` so every page can route without duplication.
- **API clients** (`utils/api/`) talk to an `IHttpClient` interface, not directly to Playwright's `APIRequestContext`. One `BaseApiClient` instance is shared across `CertificateClient` and `StatisticsClient` via a worker-scoped fixture, so each worker keeps a single HTTP context without repeated handshakes. Swapping the transport (say, for a mock in unit tests) touches one file.
- **Shared values** live in `utils/constants.ts` (e.g. `ROOT_CA_COMMON_NAME`, `CERTIFICATE_TYPE_X509_PATTERN`) — no magic strings in specs or keywords.

### Statistics cross-validation

TC-02 cross-validates the dashboard tile count against `GET /api/v1/statistics` after import. This catches stale-cache or wrong-tenant bugs that a pure DOM +1 check cannot detect.

### Test isolation

Each test cleans up after itself in `afterEach` — TC-01 deletes by the UUID it captured during upload; TC-02 deletes any leftover certificates whose common name matches `ROOT_CA_COMMON_NAME` (also done in `beforeEach` so a previously failed run can't poison the next one). Runs are independent and idempotent.

---
