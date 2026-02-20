// middleware/requestId.middleware.ts — Assigns a unique request ID for tracing

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a unique request ID to every incoming request.
 * If an X-Request-ID header is provided (e.g., from API gateway), it is reused.
 * The request ID is included in the response header for client-side correlation.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? `req_${uuidv4().slice(0, 8)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
