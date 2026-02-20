/**
 * Custom error classes for BhulekhChain.
 *
 * Error codes are from API_SPEC.md Error Code Registry.
 * Each error carries:
 *  - code: machine-readable error code (used in API responses)
 *  - statusCode: HTTP status code to return
 *  - message: human-readable description
 *
 * Usage:
 *   throw new LandNotFoundError('AP-GNT-TNL-SKM-142-3');
 *   throw new AuthError('Invalid OTP');
 */

/**
 * Base application error class.
 * All custom errors extend this for consistent error handling.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details: Record<string, unknown> = {},
    isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ============================================
// Authentication & Authorization Errors
// ============================================

/**
 * Authentication error (401).
 * Covers invalid OTP, expired tokens, missing credentials.
 */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication failed', code: string = 'AUTH_TOKEN_EXPIRED') {
    super(code, 401, message);
    this.name = 'AuthError';
  }
}

/**
 * Invalid Aadhaar OTP error (401).
 */
export class AuthInvalidOtpError extends AppError {
  constructor(message = 'Aadhaar OTP verification failed') {
    super('AUTH_INVALID_OTP', 401, message);
    this.name = 'AuthInvalidOtpError';
  }
}

/**
 * Expired JWT token error (401).
 */
export class AuthTokenExpiredError extends AppError {
  constructor(message = 'JWT access token expired') {
    super('AUTH_TOKEN_EXPIRED', 401, message);
    this.name = 'AuthTokenExpiredError';
  }
}

/**
 * Invalid or malformed JWT token error (401).
 */
export class AuthTokenInvalidError extends AppError {
  constructor(message = 'Invalid or malformed authentication token') {
    super('AUTH_TOKEN_INVALID', 401, message);
    this.name = 'AuthTokenInvalidError';
  }
}

/**
 * Insufficient role error (403).
 */
export class InsufficientRoleError extends AppError {
  constructor(userRole: string, requiredRoles: string[]) {
    super(
      'AUTH_INSUFFICIENT_ROLE',
      403,
      `Access denied. Role '${userRole}' is not authorized. Required: ${requiredRoles.join(' or ')}.`,
      { userRole, requiredRoles }
    );
    this.name = 'InsufficientRoleError';
  }
}

/**
 * Alias for backward compatibility.
 */
export class AuthInsufficientRoleError extends AppError {
  constructor(requiredRole: string, actualRole?: string) {
    super(
      'AUTH_INSUFFICIENT_ROLE',
      403,
      `Insufficient permissions. Required: ${requiredRole}, Current: ${actualRole ?? 'none'}`,
      { requiredRole, actualRole }
    );
    this.name = 'AuthInsufficientRoleError';
  }
}

/**
 * State jurisdiction mismatch error (403).
 * Registrar/Tehsildar attempting to access another state's records.
 */
export class StateMismatchError extends AppError {
  constructor(userState: string, requestedState: string) {
    super(
      'AUTH_STATE_MISMATCH',
      403,
      `Access denied. You are assigned to state '${userState}' but attempted to access '${requestedState}' records.`,
      { userState, requestedState }
    );
    this.name = 'StateMismatchError';
  }
}

/**
 * Alias for backward compatibility.
 */
export class AuthStateMismatchError extends AppError {
  constructor(callerState: string, targetState: string) {
    super(
      'AUTH_STATE_MISMATCH',
      403,
      `Registrar from ${callerState} cannot access ${targetState} records`,
      { callerState, targetState }
    );
    this.name = 'AuthStateMismatchError';
  }
}

// ============================================
// Land Record Errors
// ============================================

/**
 * Land record not found error (404).
 */
export class LandNotFoundError extends AppError {
  constructor(propertyId: string) {
    super('LAND_NOT_FOUND', 404, `Property with ID '${propertyId}' not found.`, { propertyId });
    this.name = 'LandNotFoundError';
  }
}

/**
 * Land record has active dispute (409).
 * Business Rule: No transfer if dispute flag is active.
 */
export class LandDisputedError extends AppError {
  constructor(propertyId: string, disputeId?: string) {
    super(
      'LAND_DISPUTED',
      409,
      `Property '${propertyId}' has an active dispute and cannot be transferred.`,
      { propertyId, disputeId }
    );
    this.name = 'LandDisputedError';
  }
}

/**
 * Land record has active encumbrance (409).
 * Business Rule: Encumbrance check mandatory before transfer.
 */
export class LandEncumberedError extends AppError {
  constructor(propertyId: string, encumbranceId?: string) {
    super(
      'LAND_ENCUMBERED',
      409,
      `Property '${propertyId}' has an active encumbrance (mortgage/lien) and cannot be transferred.`,
      { propertyId, encumbranceId }
    );
    this.name = 'LandEncumberedError';
  }
}

/**
 * Land record is in cooling period (409).
 * Business Rule: 72-hour cooling period window for objections.
 */
export class LandCoolingPeriodError extends AppError {
  constructor(propertyId: string, expiresAt: string) {
    super(
      'LAND_COOLING_PERIOD',
      409,
      `Property '${propertyId}' is in a 72-hour cooling period until ${expiresAt}. Objections may be filed during this window.`,
      { propertyId, expiresAt }
    );
    this.name = 'LandCoolingPeriodError';
  }
}

/**
 * Land record is frozen by court order (409).
 */
export class LandFrozenError extends AppError {
  constructor(propertyId: string) {
    super(
      'LAND_FROZEN',
      409,
      `Property '${propertyId}' is frozen by court order.`,
      { propertyId }
    );
    this.name = 'LandFrozenError';
  }
}

// ============================================
// Transfer Errors
// ============================================

/**
 * Seller is not the current owner (400).
 */
export class TransferInvalidOwnerError extends AppError {
  constructor(propertyId: string, sellerAadhaarHash?: string) {
    super(
      'TRANSFER_INVALID_OWNER',
      400,
      `Transfer rejected: the specified seller is not the current owner of property '${propertyId}'.`,
      { propertyId, sellerAadhaarHash }
    );
    this.name = 'TransferInvalidOwnerError';
  }
}

/**
 * Stamp duty has not been paid (402).
 * Business Rule: Stamp duty must be calculated and paid before transfer.
 */
export class TransferStampDutyUnpaidError extends AppError {
  constructor(transferId: string, stampDutyAmountPaisa?: number) {
    const message = stampDutyAmountPaisa
      ? `Stamp duty of INR ${(stampDutyAmountPaisa / 100).toFixed(2)} must be paid before transfer '${transferId}' can proceed.`
      : `Stamp duty payment required for transfer ${transferId}`;
    super(
      'TRANSFER_STAMP_DUTY_UNPAID',
      402,
      message,
      { transferId, stampDutyAmountPaisa }
    );
    this.name = 'TransferStampDutyUnpaidError';
  }
}

/**
 * Property belongs to a minor -- court order required (400).
 * Business Rule: Minor's property requires court order.
 */
export class TransferMinorPropertyError extends AppError {
  constructor(propertyId: string) {
    super(
      'TRANSFER_MINOR_PROPERTY',
      400,
      `Property '${propertyId}' belongs to a minor. A court order is required to authorize this transfer.`,
      { propertyId }
    );
    this.name = 'TransferMinorPropertyError';
  }
}

/**
 * NRI transfer FEMA compliance check failed (400).
 * Business Rule: NRI transfers require FEMA compliance check.
 */
export class TransferNriFemaError extends AppError {
  constructor(propertyId: string) {
    super(
      'TRANSFER_NRI_FEMA',
      400,
      `Transfer of property '${propertyId}' involves an NRI party and failed FEMA compliance verification.`,
      { propertyId }
    );
    this.name = 'TransferNriFemaError';
  }
}

/**
 * Transfer not found error (404).
 */
export class TransferNotFoundError extends AppError {
  constructor(transferId: string) {
    super('TRANSFER_NOT_FOUND', 404, `Transfer '${transferId}' not found.`, { transferId });
    this.name = 'TransferNotFoundError';
  }
}

/**
 * Transfer in invalid state for the requested operation (409).
 */
export class TransferInvalidStateError extends AppError {
  constructor(transferId: string, expectedStatus: string, actualStatus: string) {
    super(
      'TRANSFER_INVALID_STATE',
      409,
      `Transfer '${transferId}' in invalid state. Expected: ${expectedStatus}, Actual: ${actualStatus}`,
      { transferId, expectedStatus, actualStatus }
    );
    this.name = 'TransferInvalidStateError';
  }
}

// ============================================
// Blockchain Infrastructure Errors
// ============================================

/**
 * Fabric chaincode endorsement failed (500).
 */
export class FabricError extends AppError {
  constructor(message: string = 'Hyperledger Fabric operation failed', details: Record<string, unknown> = {}) {
    super('FABRIC_ENDORSEMENT_FAILED', 500, message, details);
    this.name = 'FabricError';
  }
}

/**
 * Alias for backward compatibility.
 */
export class FabricEndorsementError extends AppError {
  constructor(details?: string) {
    super(
      'FABRIC_ENDORSEMENT_FAILED',
      500,
      `Chaincode endorsement policy not met: ${details ?? 'unknown'}`
    );
    this.name = 'FabricEndorsementError';
  }
}

/**
 * Fabric network timeout (504).
 */
export class FabricTimeoutError extends AppError {
  constructor(operation?: string) {
    super(
      'FABRIC_TIMEOUT',
      504,
      operation
        ? `Fabric network timeout during operation: ${operation}`
        : 'Fabric network timeout'
    );
    this.name = 'FabricTimeoutError';
  }
}

/**
 * Fabric connection error (503).
 */
export class FabricConnectionError extends AppError {
  constructor(message = 'Unable to connect to Fabric network') {
    super('FABRIC_CONNECTION_ERROR', 503, message);
    this.name = 'FabricConnectionError';
  }
}

/**
 * Algorand anchoring failed (500).
 * Note: Algorand errors are typically non-blocking -- the primary
 * Fabric operation succeeds and anchoring is retried asynchronously.
 */
export class AlgorandError extends AppError {
  constructor(message: string = 'Algorand anchoring operation failed', details: Record<string, unknown> = {}) {
    super('ALGORAND_ANCHOR_FAILED', 500, message, details);
    this.name = 'AlgorandError';
  }
}

/**
 * Alias for backward compatibility.
 */
export class AlgorandAnchorError extends AppError {
  constructor(details?: string) {
    super(
      'ALGORAND_ANCHOR_FAILED',
      500,
      `Algorand anchoring failed: ${details ?? 'unknown'}`
    );
    this.name = 'AlgorandAnchorError';
  }
}

// ============================================
// Document Errors
// ============================================

/**
 * Document exceeds size limit (413).
 */
export class DocumentTooLargeError extends AppError {
  constructor(sizeBytes: number, maxBytes: number = 25 * 1024 * 1024) {
    const sizeMb = Math.round(sizeBytes / 1024 / 1024);
    const maxMb = Math.round(maxBytes / 1024 / 1024);
    super(
      'DOCUMENT_TOO_LARGE',
      413,
      `Document size (${sizeMb}MB) exceeds the maximum allowed size of ${maxMb}MB.`,
      { sizeBytes, maxBytes, sizeMb }
    );
    this.name = 'DocumentTooLargeError';
  }
}

/**
 * Invalid document type (400).
 */
export class DocumentInvalidTypeError extends AppError {
  constructor(mimeType: string) {
    super(
      'DOCUMENT_INVALID_TYPE',
      400,
      `Document type '${mimeType}' is not allowed. Accepted types: PDF, JPEG, PNG, TIFF.`,
      { mimeType, allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'] }
    );
    this.name = 'DocumentInvalidTypeError';
  }
}

// ============================================
// General Errors
// ============================================

/**
 * Validation error (400).
 * Wraps Zod validation failures.
 */
export class ValidationError extends AppError {
  public readonly validationErrors: Record<string, string[]>;

  constructor(message: string, validationErrors: Record<string, string[]> = {}) {
    super('VALIDATION_ERROR', 400, message, { validationErrors });
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Rate limit exceeded error (429).
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number = 60) {
    super(
      'RATE_LIMIT_EXCEEDED',
      429,
      `Rate limit exceeded. Please retry after ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds }
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterSeconds;
  }
}

/**
 * Generic not found error (404).
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', 404, `${resource} '${id}' not found.`, { resource, id });
    this.name = 'NotFoundError';
  }
}

/**
 * Encumbrance not found error (404).
 */
export class EncumbranceNotFoundError extends AppError {
  constructor(encumbranceId: string) {
    super('ENCUMBRANCE_NOT_FOUND', 404, `Encumbrance '${encumbranceId}' not found.`, { encumbranceId });
    this.name = 'EncumbranceNotFoundError';
  }
}

/**
 * Dispute not found error (404).
 */
export class DisputeNotFoundError extends AppError {
  constructor(disputeId: string) {
    super('DISPUTE_NOT_FOUND', 404, `Dispute '${disputeId}' not found.`, { disputeId });
    this.name = 'DisputeNotFoundError';
  }
}
