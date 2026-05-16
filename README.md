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

Chromium is installed automatically by Playwright.

---

## Quick Start

### 1. Bootstrap the platform

Run once on a fresh machine. Clones all repos, starts Docker, registers the admin, prepares the frontend:

```bash
bash setup.sh
```

What it does step by step:

| Step | Action |
|------|--------|
| 1 | Checks prerequisites (node 18+, docker daemon, git, curl) |
| 2 | Clones 5 repos into `~/ilm-local/` (skips if already present) |
| 3 | Creates `~/ilm-local/development-environment/.env` from `.env.example`, sets `CZERTAINLY_SOURCES_BASE_DIR` |
| 4 | Downloads the dummy Root CA cert into `secrets/trusted_certificates.pem` |
| 5 | Starts Docker Compose (`czertainly-compose.yml` + `postgres-compose.yml`). Skips rebuild if platform is already healthy |
| 6 | Polls `GET /api/v1/health/liveness` until `"UP"` (up to 5 min) |
| 7 | Registers the first administrator via the Local API (skips if already registered) |
| 8 | Verifies API authentication (`superadmin` role confirmed) |
| 9 | Runs `npm install` for the frontend and writes `src/setupProxy.js` with the admin cert |

### 2. Start the frontend

In a separate terminal (keep it running):

```bash
cd ~/ilm-local/fe-administrator && npm start
# → http://localhost:5173  (auto-logged in as admin via Vite proxy)
```

### 3. Install test dependencies

```bash
npm install
npx playwright install chromium
```

### 4. Run the tests

```bash
# All tests (API + UI)
npm test

# API tests only — no browser, fast
npm run test:api

# UI tests only — Chromium
npm run test:ui

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
| `ADMIN_CERT_B64` | *(optional — CI only)* | Base64 DER of the admin cert. Locally, `global-setup.ts` downloads `certs/admin.cert.pem` automatically |

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

The import itself is done via API in both tests — faster and eliminates file-picker complexity. All Dashboard and list assertions in TC-02 run in a real Chromium browser against the live UI.

### Architecture

The API layer follows the Dependency Inversion Principle: `IHttpClient` is an interface, `BaseApiClient` implements it, and domain clients (`CertificateClient`, `StatisticsClient`) depend on the interface — not the implementation. A single `BaseApiClient` is shared across all domain clients via the worker-scoped `baseApiClient` fixture (one `APIRequestContext` per worker).

### Statistics cross-validation

TC-02 cross-validates the dashboard tile count against `GET /api/v1/statistics` after import. This catches stale-cache or wrong-tenant bugs that a pure DOM +1 check cannot detect.

### Test isolation

Each test uses `afterEach` to delete the imported certificate by UUID, keeping runs independent and idempotent regardless of prior state.

---

## Assumptions and workarounds

1. **Broken cert URL in assignment.** The URL in the assignment returns 404. The correct path uses `dummy-certificates` (with hyphen). `global-setup.ts` uses the corrected URL.

2. **Certificate file format.** `root-ca.cert.pem` is `openssl x509 -text` output — 95 lines of human-readable text precede the PEM block. `pemToBase64` extracts only the content between `-----BEGIN/END CERTIFICATE-----` markers via regex.

3. **Import endpoint.** `POST /api/v1/certificates/import` does not exist. The correct endpoint is `POST /api/v1/certificates/upload` with body `{ "certificate": "<base64-DER>", "customAttributes": [] }`, confirmed against the API reference.

4. **Certificate list uses POST.** The list endpoint is `POST /api/v1/certificates` (not GET), consistent with CZERTAINLY's filter-by-body convention.

5. **`certificateType` vs `subjectType`.** The platform returns `"certificateType": "X.509"` for all certificates (encoding format). The Root CA distinction is in `"subjectType": "rootCa"`. TC-01 asserts on `subjectType`.

6. **Auth mechanism.** There is no login form. The Vite dev server injects `ssl-client-cert` via its proxy config (`src/setupProxy.js`), so the browser is auto-authenticated. The test suite passes the same URL-encoded base64 DER cert via the `ssl-client-cert` header in `extraHTTPHeaders`.