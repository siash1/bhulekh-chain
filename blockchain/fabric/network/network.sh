#!/bin/bash
# =============================================================================
# BhulekhChain — Unified Fabric Network Management Script
# =============================================================================
# Single entry point to manage the dev Fabric network lifecycle.
#
# Usage:
#   ./network.sh up       — Generate crypto, start containers, create channel,
#                            join peers, deploy chaincode
#   ./network.sh down     — Stop all containers and clean generated artifacts
#   ./network.sh restart  — Down then up
#   ./network.sh generate — Generate crypto material and channel artifacts only
#   ./network.sh channel  — Create channel and join peers (network must be running)
#   ./network.sh deploy   — Deploy land-registry chaincode (channel must exist)
#   ./network.sh test     — Run smoke test against deployed chaincode
#   ./network.sh status   — Show container status
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="${SCRIPT_DIR}"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
CRYPTO_DIR="${NETWORK_DIR}/crypto-material"
CHANNEL_ARTIFACTS_DIR="${NETWORK_DIR}/channel-artifacts"
DOCKER_COMPOSE_DIR="${SCRIPT_DIR}/../../../infrastructure/docker"
DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_DIR}/docker-compose.dev.yaml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# -----------------------------------------------------------------------------
# Prerequisites check
# -----------------------------------------------------------------------------
check_prerequisites() {
    local missing=0

    for cmd in docker cryptogen configtxgen peer; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "$cmd is not installed or not in PATH."
            missing=1
        fi
    done

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running."
        missing=1
    fi

    if [ "$missing" -eq 1 ]; then
        log_error "Install missing prerequisites and try again."
        log_info  "Fabric binaries: curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh && chmod +x install-fabric.sh && ./install-fabric.sh binary"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Generate crypto material
# -----------------------------------------------------------------------------
generate_crypto() {
    log_info "Generating crypto material..."

    if [ -d "${CRYPTO_DIR}" ] && [ "$(ls -A "${CRYPTO_DIR}" 2>/dev/null)" ]; then
        log_warn "Crypto material already exists. Skipping. Delete ${CRYPTO_DIR} to regenerate."
        return
    fi

    mkdir -p "${CRYPTO_DIR}"
    cd "${NETWORK_DIR}"
    cryptogen generate --config=crypto-config.yaml --output=crypto-material
    log_ok "Crypto material generated at ${CRYPTO_DIR}"
}

# -----------------------------------------------------------------------------
# Generate channel artifacts (genesis block + channel tx)
# -----------------------------------------------------------------------------
generate_channel_artifacts() {
    log_info "Generating channel artifacts..."

    mkdir -p "${CHANNEL_ARTIFACTS_DIR}"

    export FABRIC_CFG_PATH="${NETWORK_DIR}"

    if [ ! -f "${CHANNEL_ARTIFACTS_DIR}/genesis.block" ]; then
        configtxgen \
            -profile TwoOrgOrdererGenesis \
            -channelID system-channel \
            -outputBlock "${CHANNEL_ARTIFACTS_DIR}/genesis.block"
        log_ok "Genesis block generated"
    else
        log_warn "genesis.block already exists. Skipping."
    fi

    if [ ! -f "${CHANNEL_ARTIFACTS_DIR}/channel.tx" ]; then
        configtxgen \
            -profile LandRegistryChannel \
            -outputCreateChannelTx "${CHANNEL_ARTIFACTS_DIR}/channel.tx" \
            -channelID land-registry-channel
        log_ok "Channel transaction generated"
    else
        log_warn "channel.tx already exists. Skipping."
    fi
}

# -----------------------------------------------------------------------------
# Start docker containers (Fabric + supporting services)
# -----------------------------------------------------------------------------
start_containers() {
    log_info "Starting Docker containers..."

    if [ ! -f "${DOCKER_COMPOSE_FILE}" ]; then
        log_error "Docker Compose file not found at ${DOCKER_COMPOSE_FILE}"
        exit 1
    fi

    cd "${DOCKER_COMPOSE_DIR}"
    docker compose -f docker-compose.dev.yaml up -d
    log_ok "Containers started"

    # Wait for peers to be ready
    log_info "Waiting for Fabric peers to be ready..."
    local retries=30
    local count=0
    while [ $count -lt $retries ]; do
        if docker ps --filter "name=peer0.revenue" --filter "status=running" 2>/dev/null | grep -q peer0.revenue; then
            log_ok "peer0.revenue is running"
            break
        fi
        count=$((count + 1))
        sleep 2
    done

    if [ $count -eq $retries ]; then
        log_warn "peer0.revenue did not start within expected time."
    fi

    # Wait for orderer
    count=0
    while [ $count -lt $retries ]; do
        if docker ps --filter "name=orderer.bhulekhchain.dev" --filter "status=running" 2>/dev/null | grep -q orderer; then
            log_ok "Orderer is running"
            break
        fi
        count=$((count + 1))
        sleep 2
    done

    # Give services a moment to initialize
    sleep 3
}

# -----------------------------------------------------------------------------
# Create channel and join peers
# -----------------------------------------------------------------------------
setup_channel() {
    log_info "Creating channel and joining peers..."

    cd "${SCRIPTS_DIR}"

    if [ ! -f create-channel.sh ]; then
        log_error "create-channel.sh not found in ${SCRIPTS_DIR}"
        exit 1
    fi

    bash create-channel.sh
    log_ok "Channel created"

    bash join-channel.sh
    log_ok "Peers joined channel"
}

# -----------------------------------------------------------------------------
# Deploy chaincode
# -----------------------------------------------------------------------------
deploy_chaincode() {
    local cc_name="${1:-land-registry}"
    log_info "Deploying chaincode: ${cc_name}"

    cd "${SCRIPTS_DIR}"

    if [ ! -f deploy-chaincode.sh ]; then
        log_error "deploy-chaincode.sh not found in ${SCRIPTS_DIR}"
        exit 1
    fi

    bash deploy-chaincode.sh "${cc_name}"
    log_ok "Chaincode '${cc_name}' deployed"
}

# -----------------------------------------------------------------------------
# Run smoke test
# -----------------------------------------------------------------------------
run_test() {
    log_info "Running smoke test..."

    cd "${SCRIPTS_DIR}"

    if [ ! -f test-chaincode.sh ]; then
        log_error "test-chaincode.sh not found in ${SCRIPTS_DIR}"
        exit 1
    fi

    bash test-chaincode.sh
}

# -----------------------------------------------------------------------------
# Stop containers and clean artifacts
# -----------------------------------------------------------------------------
network_down() {
    log_info "Stopping network..."

    # Stop docker containers
    if [ -f "${DOCKER_COMPOSE_FILE}" ]; then
        cd "${DOCKER_COMPOSE_DIR}"
        docker compose -f docker-compose.dev.yaml down --volumes --remove-orphans 2>/dev/null || true
        log_ok "Containers stopped"
    fi

    # Remove generated artifacts
    if [ -d "${CRYPTO_DIR}" ]; then
        rm -rf "${CRYPTO_DIR}"
        log_ok "Crypto material removed"
    fi

    if [ -d "${CHANNEL_ARTIFACTS_DIR}" ]; then
        rm -rf "${CHANNEL_ARTIFACTS_DIR}"
        log_ok "Channel artifacts removed"
    fi

    # Remove chaincode docker images
    docker images -q "dev-peer*" 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true

    log_ok "Network is down and clean"
}

# -----------------------------------------------------------------------------
# Show status
# -----------------------------------------------------------------------------
show_status() {
    echo ""
    echo "============================================================"
    echo "  BhulekhChain Fabric Network Status"
    echo "============================================================"
    echo ""

    echo "Docker containers:"
    docker ps --filter "network=bhulekh-net" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  No containers running"

    echo ""
    echo "Crypto material: $([ -d "${CRYPTO_DIR}" ] && [ "$(ls -A "${CRYPTO_DIR}" 2>/dev/null)" ] && echo 'EXISTS' || echo 'NOT GENERATED')"
    echo "Channel artifacts: $([ -f "${CHANNEL_ARTIFACTS_DIR}/genesis.block" ] && echo 'EXISTS' || echo 'NOT GENERATED')"
    echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
print_usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  up       — Start the full Fabric dev network"
    echo "  down     — Stop network and clean all generated artifacts"
    echo "  restart  — Stop then start the network"
    echo "  generate — Generate crypto material and channel artifacts"
    echo "  channel  — Create channel and join peers"
    echo "  deploy   — Deploy land-registry chaincode"
    echo "  test     — Run chaincode smoke test"
    echo "  status   — Show network status"
    echo ""
}

if [ -z "$1" ]; then
    print_usage
    exit 1
fi

COMMAND="$1"
shift

echo ""
echo "============================================================"
echo "  BhulekhChain — Fabric Network Manager"
echo "  Command: ${COMMAND}"
echo "============================================================"
echo ""

case "${COMMAND}" in
    up)
        check_prerequisites
        generate_crypto
        generate_channel_artifacts
        start_containers
        setup_channel
        deploy_chaincode "land-registry"

        echo ""
        echo "============================================================"
        echo "  Network is UP"
        echo "============================================================"
        echo ""
        echo "  Orderer:              localhost:7050"
        echo "  peer0.revenue:        localhost:7051"
        echo "  peer0.bank:           localhost:9051"
        echo "  CouchDB (revenue):    http://localhost:5984/_utils"
        echo "  CouchDB (bank):       http://localhost:7984/_utils"
        echo "  Fabric Explorer:      http://localhost:8080"
        echo ""
        echo "  Run './network.sh test' to verify chaincode."
        echo "============================================================"
        echo ""
        ;;
    down)
        network_down
        ;;
    restart)
        network_down
        check_prerequisites
        generate_crypto
        generate_channel_artifacts
        start_containers
        setup_channel
        deploy_chaincode "land-registry"
        echo ""
        log_ok "Network restarted successfully."
        echo ""
        ;;
    generate)
        check_prerequisites
        generate_crypto
        generate_channel_artifacts
        ;;
    channel)
        setup_channel
        ;;
    deploy)
        deploy_chaincode "${1:-land-registry}"
        ;;
    test)
        run_test
        ;;
    status)
        show_status
        ;;
    *)
        log_error "Unknown command: ${COMMAND}"
        print_usage
        exit 1
        ;;
esac
