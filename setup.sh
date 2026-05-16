#!/usr/bin/env bash
set -euo pipefail

# ILM local environment setup
# Clones all required repositories, starts Docker services, registers the
# first administrator, and prepares the frontend dev server.
#
# Usage: bash setup.sh

# --- Colors ------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }

step()  { echo ""; echo -e "${BOLD}── $* ${NC}"; }

# --- Configuration -----------------------------------------------------------

ILM_HOME="${ILM_HOME:-$HOME/ilm-local}"
GITHUB_BASE="https://github.com/OmniTrustILM"
HELM_RAW="https://raw.githubusercontent.com/OmniTrustILM/helm-charts/main/dummy-certificates/certs"

# --- Banner ------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  ILM Local Environment Setup${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Install dir: ${BLUE}${ILM_HOME}${NC}"
echo ""

# --- Step 1: Prerequisites ---------------------------------------------------

step "1 — Prerequisites"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found ($(command -v "$1"))"
  else
    die "$1 not found — install it and re-run. $2"
  fi
}

check_cmd git  "https://git-scm.com"
check_cmd node "https://nodejs.org (18+ required)"
check_cmd docker "https://docker.com/products/docker-desktop"
check_cmd curl ""

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 18 )); then
  die "Node.js 18+ required, found v$(node --version | tr -d v). Upgrade at nodejs.org."
fi
ok "Node.js v$(node --version | tr -d v) (>= 18)"

if ! docker info &>/dev/null 2>&1; then
  die "Docker daemon is not running. Start Docker Desktop and try again."
fi
ok "Docker daemon is running"

# --- Step 2: Clone repositories ----------------------------------------------

step "2 — Clone repositories"

mkdir -p "$ILM_HOME"
cd "$ILM_HOME"

clone_or_skip() {
  local repo="$1" dir="$2"
  if [[ -d "$dir/.git" ]]; then
    warn "$dir already exists — skipping clone"
  else
    info "Cloning ${repo}..."
    git clone "${GITHUB_BASE}/${repo}.git" "$dir"
    ok "Cloned ${repo}"
  fi
}

clone_or_skip development-environment development-environment
clone_or_skip auth                     auth
clone_or_skip auth-opa-policies        auth-opa-policies
clone_or_skip scheduler                scheduler
clone_or_skip fe-administrator         fe-administrator

# --- Step 3: Configure environment variables ---------------------------------

step "3 — Configure .env"

cd "$ILM_HOME/development-environment"

if [[ ! -f .env ]]; then
  cp .env.example .env
  info "Created .env from .env.example"
fi

# Update CZERTAINLY_SOURCES_BASE_DIR to the current ILM_HOME
if grep -q "^CZERTAINLY_SOURCES_BASE_DIR=" .env; then
  # macOS sed requires a backup extension
  sed -i.bak "s|^CZERTAINLY_SOURCES_BASE_DIR=.*|CZERTAINLY_SOURCES_BASE_DIR=${ILM_HOME}|" .env
  rm -f .env.bak
else
  echo "CZERTAINLY_SOURCES_BASE_DIR=${ILM_HOME}" >> .env
fi
ok "CZERTAINLY_SOURCES_BASE_DIR=${ILM_HOME}"

# --- Step 4: Trusted certificates --------------------------------------------

step "4 — Trusted certificates"

mkdir -p secrets
info "Downloading ILM Dummy Root CA..."
curl -sf "${HELM_RAW}/root-ca.cert.pem" > secrets/trusted_certificates.pem
CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" secrets/trusted_certificates.pem)
if [[ "$CERT_COUNT" -ne 1 ]]; then
  die "Expected 1 certificate in trusted_certificates.pem, found ${CERT_COUNT}."
fi
ok "secrets/trusted_certificates.pem contains 1 certificate"

# --- Step 5: Start the platform ----------------------------------------------

step "5 — Start Docker services"

if curl -sf http://localhost:8280/api/v1/health/liveness | grep -q '"UP"' 2>/dev/null; then
  ok "Platform already healthy — skipping docker compose up"
else
  info "Starting platform (this may take 10–20 min on first run)..."
  docker compose -f czertainly-compose.yml -f postgres-compose.yml \
    --profile database --profile core up --build -d
fi

# Wait for the core service to become healthy
info "Waiting for Core API to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60
until curl -sf http://localhost:8280/api/v1/health/liveness | grep -q '"UP"' 2>/dev/null; do
  ATTEMPTS=$(( ATTEMPTS + 1 ))
  if (( ATTEMPTS >= MAX_ATTEMPTS )); then
    die "Core API did not become healthy after ${MAX_ATTEMPTS} attempts. Check: docker compose logs core"
  fi
  sleep 5
  printf '.'
done
echo ""
ok "Core API is healthy"

# --- Step 6: Create the first administrator ----------------------------------

step "6 — Register first administrator"

# Download the dummy admin certificate (plain base64 DER, no PEM headers)
info "Downloading dummy admin certificate..."
curl -sf "${HELM_RAW}/admin.cert.pem" \
  | grep -A 9999 "BEGIN CERTIFICATE" | grep -v "BEGIN\|END" | tr -d '\n' \
  > /tmp/ilm_admin_cert_b64.txt
ok "Admin certificate downloaded"

# Check if admin already registered
CERT_URL=$(node -e "
const fs = require('fs');
process.stdout.write(encodeURIComponent(fs.readFileSync('/tmp/ilm_admin_cert_b64.txt','utf8').trim()));
")

PROFILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8280/api/v1/auth/profile \
  -H "ssl-client-cert: ${CERT_URL}" 2>/dev/null)

if [[ "$PROFILE_STATUS" == "200" ]]; then
  warn "Administrator already registered — skipping"
else
  CERT_B64=$(cat /tmp/ilm_admin_cert_b64.txt)
  cat > /tmp/ilm_first_admin.json << EOF
{
  "username": "admin",
  "firstname": "Admin",
  "lastname": "Local",
  "email": "admin@local.test",
  "certificateData": "${CERT_B64}",
  "enabled": "true",
  "description": "First Administrator"
}
EOF

  docker cp /tmp/ilm_first_admin.json core:/tmp/first-admin.json

  REGISTER_RESP=$(docker exec core curl -s -X POST \
    -H 'content-type: application/json' \
    -d @/tmp/first-admin.json \
    http://localhost:8080/api/v1/local/admins)

  if echo "$REGISTER_RESP" | grep -q '"superadmin"'; then
    ok "Administrator registered (role: superadmin)"
  else
    die "Administrator registration failed. Response: ${REGISTER_RESP}"
  fi
fi

# --- Step 7: Verify API authentication ---------------------------------------

step "7 — Verify API authentication"

PROFILE=$(curl -sf http://localhost:8280/api/v1/auth/profile \
  -H "ssl-client-cert: ${CERT_URL}" 2>/dev/null || echo "")

if echo "$PROFILE" | grep -q '"superadmin"'; then
  ok "API authentication verified (role: superadmin)"
else
  die "API authentication failed. Response: ${PROFILE}"
fi

# --- Step 8: Prepare frontend ------------------------------------------------

step "8 — Prepare frontend"

cd "$ILM_HOME/fe-administrator"

info "Installing npm dependencies..."
npm install --silent
ok "Dependencies installed"

info "Writing src/setupProxy.js..."
cat > src/setupProxy.js << EOF
const proxyConfig = {
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8280',
                changeOrigin: true,
                secure: false,
                headers: {
                    'ssl-client-cert': '${CERT_URL}',
                },
            },
        },
    },
};

export default proxyConfig;
EOF
ok "src/setupProxy.js written"

# --- Done --------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Backend:  ${GREEN}http://localhost:8280${NC}"
echo ""
echo -e "  To start the frontend, run:"
echo -e "    ${BOLD}cd ${ILM_HOME}/fe-administrator && npm start${NC}"
echo ""
echo -e "  The browser will open at ${GREEN}http://localhost:5173${NC}"
echo -e "  No login required — admin cert is injected via the Vite proxy."
echo ""
echo -e "  To stop the platform:"
echo -e "    ${BOLD}cd ${ILM_HOME}/development-environment${NC}"
echo -e "    ${BOLD}docker compose -f czertainly-compose.yml -f postgres-compose.yml --profile database --profile core down${NC}"
echo ""