#!/bin/bash
# BhulekhChain Development Environment Setup
# Usage: bash infrastructure/scripts/setup-dev.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_ROOT}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "========================================="
echo "  BhulekhChain Dev Environment Setup"
echo "  National Blockchain Property Register"
echo "========================================="
echo ""

# -------------------------------------------
# Step 0: Check Prerequisites
# -------------------------------------------
log_info "Checking prerequisites..."

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install $1 first."
        echo "  $2"
        return 1
    fi
    local version
    version=$($3 2>&1 | head -1)
    log_ok "$1 found: ${version}"
    return 0
}

MISSING=0

check_command "docker" "Install Docker Desktop 4.x+: https://docs.docker.com/get-docker/" "docker --version" || MISSING=1
check_command "docker" "Docker Compose V2 required" "docker compose version" || MISSING=1
check_command "node" "Install Node.js 20 LTS: https://nodejs.org/" "node --version" || MISSING=1
check_command "go" "Install Go 1.21+: https://go.dev/dl/" "go version" || MISSING=1
check_command "python3" "Install Python 3.11+: https://www.python.org/downloads/" "python3 --version" || MISSING=1

if [ "$MISSING" -eq 1 ]; then
    log_error "Missing prerequisites. Please install the required tools and try again."
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker Desktop."
    exit 1
fi
log_ok "Docker daemon is running"

echo ""

# -------------------------------------------
# Step 1: Install Fabric Binaries
# -------------------------------------------
log_info "Step 1/10: Installing Hyperledger Fabric binaries and Docker images..."

if command -v peer &> /dev/null; then
    log_ok "Fabric binaries already installed"
else
    cd "${PROJECT_ROOT}"
    if [ ! -f install-fabric.sh ]; then
        curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
        chmod +x install-fabric.sh
    fi
    ./install-fabric.sh docker binary
    log_ok "Fabric binaries installed"
fi

echo ""

# -------------------------------------------
# Step 2: Generate Crypto Material
# -------------------------------------------
log_info "Step 2/10: Generating crypto material..."

FABRIC_NETWORK_DIR="${PROJECT_ROOT}/blockchain/fabric/network"
CRYPTO_DIR="${FABRIC_NETWORK_DIR}/crypto-material"

if [ -d "${CRYPTO_DIR}" ] && [ "$(ls -A ${CRYPTO_DIR} 2>/dev/null)" ]; then
    log_warn "Crypto material already exists. Skipping generation."
    log_warn "Delete ${CRYPTO_DIR} and re-run to regenerate."
else
    mkdir -p "${CRYPTO_DIR}"
    mkdir -p "${FABRIC_NETWORK_DIR}/channel-artifacts"

    cd "${FABRIC_NETWORK_DIR}"
    if [ -f crypto-config.yaml ]; then
        cryptogen generate --config=crypto-config.yaml --output=crypto-material
        log_ok "Crypto material generated"
    else
        log_warn "crypto-config.yaml not found. Skipping crypto generation."
        log_warn "Create blockchain/fabric/network/crypto-config.yaml first."
    fi
fi

echo ""

# -------------------------------------------
# Step 3: Generate Channel Artifacts
# -------------------------------------------
log_info "Step 3/10: Generating channel artifacts..."

CHANNEL_ARTIFACTS="${FABRIC_NETWORK_DIR}/channel-artifacts"
mkdir -p "${CHANNEL_ARTIFACTS}"

cd "${FABRIC_NETWORK_DIR}"
if [ -f configtx.yaml ]; then
    if [ ! -f "${CHANNEL_ARTIFACTS}/genesis.block" ]; then
        export FABRIC_CFG_PATH="${FABRIC_NETWORK_DIR}"
        configtxgen -profile TwoOrgOrdererGenesis \
            -channelID system-channel \
            -outputBlock "${CHANNEL_ARTIFACTS}/genesis.block" 2>/dev/null || {
            log_warn "Failed to generate genesis block. configtx.yaml may need updating."
        }
        configtxgen -profile LandRegistryChannel \
            -outputCreateChannelTx "${CHANNEL_ARTIFACTS}/channel.tx" \
            -channelID land-registry-channel 2>/dev/null || {
            log_warn "Failed to generate channel tx. configtx.yaml may need updating."
        }
        log_ok "Channel artifacts generated"
    else
        log_ok "Channel artifacts already exist"
    fi
else
    log_warn "configtx.yaml not found. Skipping channel artifact generation."
fi

echo ""

# -------------------------------------------
# Step 4: Start Docker Compose Services
# -------------------------------------------
log_info "Step 4/10: Starting Docker Compose services..."

cd "${PROJECT_ROOT}/infrastructure"
docker compose -f docker/docker-compose.dev.yaml up -d

log_ok "Docker Compose services started"
echo ""

# -------------------------------------------
# Step 5: Wait for Fabric Network
# -------------------------------------------
log_info "Step 5/10: Waiting for Fabric network to start..."

MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker ps --filter "name=peer0.revenue" --filter "status=running" | grep -q peer0.revenue 2>/dev/null; then
        log_ok "Fabric peer is running"
        break
    fi
    RETRY=$((RETRY + 1))
    if [ $RETRY -eq $MAX_RETRIES ]; then
        log_warn "Fabric peer did not start within expected time. Continuing anyway..."
        break
    fi
    sleep 2
done

# Wait for PostgreSQL to be ready
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker exec bhulekh-postgres pg_isready -U bhulekh -d bhulekhchain &>/dev/null; then
        log_ok "PostgreSQL is ready"
        break
    fi
    RETRY=$((RETRY + 1))
    if [ $RETRY -eq $MAX_RETRIES ]; then
        log_warn "PostgreSQL did not become ready within expected time."
        break
    fi
    sleep 2
done

# Wait for Redis
RETRY=0
while [ $RETRY -lt 15 ]; do
    if docker exec bhulekh-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        log_ok "Redis is ready"
        break
    fi
    RETRY=$((RETRY + 1))
    sleep 2
done

echo ""

# -------------------------------------------
# Step 6: Create Channel and Join Peers
# -------------------------------------------
log_info "Step 6/10: Creating channel and joining peers..."

SCRIPTS_DIR="${FABRIC_NETWORK_DIR}/scripts"

if [ -f "${SCRIPTS_DIR}/create-channel.sh" ]; then
    cd "${SCRIPTS_DIR}"
    bash create-channel.sh 2>/dev/null && log_ok "Channel created" || log_warn "Channel creation skipped or failed"
    bash join-channel.sh 2>/dev/null && log_ok "Peers joined channel" || log_warn "Peer join skipped or failed"
else
    log_warn "Channel scripts not found. Skipping channel setup."
fi

echo ""

# -------------------------------------------
# Step 7: Deploy Chaincodes
# -------------------------------------------
log_info "Step 7/10: Deploying chaincodes..."

if [ -f "${SCRIPTS_DIR}/deploy-chaincode.sh" ]; then
    cd "${SCRIPTS_DIR}"
    bash deploy-chaincode.sh land-registry 2>/dev/null && log_ok "land-registry chaincode deployed" || log_warn "land-registry deployment skipped or failed"
    bash deploy-chaincode.sh stamp-duty 2>/dev/null && log_ok "stamp-duty chaincode deployed" || log_warn "stamp-duty deployment skipped or failed"
else
    log_warn "deploy-chaincode.sh not found. Skipping chaincode deployment."
fi

echo ""

# -------------------------------------------
# Step 8: Setup Backend
# -------------------------------------------
log_info "Step 8/10: Setting up backend..."

BACKEND_DIR="${PROJECT_ROOT}/backend"

if [ -d "${BACKEND_DIR}" ] && [ -f "${BACKEND_DIR}/package.json" ]; then
    cd "${BACKEND_DIR}"
    npm install
    log_ok "Backend npm dependencies installed"

    if [ -f ".env.example" ] && [ ! -f ".env" ]; then
        cp .env.example .env
        log_ok "Created .env from .env.example"
    fi

    if [ -f "prisma/schema.prisma" ]; then
        npx prisma migrate dev --name init 2>/dev/null && log_ok "Prisma migrations applied" || log_warn "Prisma migration skipped"
        npx prisma db seed 2>/dev/null && log_ok "Database seeded" || log_warn "Database seed skipped"
    else
        log_warn "Prisma schema not found. Skipping database setup."
    fi
else
    log_warn "Backend directory or package.json not found. Skipping backend setup."
fi

echo ""

# -------------------------------------------
# Step 9: Setup Frontend
# -------------------------------------------
log_info "Step 9/10: Setting up frontend..."

FRONTEND_DIR="${PROJECT_ROOT}/frontend"

if [ -d "${FRONTEND_DIR}" ] && [ -f "${FRONTEND_DIR}/package.json" ]; then
    cd "${FRONTEND_DIR}"
    npm install
    log_ok "Frontend npm dependencies installed"
else
    log_warn "Frontend directory or package.json not found. Skipping frontend setup."
fi

echo ""

# -------------------------------------------
# Step 10: Setup Blockchain SDKs
# -------------------------------------------
log_info "Step 10/10: Setting up blockchain SDKs..."

# Algorand
ALGORAND_DIR="${PROJECT_ROOT}/blockchain/algorand"
if [ -f "${ALGORAND_DIR}/requirements.txt" ]; then
    cd "${ALGORAND_DIR}"
    pip3 install -r requirements.txt --break-system-packages 2>/dev/null || \
    pip3 install -r requirements.txt 2>/dev/null || \
    log_warn "Failed to install Algorand Python dependencies"
    log_ok "Algorand dependencies installed"

    if command -v algokit &> /dev/null; then
        algokit localnet start 2>/dev/null && log_ok "Algorand localnet started" || log_warn "Algorand localnet start skipped"
    else
        log_warn "AlgoKit CLI not found. Install with: pipx install algokit"
    fi
else
    log_warn "Algorand requirements.txt not found. Skipping Algorand setup."
fi

# Polygon (Hardhat)
POLYGON_DIR="${PROJECT_ROOT}/blockchain/polygon"
if [ -f "${POLYGON_DIR}/package.json" ]; then
    cd "${POLYGON_DIR}"
    npm install
    log_ok "Polygon (Hardhat) dependencies installed"
else
    log_warn "Polygon package.json not found. Skipping Polygon setup."
fi

echo ""

# -------------------------------------------
# Summary
# -------------------------------------------
echo "========================================="
echo "  BhulekhChain Dev Environment Ready"
echo "========================================="
echo ""
echo "  Services:"
echo "    Backend API:        http://localhost:3001"
echo "    Frontend:           http://localhost:3000"
echo "    Fabric Explorer:    http://localhost:8080"
echo "    Keycloak Admin:     http://localhost:8180  (admin/admin)"
echo "    Grafana:            http://localhost:3002  (admin/admin)"
echo "    Prometheus:         http://localhost:9090"
echo "    PostgreSQL:         localhost:5432         (bhulekh/devpassword)"
echo "    Redis:              localhost:6379"
echo "    IPFS API:           http://localhost:5001"
echo "    IPFS Gateway:       http://localhost:8081"
echo "    Algorand localnet:  http://localhost:4001"
echo ""
echo "  CouchDB:"
echo "    Revenue Peer:       http://localhost:5984  (admin/adminpw)"
echo "    Bank Peer:          http://localhost:7984  (admin/adminpw)"
echo ""
echo "  Quick Start:"
echo "    cd backend && npm run dev"
echo "    cd frontend && npm run dev"
echo ""
echo "========================================="
