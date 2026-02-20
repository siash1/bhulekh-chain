// controllers/admin.controller.ts — Admin route handlers
// GET /admin/health, GET /admin/stats, GET /admin/audit, POST /admin/anchoring/trigger

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import prisma from '../models/prisma.js';
import redis from '../models/redis.js';
import fabricService from '../services/fabric.service.js';
import { createServiceLogger } from '../config/logger.js';
import { config } from '../config/index.js';
import { Queue, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';

const log = createServiceLogger('admin-controller');

/**
 * Audit query schema for admin endpoint.
 */
const AuditQuerySchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  resourceId: z.string().optional(),
  stateCode: z.string().length(2).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(10000))
    .default('1'),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100))
    .default('20'),
});

/**
 * Anchoring trigger schema.
 */
const TriggerAnchoringSchema = z.object({
  stateCode: z.string().length(2, 'State code must be 2 characters'),
});

export const adminRouter = Router();

/**
 * GET /admin/health
 * System health check — no auth required.
 * Returns status of all system components.
 */
adminRouter.get('/health', async (_req: Request, res: Response, _next: NextFunction) => {
  const components: Record<string, { status: string; latency?: string; error?: string }> = {};

  // Check PostgreSQL
  const pgStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    components['postgresql'] = { status: 'up', latency: `${Date.now() - pgStart}ms` };
  } catch (err) {
    components['postgresql'] = { status: 'down', error: err instanceof Error ? err.message : 'Unknown' };
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    await redis.ping();
    components['redis'] = { status: 'up', latency: `${Date.now() - redisStart}ms` };
  } catch (err) {
    components['redis'] = { status: 'down', error: err instanceof Error ? err.message : 'Unknown' };
  }

  // Check Fabric
  components['fabric'] = fabricService.isConnected()
    ? { status: 'up' }
    : { status: 'down', error: 'Not connected' };

  // Check IPFS
  const ipfsStart = Date.now();
  try {
    const ipfsResponse = await fetch(`${config.IPFS_API_URL}/api/v0/id`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    components['ipfs'] = ipfsResponse.ok
      ? { status: 'up', latency: `${Date.now() - ipfsStart}ms` }
      : { status: 'down', error: `HTTP ${ipfsResponse.status}` };
  } catch {
    components['ipfs'] = { status: 'down', error: 'Unreachable' };
  }

  // Check Algorand
  const algoStart = Date.now();
  try {
    const algoResponse = await fetch(`${config.ALGORAND_ALGOD_URL}/v2/status`, {
      signal: AbortSignal.timeout(5000),
    });
    components['algorand'] = algoResponse.ok
      ? { status: 'up', latency: `${Date.now() - algoStart}ms` }
      : { status: 'down', error: `HTTP ${algoResponse.status}` };
  } catch {
    components['algorand'] = { status: 'down', error: 'Unreachable' };
  }

  // Check Keycloak
  const kcStart = Date.now();
  try {
    const kcResponse = await fetch(`${config.KEYCLOAK_URL}/health/ready`, {
      signal: AbortSignal.timeout(5000),
    });
    components['keycloak'] = kcResponse.ok
      ? { status: 'up', latency: `${Date.now() - kcStart}ms` }
      : { status: 'down', error: `HTTP ${kcResponse.status}` };
  } catch {
    components['keycloak'] = { status: 'down', error: 'Unreachable' };
  }

  // Overall status: healthy only if all critical components are up
  const criticalDown = ['postgresql', 'redis', 'fabric'].filter(
    (c) => components[c]?.status === 'down',
  );
  const overallStatus = criticalDown.length === 0 ? 'healthy' : 'degraded';

  res.status(overallStatus === 'healthy' ? 200 : 503).json({
    status: overallStatus,
    components,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /admin/stats
 * System statistics dashboard.
 * Requires role: ADMIN
 */
adminRouter.get(
  '/stats',
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalProperties,
        totalTransfers,
        activeDisputes,
        activeEncumbrances,
        totalUsers,
        totalAnchors,
        recentTransfers,
        propertiesByState,
      ] = await Promise.all([
        prisma.landRecord.count(),
        prisma.transfer.count(),
        prisma.dispute.count({ where: { status: { in: ['FILED', 'UNDER_ADJUDICATION'] } } }),
        prisma.encumbrance.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count(),
        prisma.algorandAnchor.count(),
        prisma.transfer.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.landRecord.groupBy({
          by: ['stateCode'],
          _count: { propertyId: true },
          orderBy: { _count: { propertyId: 'desc' } },
          take: 10,
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalProperties,
          totalTransfers,
          activeDisputes,
          activeEncumbrances,
          totalUsers,
          totalAnchors,
          recentTransfers24h: recentTransfers,
          propertiesByState: propertiesByState.map((s) => ({
            stateCode: s.stateCode,
            count: s._count.propertyId,
          })),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/audit
 * Query audit trail with filters.
 * Requires role: ADMIN
 */
adminRouter.get(
  '/audit',
  requireRole(UserRole.ADMIN),
  validateQuery(AuditQuerySchema as z.ZodType<any>),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as {
        actor?: string;
        action?: string;
        resourceId?: string;
        stateCode?: string;
        from?: string;
        to?: string;
        page: number;
        limit: number;
      };

      const skip = (query.page - 1) * query.limit;

      // Build where clause
      const where: Record<string, unknown> = {};
      if (query.actor) where['actorAadhaarHash'] = query.actor;
      if (query.action) where['action'] = query.action;
      if (query.resourceId) where['resourceId'] = query.resourceId;
      if (query.stateCode) where['stateCode'] = query.stateCode;

      if (query.from || query.to) {
        const timestampFilter: Record<string, Date> = {};
        if (query.from) timestampFilter['gte'] = new Date(query.from);
        if (query.to) {
          // Set to end of day
          const toDate = new Date(query.to);
          toDate.setHours(23, 59, 59, 999);
          timestampFilter['lte'] = toDate;
        }
        where['timestamp'] = timestampFilter;
      }

      const [entries, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { timestamp: 'desc' },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          entries,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /admin/anchoring/trigger
 * Manually trigger Algorand anchoring for a state.
 * Requires role: ADMIN
 */
adminRouter.post(
  '/anchoring/trigger',
  requireRole(UserRole.ADMIN),
  validateBody(TriggerAnchoringSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stateCode } = req.body as { stateCode: string };

      // Queue the anchoring job
      const anchoringQueue = new Queue('anchoring', { connection: redis as unknown as ConnectionOptions });
      const job = await anchoringQueue.add('manual-anchor', {
        stateCode,
        triggeredBy: req.user!.id,
        manual: true,
      });

      log.info(
        { stateCode, jobId: job.id, triggeredBy: req.user!.id },
        'Manual anchoring triggered',
      );

      res.status(202).json({
        success: true,
        data: {
          message: `Anchoring job queued for state ${stateCode}`,
          jobId: job.id,
          stateCode,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default adminRouter;
