#!/bin/bash
# =============================================================================
# BhulekhChain — Chaincode Smoke Test
# =============================================================================
# Verifies the land-registry chaincode is deployed and responding on the
# land-registry-channel.
#
# Tests:
#   1. Query a non-existent property (expects PROPERTY_NOT_FOUND)
#   2. Invoke RegisterProperty with test data (expects success or ABAC error)
#   3. Query back the registered property
#
# Usage: ./test-chaincode.sh
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
CHANNEL_NAME="land-registry-channel"
CC_NAME="land-registry"
CRYPTO_DIR="${PWD}/../crypto-material"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="orderer0.orderer.bhulekhchain.dev:7050"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; WARN=$((WARN + 1)); }

# -----------------------------------------------------------------------------
# Set peer environment for revenue org admin
# -----------------------------------------------------------------------------
set_peer0_revenue_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/Admin@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="peer0.revenue.bhulekhchain.dev:7051"
}

echo ""
echo "============================================================"
echo "  BhulekhChain — Chaincode Smoke Test"
echo "  Channel:   ${CHANNEL_NAME}"
echo "  Chaincode: ${CC_NAME}"
echo "============================================================"
echo ""

set_peer0_revenue_env

# -----------------------------------------------------------------------------
# Test 1: Query a non-existent property
# Expects PROPERTY_NOT_FOUND error — confirms chaincode is deployed and
# responding to queries.
# -----------------------------------------------------------------------------
echo "--- Test 1: Query non-existent property ---"

set +e
QUERY_RESULT=$(peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CC_NAME}" \
    -c '{"function":"GetProperty","Args":["PROP-DL-000-000-000-SMOKE"]}' \
    2>&1)
QUERY_RC=$?
set -e

if echo "${QUERY_RESULT}" | grep -q "PROPERTY_NOT_FOUND"; then
    pass "GetProperty returns PROPERTY_NOT_FOUND for non-existent property"
elif [ $QUERY_RC -ne 0 ]; then
    fail "GetProperty query failed unexpectedly: ${QUERY_RESULT}"
else
    fail "GetProperty did not return expected error for non-existent property"
fi

# -----------------------------------------------------------------------------
# Test 2: Invoke RegisterProperty with test data
# This may fail with ABAC error if cryptogen certs lack role attributes.
# An ABAC error still confirms the chaincode is running and processing logic.
# -----------------------------------------------------------------------------
echo ""
echo "--- Test 2: Invoke RegisterProperty ---"

TEST_PROPERTY_ID="PROP-DL-001-001-001-SMOKE"
TEST_AADHAAR_HASH="sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

TEST_PROPERTY_JSON=$(cat <<EOJSON
{
  "propertyId": "${TEST_PROPERTY_ID}",
  "surveyNumber": "101",
  "subSurveyNumber": "",
  "location": {
    "stateCode": "DL",
    "stateName": "Delhi",
    "districtCode": "001",
    "districtName": "New Delhi",
    "tehsilCode": "001",
    "tehsilName": "Chanakyapuri",
    "villageCode": "001",
    "villageName": "Test Village",
    "pinCode": "110021"
  },
  "area": {
    "value": 500.0,
    "unit": "SQ_METERS",
    "localValue": 0.124,
    "localUnit": "ACRES"
  },
  "boundaries": {
    "north": "Plot 102",
    "south": "Main Road",
    "east": "Plot 100",
    "west": "Park"
  },
  "currentOwner": {
    "ownerType": "INDIVIDUAL",
    "owners": [{
      "aadhaarHash": "${TEST_AADHAAR_HASH}",
      "name": "Raj Kumar",
      "fatherName": "Shyam Kumar",
      "sharePercentage": 100,
      "isMinor": false
    }],
    "ownershipType": "FREEHOLD",
    "acquisitionType": "PURCHASE",
    "acquisitionDate": "2020-01-15"
  },
  "landUse": "RESIDENTIAL",
  "landClassification": "URBAN",
  "taxInfo": {
    "annualLandRevenue": 500000,
    "lastPaidDate": "2025-03-31",
    "paidUpToYear": "2024-25"
  },
  "registrationInfo": {
    "registrationNumber": "REG-DL-2020-001234",
    "bookNumber": "BOOK-I-2020",
    "subRegistrarOffice": "SRO New Delhi",
    "registrationDate": "2020-01-15"
  },
  "provenance": {
    "sequence": 1
  }
}
EOJSON
)

set +e
INVOKE_RESULT=$(peer chaincode invoke \
    -o "${ORDERER_ADDRESS}" \
    -C "${CHANNEL_NAME}" \
    -n "${CC_NAME}" \
    -c "{\"function\":\"RegisterProperty\",\"Args\":[$(echo "${TEST_PROPERTY_JSON}" | jq -c . | jq -Rs .)]}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses "peer0.revenue.bhulekhchain.dev:7051" \
    --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
    --waitForEvent \
    2>&1)
INVOKE_RC=$?
set -e

if [ $INVOKE_RC -eq 0 ]; then
    pass "RegisterProperty invoke succeeded"

    # Wait for state to be committed
    sleep 2

    # -------------------------------------------------------------------------
    # Test 3: Query back the registered property
    # -------------------------------------------------------------------------
    echo ""
    echo "--- Test 3: Query registered property ---"

    set +e
    VERIFY_RESULT=$(peer chaincode query \
        -C "${CHANNEL_NAME}" \
        -n "${CC_NAME}" \
        -c "{\"function\":\"GetProperty\",\"Args\":[\"${TEST_PROPERTY_ID}\"]}" \
        2>&1)
    VERIFY_RC=$?
    set -e

    if [ $VERIFY_RC -eq 0 ]; then
        # Check that the returned data contains our property ID
        if echo "${VERIFY_RESULT}" | grep -q "${TEST_PROPERTY_ID}"; then
            pass "GetProperty returns the registered property"
        else
            fail "GetProperty returned unexpected data: ${VERIFY_RESULT}"
        fi

        # Verify owner name
        if echo "${VERIFY_RESULT}" | grep -q "Raj Kumar"; then
            pass "Property has correct owner name"
        else
            warn "Owner name not found in query result"
        fi

        # Verify status
        if echo "${VERIFY_RESULT}" | grep -q '"status":"ACTIVE"'; then
            pass "Property status is ACTIVE"
        else
            warn "Could not verify property status"
        fi
    else
        fail "GetProperty query failed: ${VERIFY_RESULT}"
    fi
elif echo "${INVOKE_RESULT}" | grep -q "AUTHORIZATION_FAILED\|ACCESS_DENIED\|does not have attribute\|requireRole"; then
    warn "RegisterProperty failed due to ABAC (role check) — this is expected with cryptogen certs"
    warn "Chaincode IS deployed and processing requests; set up Fabric CA with role attributes for full test"
    echo ""
    echo "--- Test 3: Skipped (registration did not succeed) ---"
    warn "Skipping GetProperty verification"
else
    fail "RegisterProperty invoke failed unexpectedly: ${INVOKE_RESULT}"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Smoke Test Results"
echo "============================================================"
echo ""
echo -e "  ${GREEN}PASS: ${PASS}${NC}"
echo -e "  ${RED}FAIL: ${FAIL}${NC}"
echo -e "  ${YELLOW}WARN: ${WARN}${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}SMOKE TEST FAILED${NC}"
    echo ""
    exit 1
else
    echo -e "  ${GREEN}SMOKE TEST PASSED${NC}"
    echo ""
    exit 0
fi
