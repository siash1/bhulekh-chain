// middleware/audit.middleware.ts — Audit trail middleware
// Creates an append-only audit log entry for every write operation

import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import { sha256 } from '../utils/helpers.js';

const log = createServiceLogger('audit');

// Cache the last audit entry hash for chain integrity
let lastEntryHash = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Initialize the audit chain by loading the last entry hash from the database.
 */
export async function initAuditChain(): Promise<void> {
  try {
    const lastEntry = await prisma.auditLog.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { entryHash: true },
    });
    if (lastEntry) {
      lastEntryHash = lastEntry.entryHash;
    }
    log.info({ lastEntryHash }, 'Audit chain initialized');
  } catch (err) {
    log.warn({ err }, 'Failed to initialize audit chain, starting from genesis');
  }
}

/**
 * Create an audit log entry for a completed action.
 * Called explicitly from controllers after successful operations.
 */
export async function createAuditEntry(params: {
  actorAadhaarHash: string;
  actorRole: string;
  actorIp: string;
  actorUserAgent?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  stateCode?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  fabricTxId?: string;
  algorandTxId?: string;
}): Promise<void> {
  try {
    const previousEntryHash = lastEntryHash;

    // Build the entry data for hashing
    const entryData = JSON.stringify({
      ...params,
      timestamp: new Date().toISOString(),
      previousEntryHash,
    });

    const entryHash = sha256(entryData);

    await prisma.auditLog.create({
      data: {
        actorAadhaarHash: params.actorAadhaarHash,
        actorRole: params.actorRole,
        actorIp: params.actorIp,
        actorUserAgent: params.actorUserAgent,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        stateCode: params.stateCode,
        previousState: (params.previousState ?? undefined) as Prisma.InputJsonValue | undefined,
        newState: (params.newState ?? undefined) as Prisma.InputJsonValue | undefined,
        fabricTxId: params.fabricTxId,
        algorandTxId: params.algorandTxId,
        entryHash,
        previousEntryHash,
      },
    });

    // Update the chain head
    lastEntryHash = entryHash;

    log.debug(
      { action: params.action, resourceId: params.resourceId, entryHash },
      'Audit entry created',
    );
  } catch (err) {
    // Audit failures should be logged but not break the request
    log.error({ err, params }, 'Failed to create audit entry');
  }
}

/**
 * Express middleware that attaches audit helper to the request.
 * Write operations call req.audit() after successful completion.
 */
export function auditMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Attach helper for controllers to use
  (req as Request & { audit: typeof createAuditEntry }).audit = createAuditEntry;
  next();
}

/**
 * Extract client IP from request, considering reverse proxies.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? '0.0.0.0';
  }
  return req.ip ?? '0.0.0.0';
}
