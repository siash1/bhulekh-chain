#!/bin/bash
# =============================================================================
# BhulekhChain — Upgrade Chaincode Script
# =============================================================================
# Upgrades an existing chaincode on the land-registry-channel using the
# Fabric 2.x lifecycle (package, install, approve with new sequence, commit).
#
# Usage: ./upgrade-chaincode.sh <chaincode-name> <new-version>
# Example: ./upgrade-chaincode.sh land-registry 2.0
#          ./upgrade-chaincode.sh stamp-duty 1.1
#
# The script automatically determines the next sequence number by querying
# the currently committed chaincode definition.
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Validate arguments
# -----------------------------------------------------------------------------
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "ERROR: Chaincode name and version are required."
    echo "Usage: $0 <chaincode-name> <new-version>"
    echo "Example: $0 land-registry 2.0"
    exit 1
fi

CC_NAME="$1"
CC_VERSION="$2"
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_SRC_PATH="${PWD}/../../chaincode/${CC_NAME}"
CC_RUNTIME_LANGUAGE="golang"

CHANNEL_NAME="land-registry-channel"
CRYPTO_DIR="${PWD}/../crypto-material"

# Fabric peer CLI requires core.yaml
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$(cd "${PWD}/../../../.." && pwd)/config}"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="localhost:7050"

CC_PKG_DIR="${PWD}/../channel-artifacts"
CC_PKG_FILE="${CC_PKG_DIR}/${CC_NAME}_${CC_VERSION}.tar.gz"

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
# Step 1: Determine next sequence number
# -----------------------------------------------------------------------------
determine_sequence() {
    echo "============================================================"
    echo "  Step 1: Determining next sequence number"
    echo "============================================================"

    set_peer0_revenue_env

    # Query current committed sequence
    set +e
    CURRENT_SEQUENCE=$(peer lifecycle chaincode querycommitted \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --tls \
        --cafile "${ORDERER_CA}" 2>&1 | \
        grep -oP 'Sequence: \K[0-9]+')
    set -e

    if [ -z "${CURRENT_SEQUENCE}" ]; then
        echo "WARNING: Could not determine current sequence. Defaulting to 2."
        CURRENT_SEQUENCE=1
    fi

    CC_SEQUENCE=$((CURRENT_SEQUENCE + 1))

    echo ">>> Current sequence: ${CURRENT_SEQUENCE}"
    echo ">>> New sequence:     ${CC_SEQUENCE}"
    echo ""
}

# -----------------------------------------------------------------------------
# Step 2: Package new version
# -----------------------------------------------------------------------------
package_chaincode() {
    echo "============================================================"
    echo "  Step 2: Packaging chaincode '${CC_NAME}' v${CC_VERSION}"
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
# Step 3: Install new version on all peers
# -----------------------------------------------------------------------------
install_on_all_peers() {
    echo "============================================================"
    echo "  Step 3: Installing new version on all peers"
    echo "============================================================"

    echo ">>> Installing on peer0.revenue..."
    set_peer0_revenue_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Installing on peer0.bank..."
    set_peer0_bank_env
    peer lifecycle chaincode install "${CC_PKG_FILE}"

    echo ">>> Chaincode v${CC_VERSION} installed on all peers."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 4: Get new package ID
# -----------------------------------------------------------------------------
get_package_id() {
    echo "============================================================"
    echo "  Step 4: Querying new package ID"
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
# Step 5: Approve new version for RevenueOrg
# -----------------------------------------------------------------------------
approve_for_revenue() {
    echo "============================================================"
    echo "  Step 5: Approving new version for RevenueOrg"
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

    echo ">>> New version approved for RevenueOrg."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 6: Approve new version for BankOrg
# -----------------------------------------------------------------------------
approve_for_bank() {
    echo "============================================================"
    echo "  Step 6: Approving new version for BankOrg"
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

    echo ">>> New version approved for BankOrg."
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
# Step 8: Commit new chaincode definition
# -----------------------------------------------------------------------------
commit_chaincode() {
    echo "============================================================"
    echo "  Step 8: Committing new chaincode definition"
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

    echo ">>> New chaincode definition committed."
    echo ""
}

# -----------------------------------------------------------------------------
# Step 9: Verify upgrade
# -----------------------------------------------------------------------------
query_committed() {
    echo "============================================================"
    echo "  Step 9: Verifying upgraded chaincode"
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
echo "  BhulekhChain — Upgrade Chaincode"
echo "  Chaincode: ${CC_NAME}"
echo "  Version:   ${CC_VERSION}"
echo "  Channel:   ${CHANNEL_NAME}"
echo "============================================================"
echo ""

determine_sequence
package_chaincode
install_on_all_peers
get_package_id
approve_for_revenue
approve_for_bank
check_commit_readiness
commit_chaincode
query_committed

echo "============================================================"
echo "  Chaincode '${CC_NAME}' upgraded to v${CC_VERSION}!"
echo "  Sequence: ${CC_SEQUENCE}"
echo "  Channel:  ${CHANNEL_NAME}"
echo "============================================================"
echo ""
