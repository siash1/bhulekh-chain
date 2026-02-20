#!/bin/bash
# BhulekhChain Backup Script
# Backs up PostgreSQL, Fabric ledger, CouchDB, and Redis
# Usage: bash infrastructure/scripts/backup.sh
# Cron: 0 2 * * * /path/to/bhulekh-chain/infrastructure/scripts/backup.sh >> /var/log/bhulekh-backup.log 2>&1

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/bhulekhchain/${TIMESTAMP}"
S3_BUCKET="s3://bhulekhchain-backups"
RETENTION_DAYS=30

# Database connection settings (override via environment variables)
PG_HOST="${PG_HOST:-postgres}"
PG_USER="${PG_USER:-bhulekh}"
PG_DB="${PG_DB:-bhulekhchain}"
REDIS_HOST="${REDIS_HOST:-redis}"
COUCHDB_HOST="${COUCHDB_HOST:-couchdb.revenue}"
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASS="${COUCHDB_PASS:-adminpw}"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@bhulekhchain.gov.in}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $1"; }
log_ok()    { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK]    $1"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"; }

echo ""
echo "========================================="
echo "  BhulekhChain Backup - ${TIMESTAMP}"
echo "========================================="
echo ""

mkdir -p "${BACKUP_DIR}"

ERRORS=0

# -------------------------------------------
# 1. PostgreSQL Backup
# -------------------------------------------
log_info "Backing up PostgreSQL..."

if pg_dump -h "${PG_HOST}" -U "${PG_USER}" -F c -f "${BACKUP_DIR}/postgres.dump" "${PG_DB}" 2>/dev/null; then
    PG_SIZE=$(du -sh "${BACKUP_DIR}/postgres.dump" | cut -f1)
    log_ok "PostgreSQL backup complete (${PG_SIZE})"

    if command -v gpg &> /dev/null && gpg --list-keys "${GPG_RECIPIENT}" &> /dev/null; then
        gpg --encrypt --recipient "${GPG_RECIPIENT}" "${BACKUP_DIR}/postgres.dump"
        rm -f "${BACKUP_DIR}/postgres.dump"
        log_ok "PostgreSQL backup encrypted with GPG"
    else
        log_info "GPG encryption skipped (key not found for ${GPG_RECIPIENT})"
    fi
else
    log_error "PostgreSQL backup failed"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# -------------------------------------------
# 2. Fabric Peer Snapshots
# -------------------------------------------
log_info "Snapshotting Fabric ledger..."

FABRIC_PEERS=("peer0.revenue.bhulekhchain.dev" "peer0.bank.bhulekhchain.dev")
FABRIC_CHANNEL="land-registry-channel"

for PEER in "${FABRIC_PEERS[@]}"; do
    PEER_SHORT=$(echo "${PEER}" | cut -d'.' -f1-2)

    if docker ps --filter "name=${PEER}" --filter "status=running" | grep -q "${PEER}" 2>/dev/null; then
        PEER_PORT="7051"
        if [[ "${PEER}" == *"bank"* ]]; then
            PEER_PORT="9051"
        fi

        docker exec "${PEER}" peer snapshot submitrequest \
            --channelID "${FABRIC_CHANNEL}" \
            --blockNumber 0 \
            --peerAddress "${PEER}:${PEER_PORT}" \
            --tls \
            --cafile /etc/hyperledger/fabric/tls/ca.crt 2>/dev/null && \
            log_ok "Snapshot requested for ${PEER_SHORT}" || {
                log_error "Snapshot request failed for ${PEER_SHORT}"
                ERRORS=$((ERRORS + 1))
            }
    else
        log_error "Peer ${PEER_SHORT} is not running. Skipping snapshot."
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# -------------------------------------------
# 3. CouchDB Backup
# -------------------------------------------
log_info "Backing up CouchDB state databases..."

COUCHDB_DATABASES=(
    "land-registry-channel_land-registry"
    "land-registry-channel_stamp-duty"
)

for DB in "${COUCHDB_DATABASES[@]}"; do
    SAFE_DB_NAME=$(echo "${DB}" | tr '/' '_')

    if curl -sf "http://${COUCHDB_USER}:${COUCHDB_PASS}@${COUCHDB_HOST}:5984/${DB}" > /dev/null 2>&1; then
        curl -s "http://${COUCHDB_USER}:${COUCHDB_PASS}@${COUCHDB_HOST}:5984/${DB}/_all_docs?include_docs=true" \
            | gzip > "${BACKUP_DIR}/couchdb_${SAFE_DB_NAME}.json.gz"

        COUCH_SIZE=$(du -sh "${BACKUP_DIR}/couchdb_${SAFE_DB_NAME}.json.gz" | cut -f1)
        log_ok "CouchDB backup for ${DB} complete (${COUCH_SIZE})"
    else
        log_error "CouchDB database ${DB} not found or unreachable"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# -------------------------------------------
# 4. Redis RDB Snapshot
# -------------------------------------------
log_info "Backing up Redis..."

if redis-cli -h "${REDIS_HOST}" BGSAVE 2>/dev/null | grep -q "Background saving started\|already in progress"; then
    log_info "Waiting for Redis background save to complete..."
    WAIT=0
    while [ $WAIT -lt 30 ]; do
        LAST_SAVE=$(redis-cli -h "${REDIS_HOST}" LASTSAVE 2>/dev/null)
        BG_STATUS=$(redis-cli -h "${REDIS_HOST}" INFO persistence 2>/dev/null | grep "rdb_bgsave_in_progress" | cut -d: -f2 | tr -d '\r')
        if [ "${BG_STATUS}" = "0" ]; then
            break
        fi
        WAIT=$((WAIT + 1))
        sleep 1
    done

    if docker cp bhulekh-redis:/data/dump.rdb "${BACKUP_DIR}/redis.rdb" 2>/dev/null; then
        REDIS_SIZE=$(du -sh "${BACKUP_DIR}/redis.rdb" | cut -f1)
        log_ok "Redis RDB snapshot complete (${REDIS_SIZE})"
    else
        log_error "Failed to copy Redis RDB file"
        ERRORS=$((ERRORS + 1))
    fi
else
    log_error "Redis BGSAVE command failed"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# -------------------------------------------
# 5. Vault Backup (if available)
# -------------------------------------------
log_info "Backing up Vault (if available)..."

if command -v vault &> /dev/null && vault status &> /dev/null; then
    vault operator raft snapshot save "${BACKUP_DIR}/vault-snapshot.snap" 2>/dev/null && \
        log_ok "Vault snapshot complete" || {
            log_error "Vault snapshot failed"
            ERRORS=$((ERRORS + 1))
        }
else
    log_info "Vault not available. Skipping Vault backup."
fi

echo ""

# -------------------------------------------
# 6. Create backup manifest
# -------------------------------------------
log_info "Creating backup manifest..."

cat > "${BACKUP_DIR}/manifest.json" << EOF
{
    "timestamp": "${TIMESTAMP}",
    "date": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "hostname": "$(hostname)",
    "components": {
        "postgresql": $([ -f "${BACKUP_DIR}/postgres.dump" ] || [ -f "${BACKUP_DIR}/postgres.dump.gpg" ] && echo "true" || echo "false"),
        "couchdb": $(ls "${BACKUP_DIR}"/couchdb_*.json.gz 2>/dev/null | wc -l | tr -d ' '),
        "redis": $([ -f "${BACKUP_DIR}/redis.rdb" ] && echo "true" || echo "false"),
        "vault": $([ -f "${BACKUP_DIR}/vault-snapshot.snap" ] && echo "true" || echo "false")
    },
    "total_size": "$(du -sh "${BACKUP_DIR}" | cut -f1)",
    "errors": ${ERRORS}
}
EOF

log_ok "Manifest created"
echo ""

# -------------------------------------------
# 7. Upload to S3
# -------------------------------------------
log_info "Uploading backup to S3..."

if command -v aws &> /dev/null; then
    aws s3 sync "${BACKUP_DIR}" "${S3_BUCKET}/${TIMESTAMP}/" \
        --sse AES256 \
        --storage-class STANDARD_IA \
        --no-progress 2>/dev/null && \
        log_ok "Backup uploaded to ${S3_BUCKET}/${TIMESTAMP}/" || {
            log_error "S3 upload failed"
            ERRORS=$((ERRORS + 1))
        }
else
    log_info "AWS CLI not available. Skipping S3 upload."
    log_info "Backup stored locally at: ${BACKUP_DIR}"
fi

echo ""

# -------------------------------------------
# 8. Cleanup Old Backups
# -------------------------------------------
log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."

BACKUP_PARENT="/backups/bhulekhchain"
if [ -d "${BACKUP_PARENT}" ]; then
    DELETED_COUNT=0
    while IFS= read -r OLD_BACKUP; do
        if [ -n "${OLD_BACKUP}" ] && [ "${OLD_BACKUP}" != "${BACKUP_DIR}" ]; then
            rm -rf "${OLD_BACKUP}"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        fi
    done < <(find "${BACKUP_PARENT}" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} 2>/dev/null)

    if [ $DELETED_COUNT -gt 0 ]; then
        log_ok "Deleted ${DELETED_COUNT} old backup(s)"
    else
        log_info "No old backups to clean up"
    fi

    if command -v aws &> /dev/null; then
        CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" '+%Y-%m-%dT00:00:00' 2>/dev/null || \
                      date -v-${RETENTION_DAYS}d '+%Y-%m-%dT00:00:00' 2>/dev/null)
        if [ -n "${CUTOFF_DATE}" ]; then
            log_info "S3 lifecycle policies should handle remote cleanup (retention: ${RETENTION_DAYS} days)"
        fi
    fi
fi

echo ""

# -------------------------------------------
# Summary
# -------------------------------------------
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

echo "========================================="
echo "  Backup Complete"
echo "========================================="
echo ""
echo "  Timestamp:  ${TIMESTAMP}"
echo "  Location:   ${BACKUP_DIR}"
echo "  Total Size: ${TOTAL_SIZE}"
echo "  Errors:     ${ERRORS}"
echo ""

if [ $ERRORS -gt 0 ]; then
    log_error "Backup completed with ${ERRORS} error(s). Review logs above."
    exit 1
else
    log_ok "All backups completed successfully."
    exit 0
fi
