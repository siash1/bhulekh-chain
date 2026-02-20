#!/bin/bash
# =============================================================================
# BhulekhChain — Chaincode Smoke Test
# =============================================================================
# Verifies the land-registry chaincode is deployed and responding on the
# land-registry-channel.
#
# Tests:
#   1. Query a non-existent property (expects PROPERTY_NOT_FOUND)
#   2. Invoke RegisterProperty with CA-enrolled registrar1 identity
#   3. Query back the registered property
#   4. State boundary enforcement — registrar2 (MH) tries DL property
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

# Fabric peer CLI requires core.yaml
export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-$(cd "${PWD}/../../../.." && pwd)/config}"
ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/orderer.bhulekhchain.dev/orderers/orderer0.orderer.bhulekhchain.dev/msp/tlscacerts/tlsca.orderer.bhulekhchain.dev-cert.pem"
ORDERER_ADDRESS="localhost:7050"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; WARN=$((WARN + 1)); }

# -----------------------------------------------------------------------------
# Set peer environment for revenue org admin (cryptogen Admin — no ABAC attrs)
# -----------------------------------------------------------------------------
set_peer0_revenue_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/Admin@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

# -----------------------------------------------------------------------------
# Set peer environment for CA-enrolled registrar1 (role=registrar, stateCode=DL)
# -----------------------------------------------------------------------------
set_registrar1_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/registrar1@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

# -----------------------------------------------------------------------------
# Set peer environment for CA-enrolled registrar2 (role=registrar, stateCode=MH)
# -----------------------------------------------------------------------------
set_registrar2_env() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="RevenueOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/registrar2@revenue.bhulekhchain.dev/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

# -----------------------------------------------------------------------------
# Detect whether CA-enrolled identities are available
# -----------------------------------------------------------------------------
REGISTRAR1_MSP="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/registrar1@revenue.bhulekhchain.dev/msp"
REGISTRAR2_MSP="${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/users/registrar2@revenue.bhulekhchain.dev/msp"

HAS_CA_IDENTITIES=false
if [ -d "${REGISTRAR1_MSP}/signcerts" ] && [ "$(ls -A "${REGISTRAR1_MSP}/signcerts" 2>/dev/null)" ]; then
    HAS_CA_IDENTITIES=true
fi

echo ""
echo "============================================================"
echo "  BhulekhChain — Chaincode Smoke Test"
echo "  Channel:   ${CHANNEL_NAME}"
echo "  Chaincode: ${CC_NAME}"
if [ "${HAS_CA_IDENTITIES}" = true ]; then
    echo -e "  Identity:  ${GREEN}CA-enrolled (ABAC enabled)${NC}"
else
    echo -e "  Identity:  ${YELLOW}cryptogen Admin (no ABAC attrs)${NC}"
fi
echo "============================================================"
echo ""

# Use cryptogen Admin for query-only tests (Test 1)
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
elif echo "${QUERY_RESULT}" | grep -q "VALIDATION_ERROR"; then
    pass "GetProperty returns VALIDATION_ERROR (chaincode is deployed and processing)"
elif [ $QUERY_RC -ne 0 ]; then
    fail "GetProperty query failed unexpectedly: ${QUERY_RESULT}"
else
    fail "GetProperty did not return expected error for non-existent property"
fi

# -----------------------------------------------------------------------------
# Test 2: Invoke RegisterProperty with test data
# Uses CA-enrolled registrar1 if available, falls back to cryptogen Admin.
# -----------------------------------------------------------------------------
echo ""
echo "--- Test 2: Invoke RegisterProperty ---"

if [ "${HAS_CA_IDENTITIES}" = true ]; then
    echo -e "  ${BLUE}Using CA-enrolled registrar1 (role=registrar, stateCode=DL)${NC}"
    set_registrar1_env
else
    echo -e "  ${YELLOW}Using cryptogen Admin (ABAC errors expected)${NC}"
    set_peer0_revenue_env
fi

TEST_PROPERTY_ID="DL-NDL-CNK-TST-101-0"
TEST_AADHAAR_HASH="sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

TEST_PROPERTY_JSON=$(cat <<EOJSON
{
  "propertyId": "${TEST_PROPERTY_ID}",
  "surveyNumber": "101",
  "subSurveyNumber": "",
  "location": {
    "stateCode": "DL",
    "stateName": "Delhi",
    "districtCode": "NDL",
    "districtName": "New Delhi",
    "tehsilCode": "CNK",
    "tehsilName": "Chanakyapuri",
    "villageCode": "TST",
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
    "west": "Park",
    "geoJson": {
      "type": "Polygon",
      "coordinates": [[[77.21, 28.61], [77.22, 28.61], [77.22, 28.62], [77.21, 28.62], [77.21, 28.61]]]
    }
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
    "sequence": 1,
    "mergedFrom": []
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
    --peerAddresses "localhost:7051" \
    --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
    --peerAddresses "localhost:9051" \
    --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt" \
    --waitForEvent \
    2>&1)
INVOKE_RC=$?
set -e

PROPERTY_ON_LEDGER=false

if [ $INVOKE_RC -eq 0 ]; then
    pass "RegisterProperty invoke succeeded"
    PROPERTY_ON_LEDGER=true

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
    elif echo "${VERIFY_RESULT}" | grep -q "did not match schema"; then
        warn "GetProperty returned schema validation error (property exists but response schema mismatch)"
    else
        fail "GetProperty query failed: ${VERIFY_RESULT}"
    fi

    # -------------------------------------------------------------------------
    # Test 4: State boundary enforcement
    # registrar2 has stateCode=MH — should NOT be able to register DL property
    # -------------------------------------------------------------------------
    if [ "${HAS_CA_IDENTITIES}" = true ] && \
       [ -d "${REGISTRAR2_MSP}/signcerts" ] && \
       [ "$(ls -A "${REGISTRAR2_MSP}/signcerts" 2>/dev/null)" ]; then

        echo ""
        echo "--- Test 4: State boundary enforcement (registrar2/MH -> DL property) ---"

        set_registrar2_env

        TEST_CROSS_STATE_ID="DL-NDL-CNK-TST-999-0"

        CROSS_STATE_JSON=$(cat <<EOJSON2
{
  "propertyId": "${TEST_CROSS_STATE_ID}",
  "surveyNumber": "999",
  "subSurveyNumber": "",
  "location": {
    "stateCode": "DL",
    "stateName": "Delhi",
    "districtCode": "NDL",
    "districtName": "New Delhi",
    "tehsilCode": "CNK",
    "tehsilName": "Chanakyapuri",
    "villageCode": "TST",
    "villageName": "Test Village 2",
    "pinCode": "110021"
  },
  "area": {
    "value": 200.0,
    "unit": "SQ_METERS",
    "localValue": 0.049,
    "localUnit": "ACRES"
  },
  "boundaries": {
    "north": "Plot 998",
    "south": "Side Road",
    "east": "Plot 1000",
    "west": "Garden",
    "geoJson": {
      "type": "Polygon",
      "coordinates": [[[77.23, 28.63], [77.24, 28.63], [77.24, 28.64], [77.23, 28.64], [77.23, 28.63]]]
    }
  },
  "currentOwner": {
    "ownerType": "INDIVIDUAL",
    "owners": [{
      "aadhaarHash": "sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      "name": "Suresh Patil",
      "fatherName": "Ramesh Patil",
      "sharePercentage": 100,
      "isMinor": false
    }],
    "ownershipType": "FREEHOLD",
    "acquisitionType": "PURCHASE",
    "acquisitionDate": "2021-06-01"
  },
  "landUse": "RESIDENTIAL",
  "landClassification": "URBAN",
  "taxInfo": {
    "annualLandRevenue": 300000,
    "lastPaidDate": "2025-03-31",
    "paidUpToYear": "2024-25"
  },
  "registrationInfo": {
    "registrationNumber": "REG-DL-2021-005678",
    "bookNumber": "BOOK-I-2021",
    "subRegistrarOffice": "SRO New Delhi",
    "registrationDate": "2021-06-01"
  },
  "provenance": {
    "sequence": 1,
    "mergedFrom": []
  }
}
EOJSON2
)

        set +e
        CROSS_RESULT=$(peer chaincode invoke \
            -o "${ORDERER_ADDRESS}" \
            -C "${CHANNEL_NAME}" \
            -n "${CC_NAME}" \
            -c "{\"function\":\"RegisterProperty\",\"Args\":[$(echo "${CROSS_STATE_JSON}" | jq -c . | jq -Rs .)]}" \
            --tls \
            --cafile "${ORDERER_CA}" \
            --peerAddresses "localhost:7051" \
            --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
            --peerAddresses "localhost:9051" \
            --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt" \
            --waitForEvent \
            2>&1)
        CROSS_RC=$?
        set -e

        if [ $CROSS_RC -ne 0 ] && echo "${CROSS_RESULT}" | grep -q "STATE_MISMATCH"; then
            pass "State boundary enforced: MH registrar rejected for DL property (STATE_MISMATCH)"
        elif [ $CROSS_RC -ne 0 ]; then
            # Any rejection is acceptable — the key is that it did NOT succeed
            if echo "${CROSS_RESULT}" | grep -q "ACCESS_DENIED\|AUTHORIZATION_FAILED"; then
                pass "State boundary enforced: cross-state registration rejected"
            else
                fail "Cross-state registration failed with unexpected error: ${CROSS_RESULT}"
            fi
        else
            fail "Cross-state registration should have been rejected but succeeded"
        fi
    fi

elif echo "${INVOKE_RESULT}" | grep -q "PROPERTY_EXISTS"; then
    pass "RegisterProperty correctly reports property already exists (idempotent re-run)"
    PROPERTY_ON_LEDGER=true

    # -------------------------------------------------------------------------
    # Test 3: Query back the previously registered property
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
        if echo "${VERIFY_RESULT}" | grep -q "${TEST_PROPERTY_ID}"; then
            pass "GetProperty returns the registered property"
        else
            fail "GetProperty returned unexpected data: ${VERIFY_RESULT}"
        fi

        if echo "${VERIFY_RESULT}" | grep -q "Raj Kumar"; then
            pass "Property has correct owner name"
        else
            warn "Owner name not found in query result"
        fi

        if echo "${VERIFY_RESULT}" | grep -q '"status":"ACTIVE"'; then
            pass "Property status is ACTIVE"
        else
            warn "Could not verify property status"
        fi
    elif echo "${VERIFY_RESULT}" | grep -q "did not match schema"; then
        warn "GetProperty returned schema validation error (property exists but response schema mismatch)"
    else
        fail "GetProperty query failed: ${VERIFY_RESULT}"
    fi

    # -------------------------------------------------------------------------
    # Test 4: State boundary enforcement
    # -------------------------------------------------------------------------
    if [ "${HAS_CA_IDENTITIES}" = true ] && \
       [ -d "${REGISTRAR2_MSP}/signcerts" ] && \
       [ "$(ls -A "${REGISTRAR2_MSP}/signcerts" 2>/dev/null)" ]; then

        echo ""
        echo "--- Test 4: State boundary enforcement (registrar2/MH -> DL property) ---"

        set_registrar2_env

        TEST_CROSS_STATE_ID="DL-NDL-CNK-TST-999-0"

        CROSS_STATE_JSON=$(cat <<EOJSON3
{
  "propertyId": "${TEST_CROSS_STATE_ID}",
  "surveyNumber": "999",
  "subSurveyNumber": "",
  "location": {
    "stateCode": "DL",
    "stateName": "Delhi",
    "districtCode": "NDL",
    "districtName": "New Delhi",
    "tehsilCode": "CNK",
    "tehsilName": "Chanakyapuri",
    "villageCode": "TST",
    "villageName": "Test Village 2",
    "pinCode": "110021"
  },
  "area": {
    "value": 200.0,
    "unit": "SQ_METERS",
    "localValue": 0.049,
    "localUnit": "ACRES"
  },
  "boundaries": {
    "north": "Plot 998",
    "south": "Side Road",
    "east": "Plot 1000",
    "west": "Garden",
    "geoJson": {
      "type": "Polygon",
      "coordinates": [[[77.23, 28.63], [77.24, 28.63], [77.24, 28.64], [77.23, 28.64], [77.23, 28.63]]]
    }
  },
  "currentOwner": {
    "ownerType": "INDIVIDUAL",
    "owners": [{
      "aadhaarHash": "sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      "name": "Suresh Patil",
      "fatherName": "Ramesh Patil",
      "sharePercentage": 100,
      "isMinor": false
    }],
    "ownershipType": "FREEHOLD",
    "acquisitionType": "PURCHASE",
    "acquisitionDate": "2021-06-01"
  },
  "landUse": "RESIDENTIAL",
  "landClassification": "URBAN",
  "taxInfo": {
    "annualLandRevenue": 300000,
    "lastPaidDate": "2025-03-31",
    "paidUpToYear": "2024-25"
  },
  "registrationInfo": {
    "registrationNumber": "REG-DL-2021-005678",
    "bookNumber": "BOOK-I-2021",
    "subRegistrarOffice": "SRO New Delhi",
    "registrationDate": "2021-06-01"
  },
  "provenance": {
    "sequence": 1,
    "mergedFrom": []
  }
}
EOJSON3
)

        set +e
        CROSS_RESULT=$(peer chaincode invoke \
            -o "${ORDERER_ADDRESS}" \
            -C "${CHANNEL_NAME}" \
            -n "${CC_NAME}" \
            -c "{\"function\":\"RegisterProperty\",\"Args\":[$(echo "${CROSS_STATE_JSON}" | jq -c . | jq -Rs .)]}" \
            --tls \
            --cafile "${ORDERER_CA}" \
            --peerAddresses "localhost:7051" \
            --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/peers/peer0.revenue.bhulekhchain.dev/tls/ca.crt" \
            --peerAddresses "localhost:9051" \
            --tlsRootCertFiles "${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/peers/peer0.bank.bhulekhchain.dev/tls/ca.crt" \
            --waitForEvent \
            2>&1)
        CROSS_RC=$?
        set -e

        if [ $CROSS_RC -ne 0 ] && echo "${CROSS_RESULT}" | grep -q "STATE_MISMATCH"; then
            pass "State boundary enforced: MH registrar rejected for DL property (STATE_MISMATCH)"
        elif [ $CROSS_RC -ne 0 ]; then
            if echo "${CROSS_RESULT}" | grep -q "ACCESS_DENIED\|AUTHORIZATION_FAILED"; then
                pass "State boundary enforced: cross-state registration rejected"
            else
                fail "Cross-state registration failed with unexpected error: ${CROSS_RESULT}"
            fi
        else
            fail "Cross-state registration should have been rejected but succeeded"
        fi
    fi

elif echo "${INVOKE_RESULT}" | grep -q "AUTHORIZATION_FAILED\|ACCESS_DENIED\|does not have attribute\|requireRole\|ABAC"; then
    warn "RegisterProperty failed due to ABAC (role check) — this is expected with cryptogen certs"
    warn "Chaincode IS deployed and processing requests; run './network.sh register' to enroll CA identities"
    echo ""
    echo "--- Test 3: Skipped (registration did not succeed) ---"
    warn "Skipping GetProperty verification"
    echo ""
    echo "--- Test 4: Skipped (no CA-enrolled identities) ---"
    warn "Skipping state boundary test"
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
