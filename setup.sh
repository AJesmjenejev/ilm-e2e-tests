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

REPO_DIR="$(pwd)"
ILM_HOME="${ILM_HOME:-$HOME/ilm-local}"
GITHUB_BASE="https://github.com/OmniTrustILM"
HELM_RAW="https://raw.githubusercontent.com/OmniTrustILM/helm-charts/main/dummy-certificates/certs"

# On Windows (Git Bash), $HOME resolves to /c/Users/... but Docker Compose
# requires a Windows-style path (C:/Users/...). Convert if needed.
to_docker_path() {
  local p="$1"
  case "$(uname -s)" in
    MINGW*|CYGWIN*|MSYS*)
      # /c/Users/foo → C:/Users/foo
      echo "$p" | sed 's|^/\([a-zA-Z]\)/|\1:/|'
      ;;
    *)
      echo "$p"
      ;;
  esac
}

DOCKER_ILM_HOME="$(to_docker_path "$ILM_HOME")"
DOCKER_REPO_DIR="$(to_docker_path "$REPO_DIR")"

# COMMON_TMPDIR is initialized after the prerequisite check (requires node).
COMMON_TMPDIR=""

# On Windows Git Bash, docker cp translates /tmp/... paths incorrectly.
# MSYS_NO_PATHCONV=1 disables that translation.
docker_cp() {
  case "$(uname -s)" in
    MINGW*|CYGWIN*|MSYS*) MSYS_NO_PATHCONV=1 docker cp "$@" ;;
    *)                     docker cp "$@" ;;
  esac
}

# --- Banner ------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  ILM Local Environment Setup${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Install dir: ${BLUE}${ILM_HOME}${NC}"
echo ""

# --- Step 1: Prerequisites ---------------------------------------------------

step "1 — Prerequisites"

MISSING=()

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found ($(command -v "$1"))"
  else
    echo -e "${RED}[FAIL]${NC}  $1 not found. $2"
    MISSING+=("$1")
  fi
}

check_cmd git    "Install from https://git-scm.com"
check_cmd node   "Install Node.js 18+ from https://nodejs.org"
check_cmd docker "Install Docker Desktop from https://docker.com/products/docker-desktop"
check_cmd curl   "Install curl with your package manager"

if (( ${#MISSING[@]} > 0 )); then
  echo ""
  die "Missing prerequisites: ${MISSING[*]}. Install them and re-run."
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 18 )); then
  die "Node.js 18+ required, found v$(node --version | tr -d v). Upgrade at nodejs.org."
fi
ok "Node.js v$(node --version | tr -d v) (>= 18)"

if ! docker info &>/dev/null 2>&1; then
  die "Docker daemon is not running. Start Docker Desktop and try again."
fi
ok "Docker daemon is running"

# Now that node is verified, set the shared temp dir.
# On Windows, /tmp in Git Bash ≠ C:\tmp in Node.js — os.tmpdir() gives the real one.
COMMON_TMPDIR=$(node -e "process.stdout.write(require('os').tmpdir().replace(/\\\\/g, '/'))")

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
  sed -i.bak "s|^CZERTAINLY_SOURCES_BASE_DIR=.*|CZERTAINLY_SOURCES_BASE_DIR=${DOCKER_ILM_HOME}|" .env
  rm -f .env.bak
else
  echo "CZERTAINLY_SOURCES_BASE_DIR=${DOCKER_ILM_HOME}" >> .env
fi
ok "CZERTAINLY_SOURCES_BASE_DIR=${DOCKER_ILM_HOME}"

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
  > $COMMON_TMPDIR/ilm_admin_cert_b64.txt
ok "Admin certificate downloaded"

# Check if admin already registered
CERT_URL=$(node -e "
const fs = require('fs');
process.stdout.write(encodeURIComponent(fs.readFileSync('$COMMON_TMPDIR/ilm_admin_cert_b64.txt','utf8').trim()));
")

PROFILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8280/api/v1/auth/profile \
  -H "ssl-client-cert: ${CERT_URL}" 2>/dev/null)

if [[ "$PROFILE_STATUS" == "200" ]]; then
  warn "Administrator already registered — skipping"
else
  # Pipe JSON directly into the container via stdin — avoids docker cp path issues on Windows.
  REGISTER_RESP=$(node -e "
const fs = require('fs');
const cert = fs.readFileSync('$COMMON_TMPDIR/ilm_admin_cert_b64.txt','utf8').trim();
process.stdout.write(JSON.stringify({
  username:'admin', firstname:'Admin', lastname:'Local',
  email:'admin@local.test', certificateData:cert,
  enabled:'true', description:'First Administrator'
}));
" | docker exec -i core curl -s -X POST \
    -H 'content-type: application/json' \
    -d @- \
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
# Use Node.js to write the file — avoids heredoc quoting/encoding issues on Windows.
cat > $COMMON_TMPDIR/ilm-write-proxy.cjs << 'JSEOF'
const fs = require('fs');
const certUrl = process.argv[2];
const content = `const proxyConfig = {
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8280',
                changeOrigin: true,
                secure: false,
                headers: {
                    'ssl-client-cert': '${certUrl}',
                },
            },
        },
    },
};

export default proxyConfig;
`;
fs.writeFileSync('src/setupProxy.js', content, 'utf8');
JSEOF
node $COMMON_TMPDIR/ilm-write-proxy.cjs "$CERT_URL"
ok "src/setupProxy.js written"

# --- Step 9: Prepare test suite ----------------------------------------------

step "9 — Configure test suite"

cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  warn ".env already exists — skipping"
fi

info "Installing test suite dependencies..."
npm install --silent
ok "Test suite dependencies installed"

info "Installing Chromium for Playwright..."
npx --yes playwright install chromium
ok "Chromium installed"

# --- Done --------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Backend:  ${GREEN}http://localhost:8280${NC}"
echo ""
echo -e "  To start the frontend (run in a new terminal):"
echo -e "    ${BOLD}cd ${DOCKER_ILM_HOME}/fe-administrator && npm start${NC}"
echo ""
echo -e "  The browser will open at ${GREEN}http://localhost:5173${NC}"
echo -e "  No login required — admin cert is injected via the Vite proxy."
echo ""
echo -e "  To run the tests:"
echo -e "    ${BOLD}cd ${DOCKER_REPO_DIR} && npm test${NC}"
echo ""
echo -e "  To stop the platform:"
echo -e "    ${BOLD}cd ${DOCKER_ILM_HOME}/development-environment${NC}"
echo -e "    ${BOLD}docker compose -f czertainly-compose.yml -f postgres-compose.yml --profile database --profile core down${NC}"
echo ""