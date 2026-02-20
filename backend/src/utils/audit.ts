import { v4 as uuidv4 } from 'uuid';
import { computeAuditChainHash, sha256Hash } from './crypto.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('audit');

/**
 * Audit action enumeration.
 * Every significant action in the system must have a corresponding entry here.
 */
export enum AuditAction {
  // Property lifecycle
  PROPERTY_REGISTERED = 'PROPERTY_REGISTERED',
  PROPERTY_UPDATED = 'PROPERTY_UPDATED',
  PROPERTY_VIEWED = 'PROPERTY_VIEWED',
  PROPERTY_SEARCHED = 'PROPERTY_SEARCHED',

  // Transfer lifecycle
  TRANSFER_INITIATED = 'TRANSFER_INITIATED',
  TRANSFER_STAMP_DUTY_PAID = 'TRANSFER_STAMP_DUTY_PAID',
  TRANSFER_SIGNED = 'TRANSFER_SIGNED',
  TRANSFER_COMPLETED = 'TRANSFER_COMPLETED',
  TRANSFER_CANCELLED = 'TRANSFER_CANCELLED',

  // Objections
  OBJECTION_FILED = 'OBJECTION_FILED',
  OBJECTION_REVIEWED = 'OBJECTION_REVIEWED',

  // Encumbrances
  ENCUMBRANCE_ADDED = 'ENCUMBRANCE_ADDED',
  ENCUMBRANCE_RELEASED = 'ENCUMBRANCE_RELEASED',

  // Disputes
  DISPUTE_FLAGGED = 'DISPUTE_FLAGGED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',

  // Mutations
  MUTATION_APPROVED = 'MUTATION_APPROVED',
  MUTATION_REJECTED = 'MUTATION_REJECTED',

  // Anchoring
  ANCHOR_SUBMITTED = 'ANCHOR_SUBMITTED',
  ANCHOR_VERIFIED = 'ANCHOR_VERIFIED',

  // Auth
  USER_AUTHENTICATED = 'USER_AUTHENTICATED',
  USER_LOGOUT = 'USER_LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',

  // Admin
  ADMIN_CONFIG_CHANGED = 'ADMIN_CONFIG_CHANGED',
  ADMIN_ANCHOR_TRIGGERED = 'ADMIN_ANCHOR_TRIGGERED',
}

/**
 * Input parameters for creating an audit entry.
 */
export interface AuditEntryInput {
  actorAadhaarHash: string;
  actorRole: string;
  actorIp: string;
  actorUserAgent: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  stateCode: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  fabricTxId: string | null;
  algorandTxId: string | null;
}

/**
 * Complete audit entry with computed hashes.
 */
export interface AuditEntry {
  id: string;
  timestamp: string;
  actorAadhaarHash: string;
  actorRole: string;
  actorIp: string;
  actorUserAgent: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  stateCode: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  fabricTxId: string | null;
  algorandTxId: string | null;
  entryHash: string;
  previousEntryHash: string;
}

/**
 * In-memory cache of the last audit entry hash per resource scope.
 *
 * In a production system, this would be fetched from the database
 * (the most recent audit_log entry's entry_hash for that scope).
 * For a single-instance deployment, this in-memory approach works.
 * For multi-instance, a Redis-based approach would be used.
 */
const lastEntryHashCache = new Map<string, string>();

/**
 * The genesis hash used for the first entry in any audit chain.
 * This is a well-known constant so the chain can be independently verified.
 */
const GENESIS_HASH = sha256Hash('bhulekhchain-audit-genesis-v1');

/**
 * Get the previous entry hash for a given scope.
 * Falls back to the genesis hash if no previous entry exists.
 */
function getPreviousEntryHash(scope: string): string {
  return lastEntryHashCache.get(scope) ?? GENESIS_HASH;
}

/**
 * Store the latest entry hash for chain continuity.
 */
function updateLastEntryHash(scope: string, hash: string): void {
  lastEntryHashCache.set(scope, hash);
}

/**
 * Create an immutable audit entry with hash chaining.
 *
 * The hash chain works as follows:
 *  1. Each audit entry is serialized to a deterministic string
 *  2. The entry's hash = SHA-256(previousEntryHash + "|" + serializedEntry)
 *  3. This creates a tamper-evident chain: modifying any entry
 *     breaks all subsequent hashes
 *
 * In production, this entry is dual-written to:
 *  - PostgreSQL audit_log table (for searchable querying)
 *  - Append-only file on WORM storage (tamper-proof backup)
 *
 * @param input - Audit entry data
 * @returns Complete audit entry with computed hash
 */
export async function createAuditEntry(input: AuditEntryInput): Promise<AuditEntry> {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  // Scope the hash chain by resource type for parallelism
  // (so concurrent writes to different resource types don't serialize)
  const chainScope = input.resourceType;

  const previousEntryHash = getPreviousEntryHash(chainScope);

  // Build the entry WITHOUT hash fields (they're computed from the rest)
  const entryData: Omit<AuditEntry, 'entryHash' | 'previousEntryHash'> = {
    id,
    timestamp,
    actorAadhaarHash: input.actorAadhaarHash,
    actorRole: input.actorRole,
    actorIp: input.actorIp,
    actorUserAgent: input.actorUserAgent,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    stateCode: input.stateCode,
    previousState: input.previousState,
    newState: input.newState,
    fabricTxId: input.fabricTxId,
    algorandTxId: input.algorandTxId,
  };

  // Serialize deterministically (sorted keys) for consistent hashing
  const serialized = JSON.stringify(entryData, Object.keys(entryData).sort());

  // Compute the chain hash
  const entryHash = computeAuditChainHash(serialized, previousEntryHash);

  // Update the chain cache
  updateLastEntryHash(chainScope, entryHash);

  const completeEntry: AuditEntry = {
    ...entryData,
    entryHash,
    previousEntryHash,
  };

  log.info(
    {
      auditId: id,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      actorRole: input.actorRole,
    },
    'Audit entry created'
  );

  // In a full implementation, this would persist to PostgreSQL and WORM storage.
  // The actual persistence is handled by the audit service/repository.
  // Here we return the entry for the caller to persist.
  return completeEntry;
}

/**
 * Verify the integrity of an audit chain.
 *
 * Takes an ordered array of audit entries and verifies that:
 *  1. Each entry's previousEntryHash matches the preceding entry's entryHash
 *  2. Each entry's entryHash is correctly computed from its data
 *
 * @param entries - Ordered array of audit entries (oldest first)
 * @returns true if the chain is valid, false if tampered
 */
export function verifyAuditChain(entries: AuditEntry[]): boolean {
  if (entries.length === 0) {
    return true;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // Verify chain linkage (except for the first entry which links to genesis)
    if (i > 0) {
      const previousEntry = entries[i - 1]!;
      if (entry.previousEntryHash !== previousEntry.entryHash) {
        log.error(
          {
            entryId: entry.id,
            expectedPreviousHash: previousEntry.entryHash,
            actualPreviousHash: entry.previousEntryHash,
          },
          'Audit chain integrity violation: previousEntryHash mismatch'
        );
        return false;
      }
    }

    // Verify the entry's own hash
    const entryData: Omit<AuditEntry, 'entryHash' | 'previousEntryHash'> = {
      id: entry.id,
      timestamp: entry.timestamp,
      actorAadhaarHash: entry.actorAadhaarHash,
      actorRole: entry.actorRole,
      actorIp: entry.actorIp,
      actorUserAgent: entry.actorUserAgent,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      stateCode: entry.stateCode,
      previousState: entry.previousState,
      newState: entry.newState,
      fabricTxId: entry.fabricTxId,
      algorandTxId: entry.algorandTxId,
    };

    const serialized = JSON.stringify(entryData, Object.keys(entryData).sort());
    const expectedHash = computeAuditChainHash(serialized, entry.previousEntryHash);

    if (entry.entryHash !== expectedHash) {
      log.error(
        {
          entryId: entry.id,
          expectedHash,
          actualHash: entry.entryHash,
        },
        'Audit chain integrity violation: entryHash mismatch'
      );
      return false;
    }
  }

  return true;
}
