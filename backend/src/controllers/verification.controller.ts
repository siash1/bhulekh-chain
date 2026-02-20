// controllers/verification.controller.ts — Public verification route handlers
// GET /verify/public/:propertyId (no auth), GET /verify/algorand/:propertyId (no auth),
// POST /verify/document (no auth)

import { Router, type Request, type Response, type NextFunction } from 'express';
import { landService } from '../services/land.service.js';
import { anchoringService } from '../services/anchoring.service.js';
import { documentService } from '../services/document.service.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { PropertyIdSchema } from '../schemas/land.schema.js';
import { createServiceLogger } from '../config/logger.js';
import { LandNotFoundError } from '../utils/errors.js';
import { z } from 'zod';

const log = createServiceLogger('verification-controller');

/**
 * Schema for document verification.
 */
const VerifyDocumentSchema = z.object({
  documentHash: z.string().min(1, 'Document hash is required'),
});

export const verificationRouter = Router();

// All verification routes are PUBLIC — no auth required
// (authenticateJWT skips these paths via PUBLIC_PATHS regex)

/**
 * GET /verify/public/:propertyId
 * Basic property verification accessible by anyone.
 * Returns: existence, status, dispute status, encumbrance status.
 * NO PII returned (no owner name, only hash).
 */
verificationRouter.get(
  '/public/:propertyId',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      let property: Record<string, unknown> | null = null;
      try {
        property = (await landService.getProperty(propertyId)) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof LandNotFoundError) {
          res.status(200).json({
            success: true,
            data: {
              exists: false,
              propertyId,
            },
          });
          return;
        }
        throw err;
      }

      // Return only non-PII public verification data
      res.status(200).json({
        success: true,
        data: {
          exists: true,
          propertyId,
          currentOwnerHash: property['ownerAadhaarHash'] ?? null,
          status: property['status'],
          disputeStatus: property['disputeStatus'],
          encumbranceStatus: property['encumbranceStatus'],
          lastVerifiedOnAlgorand: property['algorandLastAnchor'] ?? null,
          algorandAsaId: property['algorandAsaId'] ?? null,
          algorandVerificationUrl: property['algorandAsaId']
            ? `https://explorer.perawallet.app/asset/${property['algorandAsaId']}`
            : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /verify/algorand/:propertyId
 * Independent Algorand-based verification.
 * Checks if the property's state is anchored and verified on Algorand.
 */
verificationRouter.get(
  '/algorand/:propertyId',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      const verification = await anchoringService.verifyAnchor(propertyId);

      log.debug(
        { propertyId, verified: verification.verified },
        'Algorand verification requested',
      );

      res.status(200).json({
        success: true,
        data: verification,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /verify/document
 * Verify document authenticity by checking its hash against all records.
 * Returns whether the hash exists and in which context it was registered.
 */
verificationRouter.post(
  '/document',
  validateBody(VerifyDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { documentHash } = req.body as { documentHash: string };

      const result = await documentService.verifyDocument(documentHash);

      log.debug(
        { documentHash: documentHash.slice(0, 12), verified: result.verified },
        'Document verification requested',
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default verificationRouter;
