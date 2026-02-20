#!/bin/bash
# =============================================================================
# BhulekhChain — Register Users with ABAC Attributes via Fabric CA
# =============================================================================
# Enrolls identities with custom X.509 attributes (role, stateCode) so that
# chaincode ABAC checks (requireRole / requireStateAccess) pass.
#
# The CA containers mount the cryptogen-generated CA cert+key, so every cert
# issued by fabric-ca-server is already in the same trust chain the peers
# recognise. TLS is disabled on the CA servers in dev (the cryptogen CA certs
# lack localhost SAN), but the issued certs are still signed by the same CA key.
#
# Usage: ./register-users.sh          (called by network.sh — not standalone)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CRYPTO_DIR="${NETWORK_DIR}/crypto-material"
CA_CLIENT_HOME="${NETWORK_DIR}/ca-client"

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
# fix_ca_keyfile — cryptogen names private keys with random hex; Fabric CA
# server expects "priv_sk". Copy the key if needed.
# -----------------------------------------------------------------------------
fix_ca_keyfile() {
    local ca_dir="$1"

    if [ -f "${ca_dir}/priv_sk" ]; then
        return 0
    fi

    local sk_file
    sk_file=$(ls "${ca_dir}"/*_sk 2>/dev/null | head -1)

    if [ -z "${sk_file}" ]; then
        log_error "No private key (*_sk) found in ${ca_dir}"
        return 1
    fi

    cp "${sk_file}" "${ca_dir}/priv_sk"
    log_ok "Copied $(basename "${sk_file}") -> priv_sk in $(basename "${ca_dir}")"
}

# -----------------------------------------------------------------------------
# wait_for_ca — poll CA healthcheck endpoint until it responds
# -----------------------------------------------------------------------------
wait_for_ca() {
    local ca_url="$1"
    local ca_name="$2"
    local max_retries=30
    local count=0

    log_info "Waiting for ${ca_name} to be ready at ${ca_url}..."

    while [ $count -lt $max_retries ]; do
        if curl -s "http://${ca_url}/cainfo" > /dev/null 2>&1; then
            log_ok "${ca_name} is ready"
            return 0
        fi
        count=$((count + 1))
        sleep 2
    done

    log_error "${ca_name} did not become ready after ${max_retries} attempts"
    return 1
}

# -----------------------------------------------------------------------------
# enroll_ca_admin — enroll the CA bootstrap admin into a working directory
# -----------------------------------------------------------------------------
enroll_ca_admin() {
    local ca_url="$1"
    local ca_name="$2"
    local admin_home="$3"

    if [ -d "${admin_home}/msp/signcerts" ] && [ "$(ls -A "${admin_home}/msp/signcerts" 2>/dev/null)" ]; then
        log_warn "CA admin for ${ca_name} already enrolled. Skipping."
        return 0
    fi

    mkdir -p "${admin_home}"

    log_info "Enrolling CA admin for ${ca_name}..."
    fabric-ca-client enroll \
        -u "http://admin:adminpw@${ca_url}" \
        --caname "${ca_name}" \
        -M "${admin_home}/msp"

    log_ok "CA admin enrolled for ${ca_name}"
}

# -----------------------------------------------------------------------------
# write_node_ou_config — write NodeOU config.yaml into a user MSP
# -----------------------------------------------------------------------------
write_node_ou_config() {
    local msp_dir="$1"
    local ca_cert_file="$2"

    # Determine the relative path of the CA cert from the MSP directory
    local ca_cert_basename
    ca_cert_basename=$(basename "${ca_cert_file}")

    cat > "${msp_dir}/config.yaml" <<EOF
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${ca_cert_basename}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${ca_cert_basename}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${ca_cert_basename}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${ca_cert_basename}
    OrganizationalUnitIdentifier: orderer
EOF
}

# -----------------------------------------------------------------------------
# register_and_enroll_user — register a user with ABAC attrs, then enroll
# -----------------------------------------------------------------------------
register_and_enroll_user() {
    local username="$1"
    local role="$2"
    local state_code="$3"
    local org_domain="$4"
    local ca_url="$5"
    local ca_name="$6"
    local admin_home="$7"

    local user_msp_dir="${CRYPTO_DIR}/peerOrganizations/${org_domain}/users/${username}@${org_domain}/msp"

    # Idempotent: skip if already enrolled
    if [ -d "${user_msp_dir}/signcerts" ] && [ "$(ls -A "${user_msp_dir}/signcerts" 2>/dev/null)" ]; then
        log_warn "User ${username}@${org_domain} already enrolled. Skipping."
        return 0
    fi

    log_info "Registering ${username}@${org_domain} (role=${role}, stateCode=${state_code})..."

    # Register — may fail if user already registered (idempotent)
    set +e
    fabric-ca-client register \
        --caname "${ca_name}" \
        --id.name "${username}" \
        --id.secret "${username}pw" \
        --id.type client \
        --id.attrs "role=${role}:ecert,stateCode=${state_code}:ecert" \
        -M "${admin_home}/msp" \
        -u "http://${ca_url}" \
        2>&1
    local reg_rc=$?
    set -e

    if [ $reg_rc -ne 0 ]; then
        log_warn "Registration returned non-zero for ${username} (may already be registered)"
    fi

    # Enroll with attributes
    mkdir -p "${user_msp_dir}"

    fabric-ca-client enroll \
        -u "http://${username}:${username}pw@${ca_url}" \
        --caname "${ca_name}" \
        --enrollment.attrs "role,stateCode" \
        -M "${user_msp_dir}"

    # Copy the org's CA cert into the user MSP (peers need it for NodeOU)
    local org_ca_cert
    org_ca_cert=$(ls "${CRYPTO_DIR}/peerOrganizations/${org_domain}/ca/"*-cert.pem 2>/dev/null | head -1)

    if [ -n "${org_ca_cert}" ]; then
        # The cacerts directory should already exist from enrollment;
        # ensure the cert is there with the right name
        mkdir -p "${user_msp_dir}/cacerts"
        cp "${org_ca_cert}" "${user_msp_dir}/cacerts/"

        # Write NodeOU config
        write_node_ou_config "${user_msp_dir}" "${org_ca_cert}"
    fi

    log_ok "Enrolled ${username}@${org_domain} with role=${role}, stateCode=${state_code}"
}

# =============================================================================
# Main
# =============================================================================

log_info "=== Registering users with ABAC attributes ==="

# ---- Fix CA private key filenames for both orgs ----
fix_ca_keyfile "${CRYPTO_DIR}/peerOrganizations/revenue.bhulekhchain.dev/ca"
fix_ca_keyfile "${CRYPTO_DIR}/peerOrganizations/bank.bhulekhchain.dev/ca"

# ---- Wait for CAs ----
wait_for_ca "localhost:7054" "ca-revenue"
wait_for_ca "localhost:8054" "ca-bank"

# ---- Enroll CA bootstrap admins ----
REVENUE_ADMIN_HOME="${CA_CLIENT_HOME}/revenue-admin"
BANK_ADMIN_HOME="${CA_CLIENT_HOME}/bank-admin"

export FABRIC_CA_CLIENT_HOME="${CA_CLIENT_HOME}"

enroll_ca_admin "localhost:7054" "ca-revenue" "${REVENUE_ADMIN_HOME}"
enroll_ca_admin "localhost:8054" "ca-bank"    "${BANK_ADMIN_HOME}"

# ---- Register & enroll RevenueOrg users ----
REVENUE_DOMAIN="revenue.bhulekhchain.dev"
REVENUE_CA_URL="localhost:7054"
REVENUE_CA_NAME="ca-revenue"

register_and_enroll_user "registrar1" "registrar" "DL" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

register_and_enroll_user "registrar2" "registrar" "MH" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

register_and_enroll_user "tehsildar1" "tehsildar" "DL" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

register_and_enroll_user "admin1" "admin" "DL" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

register_and_enroll_user "citizen1" "citizen" "DL" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

register_and_enroll_user "court1" "court" "DL" \
    "${REVENUE_DOMAIN}" "${REVENUE_CA_URL}" "${REVENUE_CA_NAME}" \
    "${REVENUE_ADMIN_HOME}"

# ---- Register & enroll BankOrg users ----
BANK_DOMAIN="bank.bhulekhchain.dev"
BANK_CA_URL="localhost:8054"
BANK_CA_NAME="ca-bank"

register_and_enroll_user "bank1" "bank" "DL" \
    "${BANK_DOMAIN}" "${BANK_CA_URL}" "${BANK_CA_NAME}" \
    "${BANK_ADMIN_HOME}"

echo ""
log_ok "=== All users registered and enrolled ==="
echo ""
