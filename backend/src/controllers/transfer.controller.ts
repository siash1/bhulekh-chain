// controllers/transfer.controller.ts — Transfer workflow route handlers
// POST /transfer/initiate, POST /transfer/:transferId/stamp-duty, POST /transfer/:transferId/sign,
// POST /transfer/:transferId/execute, GET /transfer/:transferId/status, POST /transfer/:transferId/object

import { Router, type Request, type Response, type NextFunction } from 'express';
import { transferService } from '../services/transfer.service.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  TransferInitSchema,
  TransferSignSchema,
  TransferIdParamsSchema,
  ObjectionSchema,
} from '../schemas/transfer.schema.js';
import { UserRole } from '../types/index.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('transfer-controller');

export const transferRouter = Router();

// Note: Authentication is handled at the app level by authenticateJWT middleware.
// Audit logging is handled automatically by the audit middleware for all transfer routes.

/**
 * POST /transfer/initiate
 * Initiate a property ownership transfer.
 * Requires role: REGISTRAR
 */
transferRouter.post(
  '/initiate',
  requireRole(UserRole.REGISTRAR),
  validateBody(TransferInitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await transferService.initiateTransfer(req.body, req.user!.aadhaarHash);

      log.info({ transferId: result.transferId, registrar: req.user!.id }, 'Transfer initiated');

      res.status(202).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfer/:transferId/stamp-duty
 * Confirm stamp duty payment.
 * Requires auth: any authenticated user (payment can be confirmed by any party).
 */
transferRouter.post(
  '/:transferId/stamp-duty',
  validateParams(TransferIdParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transferId } = req.params as { transferId: string };
      const { receiptHash } = req.body as { receiptHash: string };

      const result = await transferService.confirmStampDuty(transferId, receiptHash);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfer/:transferId/sign
 * Submit a digital signature (eSign) from a party.
 * Requires auth: any authenticated user (seller, buyer, witness).
 */
transferRouter.post(
  '/:transferId/sign',
  validateParams(TransferIdParamsSchema),
  validateBody(TransferSignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transferId } = req.params as { transferId: string };
      const { signatory, eSignToken } = req.body as { signatory: 'seller' | 'buyer' | 'witness1' | 'witness2'; eSignToken: string };

      const result = await transferService.submitSignature(transferId, signatory, eSignToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfer/:transferId/execute
 * Execute the transfer on Fabric after all prerequisites are met.
 * Requires role: REGISTRAR
 */
transferRouter.post(
  '/:transferId/execute',
  requireRole(UserRole.REGISTRAR),
  validateParams(TransferIdParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transferId } = req.params as { transferId: string };

      const result = await transferService.executeTransfer(transferId, req.user!.aadhaarHash);

      log.info(
        { transferId, fabricTxId: result.fabricTxId, registrar: req.user!.id },
        'Transfer executed',
      );

      res.status(200).json({
        success: true,
        data: {
          ...result,
          message: 'Transfer registered. 72-hour cooling period active.',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transfer/:transferId/status
 * Get current transfer status.
 * Requires auth: any authenticated user.
 */
transferRouter.get(
  '/:transferId/status',
  validateParams(TransferIdParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transferId } = req.params as { transferId: string };

      const result = await transferService.getTransferStatus(transferId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfer/:transferId/object
 * File an objection during the 72-hour cooling period.
 * Requires auth: any authenticated user.
 */
transferRouter.post(
  '/:transferId/object',
  validateParams(TransferIdParamsSchema),
  validateBody(ObjectionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transferId } = req.params as { transferId: string };
      const { reason, supportingDocumentHash } = req.body as { reason: string; supportingDocumentHash?: string };

      const result = await transferService.fileObjection(transferId, reason, supportingDocumentHash);

      log.info({ transferId, userId: req.user!.id }, 'Objection filed');

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default transferRouter;
