// controllers/land.controller.ts — Land record route handlers
// GET /land/search, GET /land/:propertyId, GET /land/:propertyId/history,
// GET /land/:propertyId/encumbrances, GET /land/:propertyId/map

import { Router, type Request, type Response, type NextFunction } from 'express';
import { landService } from '../services/land.service.js';
import { encumbranceService } from '../services/encumbrance.service.js';
import { validateQuery, validateParams } from '../middleware/validate.js';
import { LandSearchSchema, PropertyIdSchema } from '../schemas/land.schema.js';
import { z } from 'zod';
export const landRouter = Router();

// Note: Authentication is handled at the app level by authenticateJWT middleware.
// These routes are NOT in PUBLIC_PATHS, so they require a valid JWT.

/**
 * GET /land/search
 * Search land records with filters and pagination.
 * Requires auth: any authenticated user.
 */
landRouter.get(
  '/search',
  validateQuery(LandSearchSchema as z.ZodType<any>),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as {
        stateCode: string;
        districtCode?: string;
        tehsilCode?: string;
        villageCode?: string;
        surveyNo?: string;
        ownerName?: string;
        district?: string;
        tehsil?: string;
        village?: string;
        page: number;
        limit: number;
      };

      const result = await landService.searchRecords(query);

      // Audit logging is handled automatically by the audit middleware
      // which detects GET /v1/land/search and logs PROPERTY_SEARCHED

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
 * GET /land/:propertyId
 * Get full property details.
 * Requires auth: any authenticated user.
 */
landRouter.get(
  '/:propertyId',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      const property = await landService.getProperty(propertyId);

      // Audit logging handled automatically by audit middleware (PROPERTY_VIEWED)

      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /land/:propertyId/history
 * Get complete ownership history (provenance chain).
 * Requires auth: any authenticated user.
 */
landRouter.get(
  '/:propertyId/history',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      const history = await landService.getPropertyHistory(propertyId);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /land/:propertyId/encumbrances
 * Get all encumbrances (mortgages, liens, court orders) on a property.
 * Requires auth: any authenticated user.
 */
landRouter.get(
  '/:propertyId/encumbrances',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      const encumbrances = await encumbranceService.getEncumbrances(propertyId);

      res.status(200).json({
        success: true,
        data: encumbrances,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /land/:propertyId/map
 * Get cadastral map data (GeoJSON) for property boundaries.
 * Requires auth: any authenticated user.
 *
 * Note: Full GIS integration requires GeoServer (WMS/WFS).
 * This endpoint returns basic GeoJSON from PostgreSQL/PostGIS.
 */
landRouter.get(
  '/:propertyId/map',
  validateParams(PropertyIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { propertyId } = req.params as { propertyId: string };

      // For now, return a stub GeoJSON feature
      // In production, this would query PostGIS for the actual boundary geometry
      const property = await landService.getProperty(propertyId);
      const record = property as Record<string, unknown>;

      const geoJsonFeature = {
        type: 'Feature',
        properties: {
          propertyId,
          surveyNumber: record['surveyNumber'] ?? '',
          ownerName: record['ownerName'] ?? '',
          status: record['status'] ?? 'ACTIVE',
          landUse: record['landUse'] ?? '',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 0],
              [0, 0],
              [0, 0],
              [0, 0],
            ],
          ],
        },
      };

      res.status(200).json({
        success: true,
        data: geoJsonFeature,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default landRouter;
