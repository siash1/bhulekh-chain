#!/bin/bash
# =============================================================================
# BhulekhChain — Join Channel Script
# =============================================================================
# Joins all peers from RevenueOrg and BankOrg to the land-registry-channel,
# then updates anchor peers for each organization.
#
# Prerequisites:
#   - Channel has been created (run create-channel.sh first)
#   - All peer containers are running
#
# Usage: ./join-channel.sh
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
CHANNEL_NAME="land-registry-channel"
CHANNEL_ARTIFACTS_DIR="${PWD}/../channel-artifacts"
CRYPTO_DIR="${PWD}/../crypto-material"

# Fabric peer CLI requires core.yaml
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$(cd "${PWD}/../../../.." && pwd)/config}"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="localhost:7050"
BLOCK_FILE="${CHANNEL_ARTIFACTS_DIR}/${CHANNEL_NAME}.block"

MAX_RETRY=5
DELAY=3

# -----------------------------------------------------------------------------
# Verify channel block exists
# -----------------------------------------------------------------------------
if [ ! -f "${BLOCK_FILE}" ]; then
    echo "ERROR: Channel block file not found at ${BLOCK_FILE}"
    echo "       Run create-channel.sh first."
    exit 1
fi

# -----------------------------------------------------------------------------
# Environment setters for each peer
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
# Join a peer to the channel (with retry)
# -----------------------------------------------------------------------------
join_channel_with_retry() {
    local peer_name=$1
    local rc=1
    local counter=0

    echo ">>> Joining ${peer_name} to channel '${CHANNEL_NAME}'..."

    while [ $rc -ne 0 ] && [ $counter -lt $MAX_RETRY ]; do
        counter=$((counter + 1))
        echo "    Attempt ${counter}/${MAX_RETRY}..."

        set +e
        peer channel join -b "${BLOCK_FILE}" 2>&1
        rc=$?
        set -e

        if [ $rc -ne 0 ]; then
            echo "    Join failed. Retrying in ${DELAY}s..."
            sleep $DELAY
        fi
    done

    if [ $rc -ne 0 ]; then
        echo "ERROR: ${peer_name} failed to join channel after ${MAX_RETRY} attempts."
        exit 1
    fi

    echo ">>> ${peer_name} joined channel '${CHANNEL_NAME}' successfully."
    echo ""
}

# -----------------------------------------------------------------------------
# Update anchor peers for an organization
# -----------------------------------------------------------------------------
update_anchor_peers() {
    local org_name=$1
    local anchor_tx="${CHANNEL_ARTIFACTS_DIR}/${org_name}anchors.tx"

    if [ ! -f "${anchor_tx}" ]; then
        echo ">>> Anchor peer update TX not found for ${org_name}. Skipping."
        return
    fi

    echo ">>> Updating anchor peers for ${org_name}..."

    set +e
    peer channel update \
        -o "${ORDERER_ADDRESS}" \
        -c "${CHANNEL_NAME}" \
        -f "${anchor_tx}" \
        --tls \
        --cafile "${ORDERER_CA}" \
        2>&1
    local rc=$?
    set -e

    if [ $rc -ne 0 ]; then
        echo "WARNING: Anchor peer update for ${org_name} failed (may already be set)."
    else
        echo ">>> Anchor peers updated for ${org_name}."
    fi
    echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  BhulekhChain — Join Channel"
echo "  Channel: ${CHANNEL_NAME}"
echo "============================================================"
echo ""

# --- Join peer0.revenue ---
echo "------------------------------------------------------------"
echo "  [1/2] peer0.revenue.bhulekhchain.dev"
echo "------------------------------------------------------------"
set_peer0_revenue_env
join_channel_with_retry "peer0.revenue.bhulekhchain.dev"

# --- Join peer0.bank ---
echo "------------------------------------------------------------"
echo "  [2/2] peer0.bank.bhulekhchain.dev"
echo "------------------------------------------------------------"
set_peer0_bank_env
join_channel_with_retry "peer0.bank.bhulekhchain.dev"

# --- Update anchor peers ---
echo "============================================================"
echo "  Updating Anchor Peers"
echo "============================================================"
echo ""

set_peer0_revenue_env
update_anchor_peers "RevenueOrgMSP"

set_peer0_bank_env
update_anchor_peers "BankOrgMSP"

# --- Verify ---
echo "============================================================"
echo "  Verifying Channel Membership"
echo "============================================================"
echo ""

echo ">>> peer0.revenue channel list:"
set_peer0_revenue_env
peer channel list

echo ""
echo ">>> peer0.bank channel list:"
set_peer0_bank_env
peer channel list

echo ""
echo "============================================================"
echo "  All peers joined '${CHANNEL_NAME}' successfully."
echo "  Next step: Run deploy-chaincode.sh <chaincode-name>"
echo "============================================================"
echo ""
