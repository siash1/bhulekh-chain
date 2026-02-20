#!/bin/bash
# =============================================================================
# BhulekhChain — Deploy Chaincode Script (CcaaS)
# =============================================================================
# Deploys a chaincode to the land-registry-channel using the Fabric 2.x
# lifecycle with Chaincode-as-a-Service (CcaaS) packaging.
#
# CcaaS avoids Docker-in-Docker builds which are broken on Docker Engine v29+
# (see https://github.com/hyperledger/fabric/issues/5350).
#
# Usage: ./deploy-chaincode.sh <chaincode-name>
# Example: ./deploy-chaincode.sh land-registry
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Validate arguments
# -----------------------------------------------------------------------------
if [ -z "$1" ]; then
    echo "ERROR: Chaincode name is required."
    echo "Usage: $0 <chaincode-name>"
    echo "Example: $0 land-registry"
    exit 1
fi

CC_NAME="$1"
CC_VERSION="1.0"
CC_SEQUENCE=1
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_SRC_PATH="${PWD}/../../chaincode/${CC_NAME}"

CHANNEL_NAME="land-registry-channel"
CRYPTO_DIR="${PWD}/../crypto-material"

# Fabric peer CLI requires core.yaml
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$(cd "${PWD}/../../../.." && pwd)/config}"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="localhost:7050"

CC_PKG_DIR="${PWD}/../channel-artifacts"
CC_PKG_FILE="${CC_PKG_DIR}/${CC_NAME}.tar.gz"

DOCKER_COMPOSE_DIR="${PWD}/../../../../infrastructure/docker"

# -----------------------------------------------------------------------------
# Verify chaincode source exists
# -----------------------------------------------------------------------------
if [ ! -d "${CC_SRC_PATH}" ]; then
    echo "ERROR: Chaincode source not found at ${CC_SRC_PATH}"
    exit 1
fi

# -----------------------------------------------------------------------------
# Environment setters
# -----------------------------------------------------------------------------
set_peer0_revenue_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/Admin@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

set_peer0_bank_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="BankOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/users/Admin@bank.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:9051"
}

# -----------------------------------------------------------------------------
# Step 1: Package chaincode (CcaaS format)
# Creates a tar.gz with metadata.json (type=ccaas) and code.tar.gz
# containing connection.json (tells peer where to dial the chaincode).
# -----------------------------------------------------------------------------
package_chaincode() {
    echo "============================================================"
    echo "  Step 1: Packaging chaincode '${CC_NAME}' (CcaaS)"
    echo "============================================================"

    mkdir -p "${CC_PKG_DIR}"

    CONNECTION_JSON="${CC_SRC_PATH}/ccaas/connection.json"
    if [ ! -f "${CONNECTION_JSON}" ]; then
        echo "ERROR: connection.json not found at ${CONNECTION_JSON}"
        exit 1
    fi

    TEMP_DIR=$(mktemp -d)

    # Create code.tar.gz containing connection.json
    cp "${CONNECTION_JSON}" "${TEMP_DIR}/connection.json"
    tar czf "${TEMP_DIR}/code.tar.gz" -C "${TEMP_DIR}" connection.json

    # Create metadata.json with type=ccaas
    cat > "${TEMP_DIR}/metadata.json" <<EOF
{"type":"ccaas","label":"${CC_LABEL}"}
EOF

    # Create the final chaincode package
    tar czf "${CC_PKG_FILE}" -C "${TEMP_DIR}" code.tar.gz metadata.json

    rm -rf "${TEMP_DIR}"

    echo ">>> CcaaS chaincode package created: ${CC_PKG_FILE}"
    echo ""
}

# -----------------------------------------------------------------------------
# Step 2: Install on RevenueOrg peer
# -----------------------------------------------------------------------------
install_on_revenue() {
    echo "============================================================"
    echo "  Step 2: Installing on RevenueOrg peer"
    echo "============================================================"

    echo ">>> Installing on peer0.revenue..."
    set_peer0_revenue_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Chaincode installed on RevenueOrg peer."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 3: Get package ID
# -----------------------------------------------------------------------------
get_package_id() {
    echo "============================================================"
    echo "  Step 3: Querying installed chaincode package ID"
    echo "============================================================"

    set_peer0_revenue_env

    PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | \
        grep "${CC_LABEL}" | \
        sed -n "s/^Package ID: \(.*\), Label:.*$/\1/p")

    if [ -z "${PACKAGE_ID}" ]; then
        echo "ERROR: Could not retrieve package ID for label '${CC_LABEL}'."
        exit 1
    fi

    echo ">>> Package ID: ${PACKAGE_ID}"
    echo ""
}

# -----------------------------------------------------------------------------
# Step 3b: Start the chaincode container with the correct package ID
# -----------------------------------------------------------------------------
start_chaincode_container() {
    echo "============================================================"
    echo "  Step 3b: Starting chaincode container"
    echo "============================================================"

    export CC_LAND_REGISTRY_PACKAGE_ID="${PACKAGE_ID}"

    cd "${DOCKER_COMPOSE_DIR}"
    docker compose -f docker-compose.dev.yaml up -d --force-recreate cc-land-registry.bhulekhchain.dev
    cd - > /dev/null

    echo ">>> Waiting for chaincode gRPC server..."
    sleep 5

    echo ">>> Chaincode container started with CCID: ${PACKAGE_ID}"
    echo ""
}

# -----------------------------------------------------------------------------
# Step 4: Approve for RevenueOrg
# -----------------------------------------------------------------------------
approve_for_revenue() {
    echo "============================================================"
    echo "  Step 4: Approving chaincode for RevenueOrg"
    echo "============================================================"

    set_peer0_revenue_env

    peer lifecycle chaincode approveformyorg \
        -o "${ORDERER_ADDRESS}" \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --version "${CC_VERSION}" \
        --package-id "${PACKAGE_ID}" \
        --sequence ${CC_SEQUENCE} \
        --tls \
        --cafile "${ORDERER_CA}" \
        --waitForEvent

    echo ">>> Chaincode approved for RevenueOrg."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 5: Install on BankOrg peer
# -----------------------------------------------------------------------------
install_on_bank() {
    echo "============================================================"
    echo "  Step 5: Installing on BankOrg peer"
    echo "============================================================"

    echo ">>> Installing on peer0.bank..."
    set_peer0_bank_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Chaincode installed on BankOrg peer."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 6: Approve for BankOrg
# -----------------------------------------------------------------------------
approve_for_bank() {
    echo "============================================================"
    echo "  Step 6: Approving chaincode for BankOrg"
    echo "============================================================"

    set_peer0_bank_env

    peer lifecycle chaincode approveformyorg \
        -o "${ORDERER_ADDRESS}" \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --version "${CC_VERSION}" \
        --package-id "${PACKAGE_ID}" \
        --sequence ${CC_SEQUENCE} \
        --tls \
        --cafile "${ORDERER_CA}" \
        --waitForEvent

    echo ">>> Chaincode approved for BankOrg."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 7: Check commit readiness
# -----------------------------------------------------------------------------
check_commit_readiness() {
    echo "============================================================"
    echo "  Step 7: Checking commit readiness"
    echo "============================================================"

    set_peer0_revenue_env

    peer lifecycle chaincode checkcommitreadiness \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --version "${CC_VERSION}" \
        --sequence ${CC_SEQUENCE} \
        --tls \
        --cafile "${ORDERER_CA}" \
        --output json

    echo ""
}

# -----------------------------------------------------------------------------
# Step 8: Commit chaincode definition
# -----------------------------------------------------------------------------
commit_chaincode() {
    echo "============================================================"
    echo "  Step 8: Committing chaincode definition"
    echo "============================================================"

    set_peer0_revenue_env

    peer lifecycle chaincode commit \
        -o "${ORDERER_ADDRESS}" \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --version "${CC_VERSION}" \
        --sequence ${CC_SEQUENCE} \
        --tls \
        --cafile "${ORDERER_CA}" \
        --peerAddresses "localhost:7051" \
        --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
        --peerAddresses "localhost:9051" \
        --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt"

    echo ">>> Chaincode definition committed."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 9: Query committed chaincode
# -----------------------------------------------------------------------------
query_committed() {
    echo "============================================================"
    echo "  Step 9: Verifying committed chaincode"
    echo "============================================================"

    set_peer0_revenue_env

    peer lifecycle chaincode querycommitted \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --tls \
        --cafile "${ORDERER_CA}"

    echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  BhulekhChain — Deploy Chaincode (CcaaS)"
echo "  Chaincode: ${CC_NAME}"
echo "  Version:   ${CC_VERSION}"
echo "  Sequence:  ${CC_SEQUENCE}"
echo "  Channel:   ${CHANNEL_NAME}"
echo "============================================================"
echo ""

package_chaincode
install_on_revenue
get_package_id
start_chaincode_container
approve_for_revenue
install_on_bank
approve_for_bank
check_commit_readiness
commit_chaincode
query_committed

echo "============================================================"
echo "  Chaincode '${CC_NAME}' v${CC_VERSION} deployed successfully!"
echo "  Channel: ${CHANNEL_NAME}"
echo "============================================================"
echo ""
