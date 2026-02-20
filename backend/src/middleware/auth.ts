import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthenticatedUser, JwtPayload } from '../types/index.js';
import { AuthError } from '../utils/errors.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('auth-middleware');

/**
 * Paths that do NOT require JWT authentication.
 * These are public routes or auth routes where the user
 * has not yet obtained a token.
 */
const PUBLIC_PATHS: RegExp[] = [
  /^\/v1\/auth\//,
  /^\/v1\/verify\/public\//,
  /^\/v1\/verify\/algorand\//,
  /^\/v1\/verify\/document$/,
  /^\/v1\/admin\/health$/,
  /^\/health$/,
];

/**
 * Cache for the RSA public key used to verify JWTs.
 * Loaded once on first use, then reused.
 */
let cachedPublicKey: string | null = null;

/**
 * Load the RSA public key from the file system.
 * The key path is configured via JWT_PUBLIC_KEY_PATH env var.
 */
function getPublicKey(): string {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  const keyPath = process.env['JWT_PUBLIC_KEY_PATH'];
  if (!keyPath) {
    throw new AuthError('JWT_PUBLIC_KEY_PATH environment variable not configured');
  }

  const resolvedPath = path.resolve(keyPath);
  try {
    cachedPublicKey = fs.readFileSync(resolvedPath, 'utf-8');
    return cachedPublicKey;
  } catch (err) {
    log.error({ err, path: resolvedPath }, 'Failed to read JWT public key file');
    throw new AuthError('JWT public key file not found or unreadable');
  }
}

/**
 * Check if a request path is in the public (no-auth-required) list.
 */
function isPublicPath(requestPath: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(requestPath));
}

/**
 * Extract the Bearer token from the Authorization header.
 * Returns null if no valid Bearer token is found.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * JWT authentication middleware.
 *
 * For protected routes:
 *  1. Extracts Bearer token from Authorization header
 *  2. Verifies the token using RS256 with the configured public key
 *  3. Validates the token is an access token (not a refresh token)
 *  4. Attaches the authenticated user to req.user
 *
 * For public routes (matching PUBLIC_PATHS):
 *  - Skips authentication and proceeds to the next handler
 *
 * Error cases:
 *  - Missing token: 401 AUTH_TOKEN_EXPIRED
 *  - Invalid/expired token: 401 AUTH_TOKEN_EXPIRED
 *  - Refresh token used as access token: 401 AUTH_TOKEN_EXPIRED
 */
export function authenticateJWT(req: Request, _res: Response, next: NextFunction): void {
  // Skip auth for public paths
  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const token = extractBearerToken(req);

  if (!token) {
    next(new AuthError('Authentication required. Provide a valid Bearer token.'));
    return;
  }

  let publicKey: string;
  try {
    publicKey = getPublicKey();
  } catch (err) {
    log.error({ err }, 'Failed to load JWT public key');
    next(new AuthError('Authentication service unavailable'));
    return;
  }

  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'bhulekhchain',
    }) as JwtPayload;

    // Ensure this is an access token, not a refresh token
    if (decoded.type !== 'access') {
      next(new AuthError('Invalid token type. Use an access token, not a refresh token.'));
      return;
    }

    // Attach authenticated user to the request
    const user: AuthenticatedUser = {
      id: decoded.sub,
      aadhaarHash: decoded.aadhaarHash,
      name: decoded.name,
      role: decoded.role,
      stateCode: decoded.stateCode,
      districtCode: decoded.districtCode,
    };

    req.user = user;

    log.debug(
      { userId: user.id, role: user.role, stateCode: user.stateCode },
      'User authenticated'
    );

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AuthError('Access token has expired. Use /auth/refresh to obtain a new one.'));
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      next(new AuthError('Invalid access token.'));
      return;
    }

    log.error({ err }, 'Unexpected JWT verification error');
    next(new AuthError('Authentication failed'));
  }
}
