import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

const log = createServiceLogger('error-handler');

/**
 * Map of known error codes to HTTP status codes.
 * From API_SPEC.md Error Code Registry.
 */
const ERROR_CODE_TO_STATUS: Record<string, number> = {
  // Auth errors (4xx)
  AUTH_INVALID_OTP: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_INSUFFICIENT_ROLE: 403,
  AUTH_STATE_MISMATCH: 403,

  // Land record errors
  LAND_NOT_FOUND: 404,
  LAND_DISPUTED: 409,
  LAND_ENCUMBERED: 409,
  LAND_COOLING_PERIOD: 409,

  // Transfer errors
  TRANSFER_INVALID_OWNER: 400,
  TRANSFER_STAMP_DUTY_UNPAID: 402,
  TRANSFER_MINOR_PROPERTY: 400,
  TRANSFER_NRI_FEMA: 400,

  // Blockchain infrastructure errors
  FABRIC_ENDORSEMENT_FAILED: 500,
  FABRIC_TIMEOUT: 504,
  ALGORAND_ANCHOR_FAILED: 500,

  // Document errors
  DOCUMENT_TOO_LARGE: 413,
  DOCUMENT_INVALID_TYPE: 400,

  // General errors
  RATE_LIMIT_EXCEEDED: 429,
  VALIDATION_ERROR: 400,

  // Internal
  INTERNAL_ERROR: 500,
};

/**
 * Resolve the HTTP status code for an error.
 * Checks the error object's properties in order of priority.
 */
function resolveStatusCode(err: Error & { code?: string; statusCode?: number; status?: number }): number {
  // Direct statusCode on the error object
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 600) {
    return err.statusCode;
  }

  // Mapped from error code
  if (err.code && ERROR_CODE_TO_STATUS[err.code]) {
    return ERROR_CODE_TO_STATUS[err.code]!;
  }

  // Express-style status property
  if (err.status && err.status >= 400 && err.status < 600) {
    return err.status;
  }

  // Default to 500
  return 500;
}

/**
 * Resolve the error code string.
 */
function resolveErrorCode(err: Error & { code?: string }, statusCode: number): string {
  if (err.code && typeof err.code === 'string' && err.code !== 'ERR_HTTP_HEADERS_SENT') {
    return err.code;
  }

  // Generate a generic code from the status
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    default:
      return 'INTERNAL_ERROR';
  }
}

/**
 * Build the error details object.
 * In production, internal details are hidden from the client.
 */
function buildDetails(
  err: Error & { validationErrors?: Record<string, string[]>; details?: Record<string, unknown> },
  statusCode: number
): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  // Include validation errors if present (from Zod validation middleware)
  if (err.validationErrors) {
    details['validationErrors'] = err.validationErrors;
  }

  // Include custom details if present
  if (err.details) {
    Object.assign(details, err.details);
  }

  // In development, include the stack trace for 5xx errors
  if (process.env['NODE_ENV'] !== 'production' && statusCode >= 500) {
    details['stack'] = err.stack;
  }

  return details;
}

/**
 * Global error handler middleware.
 *
 * This MUST be registered as the LAST middleware in the Express app.
 * It catches all errors passed via next(err) and formats them into
 * the standard API error response format from API_SPEC.md:
 *
 * {
 *   "success": false,
 *   "error": {
 *     "code": "LAND_NOT_FOUND",
 *     "message": "Property with ID AP-GNT-TNL-SKM-142-3 not found",
 *     "details": {},
 *     "requestId": "req_7f3a8b2c",
 *     "timestamp": "2027-03-15T10:30:00Z"
 *   }
 * }
 *
 * Security considerations:
 *  - In production, 5xx error messages are replaced with a generic message
 *  - Stack traces are never sent in production
 *  - PII from errors is never included in responses
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Prevent sending headers twice
  if (res.headersSent) {
    log.error({ err }, 'Error after headers sent — cannot respond');
    return;
  }

  const typedErr = err as Error & {
    code?: string;
    statusCode?: number;
    status?: number;
    validationErrors?: Record<string, string[]>;
    details?: Record<string, unknown>;
    retryAfter?: number;
  };

  const statusCode = resolveStatusCode(typedErr);
  const errorCode = resolveErrorCode(typedErr, statusCode);
  const details = buildDetails(typedErr, statusCode);

  // Determine the user-facing message
  let message: string;
  if (statusCode >= 500 && process.env['NODE_ENV'] === 'production') {
    // In production, hide internal error details from clients
    message = 'An internal error occurred. Please try again later.';
  } else {
    message = err.message || 'An unexpected error occurred.';
  }

  // Log the error
  if (statusCode >= 500) {
    log.error(
      {
        err,
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode,
        errorCode,
      },
      'Server error'
    );
  } else if (statusCode >= 400) {
    log.warn(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode,
        errorCode,
        message: err.message,
      },
      'Client error'
    );
  }

  // Set Retry-After header for rate limiting
  if (statusCode === 429 && typedErr.retryAfter) {
    res.setHeader('Retry-After', typedErr.retryAfter);
  }

  const response = {
    success: false as const,
    error: {
      code: errorCode,
      message,
      details,
      requestId: req.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(response);
}

/**
 * 404 handler for undefined routes.
 * Register this AFTER all route definitions but BEFORE the error handler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const err = new AppError(
    'NOT_FOUND',
    404,
    `Route ${req.method} ${req.path} not found`
  );
  next(err);
}
