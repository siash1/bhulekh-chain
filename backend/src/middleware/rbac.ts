import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types/index.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('rbac-middleware');

/**
 * Custom error for insufficient role authorization.
 * Uses the AUTH_INSUFFICIENT_ROLE error code per API_SPEC.md.
 */
class InsufficientRoleError extends Error {
  public readonly code = 'AUTH_INSUFFICIENT_ROLE';
  public readonly statusCode = 403;

  constructor(userRole: string, requiredRoles: UserRole[]) {
    super(
      `Access denied. Your role '${userRole}' does not have permission for this action. ` +
        `Required: ${requiredRoles.join(' or ')}.`
    );
    this.name = 'InsufficientRoleError';
  }
}

/**
 * Role-based access control middleware factory.
 *
 * Creates a middleware that checks if the authenticated user's role
 * is among the allowed roles for a given endpoint.
 *
 * Usage:
 *   router.post('/transfer/initiate', requireRole(UserRole.REGISTRAR), transferController.initiate);
 *   router.post('/encumbrance/add', requireRole(UserRole.BANK, UserRole.COURT), encumbranceController.add);
 *   router.get('/admin/audit', requireRole(UserRole.ADMIN), adminController.getAuditLogs);
 *
 * Prerequisites:
 *   - authenticateJWT middleware must run before this middleware
 *   - req.user must be populated with the authenticated user's role
 *
 * @param allowedRoles - One or more UserRole values that are authorized
 * @returns Express middleware function
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      // This should not happen if authenticateJWT runs first,
      // but guard against misconfigured middleware chains.
      next(new InsufficientRoleError('UNAUTHENTICATED', allowedRoles));
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      log.warn(
        {
          userId: user.id,
          userRole: user.role,
          requiredRoles: allowedRoles,
          path: req.path,
          method: req.method,
        },
        'RBAC access denied'
      );
      next(new InsufficientRoleError(user.role, allowedRoles));
      return;
    }

    log.debug(
      {
        userId: user.id,
        userRole: user.role,
        path: req.path,
      },
      'RBAC access granted'
    );

    next();
  };
}

/**
 * State jurisdiction check middleware.
 *
 * Ensures that Registrars and Tehsildars can only access/modify
 * records within their assigned state. This prevents a Rajasthan
 * registrar from modifying Andhra Pradesh records.
 *
 * ADMIN role bypasses this check (they have national-level access).
 *
 * Usage:
 *   router.post('/transfer/initiate',
 *     requireRole(UserRole.REGISTRAR),
 *     requireStateJurisdiction('body', 'propertyId'),
 *     transferController.initiate
 *   );
 *
 * @param source - Where to find the state code: 'params', 'query', or 'body'
 * @param field - The field name containing a property ID or state code
 */
export function requireStateJurisdiction(
  source: 'params' | 'query' | 'body',
  field: string
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      next(new InsufficientRoleError('UNAUTHENTICATED', []));
      return;
    }

    // ADMIN has national-level access
    if (user.role === 'ADMIN') {
      next();
      return;
    }

    // CITIZEN, BANK, COURT do not have state restrictions enforced here
    // (they are restricted by data visibility in the service layer)
    if (!user.stateCode) {
      next();
      return;
    }

    let rawValue: unknown;
    if (source === 'params') {
      rawValue = req.params[field];
    } else if (source === 'query') {
      rawValue = req.query[field];
    } else {
      rawValue = (req.body as Record<string, unknown>)?.[field];
    }

    if (typeof rawValue !== 'string') {
      next();
      return;
    }

    // Extract state code: either it IS the state code, or it's a property ID
    // Property ID format: {StateCode}-{DistrictCode}-{TehsilCode}-...
    const stateCode = rawValue.length === 2 ? rawValue : rawValue.split('-')[0];

    if (stateCode && stateCode !== user.stateCode) {
      log.warn(
        {
          userId: user.id,
          userStateCode: user.stateCode,
          requestedStateCode: stateCode,
          path: req.path,
        },
        'State jurisdiction mismatch'
      );

      const error = new Error(
        `Access denied. You are assigned to state '${user.stateCode}' but attempted to access '${stateCode}' records.`
      );
      (error as Error & { code: string; statusCode: number }).code = 'AUTH_STATE_MISMATCH';
      (error as Error & { code: string; statusCode: number }).statusCode = 403;
      next(error);
      return;
    }

    next();
  };
}
