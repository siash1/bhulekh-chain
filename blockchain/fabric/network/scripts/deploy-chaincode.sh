#!/bin/bash
# =============================================================================
# BhulekhChain — Deploy Chaincode Script
# =============================================================================
# Deploys a chaincode to the land-registry-channel using the Fabric 2.x
# lifecycle (package, install, approve, commit).
#
# Usage: ./deploy-chaincode.sh <chaincode-name>
# Example: ./deploy-chaincode.sh land-registry
#          ./deploy-chaincode.sh stamp-duty
#
# The chaincode source is expected at:
#   blockchain/fabric/chaincode/<chaincode-name>/
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
CC_RUNTIME_LANGUAGE="golang"

CHANNEL_NAME="land-registry-channel"
CRYPTO_DIR="${PWD}/../organizations"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="orderer0.orderer.bhulekhchain.dev:7050"

CC_PKG_DIR="${PWD}/../channel-artifacts"
CC_PKG_FILE="${CC_PKG_DIR}/${CC_NAME}.tar.gz"

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
    export CORE_PEER_ADDRESS="peer0.revenue.bhulekhchain.dev:7051"
}

set_peer1_revenue_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer1.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/Admin@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="peer1.revenue.bhulekhchain.dev:8051"
}

set_peer0_bank_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="BankOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/users/Admin@bank.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="peer0.bank.bhulekhchain.dev:9051"
}

# -----------------------------------------------------------------------------
# Step 1: Package chaincode
# -----------------------------------------------------------------------------
package_chaincode() {
    echo "============================================================"
    echo "  Step 1: Packaging chaincode '${CC_NAME}'"
    echo "============================================================"

    mkdir -p "${CC_PKG_DIR}"

    # Vendor Go dependencies if applicable
    if [ -f "${CC_SRC_PATH}/go.mod" ]; then
        echo ">>> Vendoring Go dependencies..."
        pushd "${CC_SRC_PATH}" > /dev/null
        GO111MODULE=on go mod vendor
        popd > /dev/null
    fi

    peer lifecycle chaincode package "${CC_PKG_FILE}" \
        --path "${CC_SRC_PATH}" \
        --lang "${CC_RUNTIME_LANGUAGE}" \
        --label "${CC_LABEL}"

    echo ">>> Chaincode packaged: ${CC_PKG_FILE}"
    echo ""
}

# -----------------------------------------------------------------------------
# Step 2: Install on RevenueOrg peers
# -----------------------------------------------------------------------------
install_on_revenue() {
    echo "============================================================"
    echo "  Step 2: Installing on RevenueOrg peers"
    echo "============================================================"

    echo ">>> Installing on peer0.revenue..."
    set_peer0_revenue_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Installing on peer1.revenue..."
    set_peer1_revenue_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Chaincode installed on all RevenueOrg peers."
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
        --peerAddresses "peer0.revenue.bhulekhchain.dev:7051" \
        --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
        --peerAddresses "peer0.bank.bhulekhchain.dev:9051" \
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
echo "  BhulekhChain — Deploy Chaincode"
echo "  Chaincode: ${CC_NAME}"
echo "  Version:   ${CC_VERSION}"
echo "  Sequence:  ${CC_SEQUENCE}"
echo "  Channel:   ${CHANNEL_NAME}"
echo "============================================================"
echo ""

package_chaincode
install_on_revenue
get_package_id
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
