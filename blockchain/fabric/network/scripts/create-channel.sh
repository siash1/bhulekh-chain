#!/bin/bash
# =============================================================================
# BhulekhChain — Create Channel Script
# =============================================================================
# Creates the 'land-registry-channel' application channel.
#
# Prerequisites:
#   - Fabric network is running (orderer + peers)
#   - Crypto material generated via cryptogen
#   - channel.tx generated via configtxgen
#
# Usage: ./create-channel.sh
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

MAX_RETRY=5
DELAY=3

# -----------------------------------------------------------------------------
# Set environment for peer0.revenue
# -----------------------------------------------------------------------------
set_revenue_peer0_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/Admin@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

# -----------------------------------------------------------------------------
# Create channel
# -----------------------------------------------------------------------------
create_channel() {
    echo "============================================================"
    echo "  Creating channel: ${CHANNEL_NAME}"
    echo "============================================================"

    local rc=1
    local counter=0

    while [ $rc -ne 0 ] && [ $counter -lt $MAX_RETRY ]; do
        counter=$((counter + 1))
        echo ">>> Attempt ${counter}/${MAX_RETRY}: Creating channel..."

        set +e
        peer channel create \
            -o "${ORDERER_ADDRESS}" \
            -c "${CHANNEL_NAME}" \
            -f "${CHANNEL_ARTIFACTS_DIR}/channel.tx" \
            --outputBlock "${CHANNEL_ARTIFACTS_DIR}/${CHANNEL_NAME}.block" \
            --tls \
            --cafile "${ORDERER_CA}" \
            2>&1
        rc=$?
        set -e

        if [ $rc -ne 0 ]; then
            echo ">>> Channel creation failed. Retrying in ${DELAY}s..."
            sleep $DELAY
        fi
    done

    if [ $rc -ne 0 ]; then
        echo "ERROR: Failed to create channel '${CHANNEL_NAME}' after ${MAX_RETRY} attempts."
        exit 1
    fi

    echo ""
    echo ">>> Channel '${CHANNEL_NAME}' created successfully."
    echo ">>> Channel block: ${CHANNEL_ARTIFACTS_DIR}/${CHANNEL_NAME}.block"
    echo ""
}

# -----------------------------------------------------------------------------
# Generate channel artifacts if not present
# -----------------------------------------------------------------------------
generate_channel_artifacts() {
    if [ ! -f "${CHANNEL_ARTIFACTS_DIR}/channel.tx" ]; then
        echo ">>> Channel transaction file not found. Generating..."
        mkdir -p "${CHANNEL_ARTIFACTS_DIR}"

        configtxgen \
            -profile LandRegistryChannel \
            -outputCreateChannelTx "${CHANNEL_ARTIFACTS_DIR}/channel.tx" \
            -channelID "${CHANNEL_NAME}" \
            -configPath "${PWD}/.."
        echo ">>> channel.tx generated."
    else
        echo ">>> channel.tx already exists. Skipping generation."
    fi
}

# -----------------------------------------------------------------------------
# Generate anchor peer updates
# -----------------------------------------------------------------------------
generate_anchor_peer_updates() {
    echo ">>> Generating anchor peer update for RevenueOrg..."
    configtxgen \
        -profile LandRegistryChannel \
        -outputAnchorPeersUpdate "${CHANNEL_ARTIFACTS_DIR}/RevenueOrgMSPanchors.tx" \
        -channelID "${CHANNEL_NAME}" \
        -asOrg RevenueOrgMSP \
        -configPath "${PWD}/.."

    echo ">>> Generating anchor peer update for BankOrg..."
    configtxgen \
        -profile LandRegistryChannel \
        -outputAnchorPeersUpdate "${CHANNEL_ARTIFACTS_DIR}/BankOrgMSPanchors.tx" \
        -channelID "${CHANNEL_NAME}" \
        -asOrg BankOrgMSP \
        -configPath "${PWD}/.."

    echo ">>> Anchor peer updates generated."
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  BhulekhChain — Channel Creation"
echo "  Channel: ${CHANNEL_NAME}"
echo "============================================================"
echo ""

generate_channel_artifacts
generate_anchor_peer_updates

set_revenue_peer0_env
create_channel

echo "============================================================"
echo "  Channel '${CHANNEL_NAME}' is ready."
echo "  Next step: Run join-channel.sh to join all peers."
echo "============================================================"
echo ""
