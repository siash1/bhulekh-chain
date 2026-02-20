import { createHash, randomBytes } from 'node:crypto';

/**
 * Compute the SHA-256 hash of an input string.
 *
 * Returns the hash as a lowercase hexadecimal string (64 characters).
 *
 * @param input - The string to hash
 * @returns Lowercase hex-encoded SHA-256 hash
 */
export function sha256Hash(input: string): string {
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * Hash an Aadhaar number with a salt.
 *
 * CRITICAL SECURITY RULE: The raw 12-digit Aadhaar number must NEVER
 * be stored anywhere in the system. This function produces a salted
 * SHA-256 hash that is used as the sole identifier.
 *
 * The salt is stored in HashiCorp Vault, separate from the application
 * database. The same salt must be used consistently across the system
 * so that the same Aadhaar number always produces the same hash.
 *
 * WARNING: The salt must NEVER be rotated — changing it would break
 * all existing hash lookups and effectively orphan all records.
 *
 * Format: "sha256:{64-char-hex}"
 *
 * @param aadhaarNumber - Raw 12-digit Aadhaar number (discarded after hashing)
 * @param salt - System-wide salt from Vault (AADHAAR_HASH_SALT)
 * @returns Prefixed hash string, e.g., "sha256:a1b2c3d4..."
 */
export function hashAadhaar(aadhaarNumber: string, salt: string): string {
  // Validate input format before hashing
  if (!/^\d{12}$/.test(aadhaarNumber)) {
    throw new Error('Invalid Aadhaar number format: must be exactly 12 digits');
  }

  if (!salt || salt.length < 32) {
    throw new Error('Aadhaar hash salt must be at least 32 characters');
  }

  // Concatenate salt + aadhaar number, then hash
  // Using salt as prefix prevents length extension attacks
  const hash = createHash('sha256')
    .update(salt + aadhaarNumber, 'utf-8')
    .digest('hex');

  return `sha256:${hash}`;
}

/**
 * Generate a unique request ID for tracing.
 *
 * Format: "req_{8-char-hex}"
 * Example: "req_7f3a8b2c"
 *
 * Used in:
 *  - API responses (requestId field)
 *  - Log correlation
 *  - Audit trail entries
 *
 * @returns A unique request identifier string
 */
export function generateRequestId(): string {
  const bytes = randomBytes(4);
  return `req_${bytes.toString('hex')}`;
}

/**
 * Generate a unique entity ID with a given prefix.
 *
 * Format: "{prefix}_{8-char-hex}"
 * Examples:
 *  - "xfr_t1u2v3w4" (transfer)
 *  - "enc_e1f2g3h4" (encumbrance)
 *  - "dsp_d1e2f3g4" (dispute)
 *  - "mut_m1n2o3p4" (mutation)
 *  - "anc_a1b2c3d4" (anchor)
 *  - "usr_x1y2z3a4" (user)
 *
 * @param prefix - Short prefix identifying the entity type
 * @returns Prefixed unique identifier
 */
export function generateEntityId(prefix: string): string {
  const bytes = randomBytes(4);
  return `${prefix}_${bytes.toString('hex')}`;
}

/**
 * Compute a hash for audit entry chaining.
 *
 * Each audit entry's hash includes the previous entry's hash,
 * creating a tamper-evident chain similar to a blockchain.
 *
 * @param entryData - The serialized audit entry data (without the hash fields)
 * @param previousHash - The hash of the previous audit entry in the chain
 * @returns SHA-256 hash of the combined data
 */
export function computeAuditChainHash(entryData: string, previousHash: string): string {
  return createHash('sha256')
    .update(previousHash + '|' + entryData, 'utf-8')
    .digest('hex');
}
