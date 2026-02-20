// controllers/encumbrance.controller.ts — Encumbrance route handlers
// POST /encumbrance/add, POST /encumbrance/:encumbranceId/release

import { Router, type Request, type Response, type NextFunction } from 'express';
import { encumbranceService } from '../services/encumbrance.service.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { AddEncumbranceSchema, EncumbranceIdParamsSchema } from '../schemas/encumbrance.schema.js';
import { UserRole } from '../types/index.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('encumbrance-controller');

export const encumbranceRouter = Router();

// Note: Authentication is handled at the app level by authenticateJWT middleware.
// Audit logging is handled automatically by the audit middleware.

/**
 * POST /encumbrance/add
 * Add an encumbrance (mortgage, lien, court order) to a property.
 * Requires role: BANK or COURT
 */
encumbranceRouter.post(
  '/add',
  requireRole(UserRole.BANK, UserRole.COURT),
  validateBody(AddEncumbranceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await encumbranceService.addEncumbrance(req.body, req.user!.aadhaarHash);

      log.info(
        { encumbranceId: result.encumbranceId, propertyId: result.propertyId, userId: req.user!.id },
        'Encumbrance added',
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /encumbrance/:encumbranceId/release
 * Release an encumbrance (e.g., loan fully paid).
 * Requires role: BANK or COURT
 */
encumbranceRouter.post(
  '/:encumbranceId/release',
  requireRole(UserRole.BANK, UserRole.COURT),
  validateParams(EncumbranceIdParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { encumbranceId } = req.params as { encumbranceId: string };

      const result = await encumbranceService.releaseEncumbrance(encumbranceId, req.user!.aadhaarHash);

      log.info({ encumbranceId, userId: req.user!.id }, 'Encumbrance released');

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default encumbranceRouter;
