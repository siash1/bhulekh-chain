import pino from 'pino';

/**
 * Paths to redact from all log output.
 * Prevents PII and secrets from leaking into logs.
 *
 * CRITICAL: Raw Aadhaar numbers must NEVER appear in logs.
 * This redaction list covers both request bodies, response bodies,
 * and any nested objects that might contain sensitive fields.
 */
const REDACT_PATHS: string[] = [
  // Auth & identity
  'aadhaarNumber',
  'req.body.aadhaarNumber',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'password',
  'req.body.password',
  'otp',
  'req.body.otp',

  // Blockchain secrets
  'mnemonic',
  'privateKey',
  'ALGORAND_ANCHOR_ACCOUNT_MNEMONIC',
  'POLYGON_DEPLOYER_PRIVATE_KEY',

  // JWT tokens in various locations
  'accessToken',
  'refreshToken',
  'req.body.refreshToken',
  'eSignToken',
  'req.body.eSignToken',

  // Nested patterns for deeply nested objects
  'data.aadhaarNumber',
  'data.password',
  'data.otp',
  'data.mnemonic',
  'data.privateKey',
  'data.accessToken',
  'data.refreshToken',

  // Aadhaar license key
  'AADHAAR_LICENSE_KEY',
  'AADHAAR_HASH_SALT',
];

/**
 * Pino logger instance with PII redaction enabled.
 *
 * Usage:
 *   import { logger } from './config/logger.js';
 *   logger.info({ propertyId: 'AP-GNT-TNL-SKM-142-3' }, 'Property retrieved');
 *   logger.error({ err, transferId }, 'Transfer failed');
 */
export const logger = pino({
  name: 'bhulekhchain',
  level: process.env['LOG_LEVEL'] ?? 'info',

  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },

  // Use ISO timestamp for structured logging
  timestamp: pino.stdTimeFunctions.isoTime,

  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: Record<string, unknown>) => ({
      method: req['method'],
      url: req['url'],
      remoteAddress: req['remoteAddress'],
      // Intentionally exclude headers to avoid leaking auth tokens
    }),
    res: (res: Record<string, unknown>) => ({
      statusCode: res['statusCode'],
    }),
  },

  // In production, output plain JSON for log aggregation (Loki/ELK).
  // In development, use pino-pretty if available.
  ...(process.env['NODE_ENV'] !== 'production'
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }
    : {}),
});

/**
 * Create a child logger scoped to a specific service/module.
 *
 * Usage:
 *   const log = createServiceLogger('land-service');
 *   log.info('Starting land search...');
 */
export function createServiceLogger(service: string): pino.Logger {
  return logger.child({ service });
}
