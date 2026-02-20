import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createAuditEntry, AuditAction } from '../utils/audit.js';
import { createServiceLogger } from '../config/logger.js';
import { sha256Hash } from '../utils/crypto.js';
import prisma from '../models/prisma.js';

const log = createServiceLogger('audit-middleware');

/**
 * Map HTTP method + path pattern to audit action.
 * This provides automatic action detection for common routes.
 */
const ROUTE_ACTION_MAP: Array<{
  method: string;
  pattern: RegExp;
  action: AuditAction;
  resourceType: string;
}> = [
  {
    method: 'POST',
    pattern: /^\/v1\/land\/register$/,
    action: AuditAction.PROPERTY_REGISTERED,
    resourceType: 'LAND_RECORD',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/transfer\/initiate$/,
    action: AuditAction.TRANSFER_INITIATED,
    resourceType: 'TRANSFER',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/transfer\/[^/]+\/sign$/,
    action: AuditAction.TRANSFER_SIGNED,
    resourceType: 'TRANSFER',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/transfer\/[^/]+\/execute$/,
    action: AuditAction.TRANSFER_COMPLETED,
    resourceType: 'TRANSFER',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/transfer\/[^/]+\/object$/,
    action: AuditAction.OBJECTION_FILED,
    resourceType: 'TRANSFER',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/encumbrance\/add$/,
    action: AuditAction.ENCUMBRANCE_ADDED,
    resourceType: 'ENCUMBRANCE',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/encumbrance\/[^/]+\/release$/,
    action: AuditAction.ENCUMBRANCE_RELEASED,
    resourceType: 'ENCUMBRANCE',
  },
  {
    method: 'POST',
    pattern: /^\/v1\/mutation\/[^/]+\/approve$/,
    action: AuditAction.MUTATION_APPROVED,
    resourceType: 'MUTATION',
  },
  {
    method: 'GET',
    pattern: /^\/v1\/land\/[^/]+$/,
    action: AuditAction.PROPERTY_VIEWED,
    resourceType: 'LAND_RECORD',
  },
  {
    method: 'GET',
    pattern: /^\/v1\/land\/search$/,
    action: AuditAction.PROPERTY_SEARCHED,
    resourceType: 'LAND_RECORD',
  },
];

/**
 * Extract the resource ID from a request.
 * Looks in route params, request body, or query parameters.
 */
function extractResourceId(req: Request): string {
  // Check route params first
  if (req.params['propertyId']) return req.params['propertyId'];
  if (req.params['transferId']) return req.params['transferId'];
  if (req.params['encumbranceId']) return req.params['encumbranceId'];
  if (req.params['mutationId']) return req.params['mutationId'];

  // Then request body
  const body = req.body as Record<string, unknown> | undefined;
  if (body) {
    if (typeof body['propertyId'] === 'string') return body['propertyId'];
    if (typeof body['transferId'] === 'string') return body['transferId'];
    if (typeof body['encumbranceId'] === 'string') return body['encumbranceId'];
  }

  // Then query params
  const query = req.query;
  if (typeof query['propertyId'] === 'string') return query['propertyId'];

  return 'unknown';
}

/**
 * Detect the audit action from the request method and path.
 */
function detectAction(req: Request): { action: AuditAction; resourceType: string } | null {
  for (const route of ROUTE_ACTION_MAP) {
    if (req.method === route.method && route.pattern.test(req.path)) {
      return { action: route.action, resourceType: route.resourceType };
    }
  }
  return null;
}

/**
 * Get the client IP address, handling proxied requests.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? '0.0.0.0';
  }
  return req.ip ?? '0.0.0.0';
}

/**
 * Audit logging middleware.
 *
 * Intercepts responses to create an audit trail entry AFTER the
 * request has been successfully processed. Failed requests (4xx/5xx)
 * are still logged for security monitoring.
 *
 * Each audit entry includes:
 *  - Actor info (from JWT): who performed the action
 *  - Action: what was done
 *  - Resource: which entity was affected
 *  - Request metadata: IP, user agent
 *  - State hashes: hash of request body and response body
 *  - Hash chain: each entry's hash includes the previous entry's hash
 *
 * The hash chain ensures the audit log's integrity is independently
 * verifiable — any tampering breaks the chain.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const detected = detectAction(req);

  // If this route is not auditable, skip
  if (!detected) {
    next();
    return;
  }

  // Capture the original res.json to intercept the response
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Fire and forget — do not block the response on audit logging
    setImmediate(() => {
      try {
        const user = req.user;
        const actorAadhaarHash = user?.aadhaarHash ?? 'anonymous';
        const actorRole = user?.role ?? 'PUBLIC';
        const resourceId = extractResourceId(req);
        const stateCode = resourceId.length > 2 ? resourceId.split('-')[0] ?? null : null;

        // Hash the request and response bodies for integrity verification
        const requestStateHash = sha256Hash(JSON.stringify(req.body ?? {}));
        const responseStateHash = sha256Hash(JSON.stringify(body ?? {}));

        createAuditEntry({
          actorAadhaarHash,
          actorRole,
          actorIp: getClientIp(req),
          actorUserAgent: req.headers['user-agent'] ?? 'unknown',
          action: detected.action,
          resourceType: detected.resourceType,
          resourceId,
          stateCode,
          previousState: { hash: requestStateHash },
          newState: { hash: responseStateHash },
          fabricTxId: null,
          algorandTxId: null,
        }).then((entry) => {
          // Persist the audit entry to PostgreSQL
          return prisma.auditLog.create({
            data: {
              id: entry.id,
              actorAadhaarHash: entry.actorAadhaarHash,
              actorRole: entry.actorRole,
              actorIp: entry.actorIp,
              actorUserAgent: entry.actorUserAgent,
              action: entry.action,
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              stateCode: entry.stateCode,
              previousState: (entry.previousState ?? undefined) as Prisma.InputJsonValue | undefined,
              newState: (entry.newState ?? undefined) as Prisma.InputJsonValue | undefined,
              fabricTxId: entry.fabricTxId,
              algorandTxId: entry.algorandTxId,
              entryHash: entry.entryHash,
              previousEntryHash: entry.previousEntryHash,
            },
          });
        }).catch((err: unknown) => {
          log.error({ err, action: detected.action, resourceId }, 'Failed to create audit entry');
        });
      } catch (err) {
        log.error({ err }, 'Unexpected error in audit middleware');
      }
    });

    return originalJson(body);
  };

  next();
}
