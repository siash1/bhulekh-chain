// app.ts — Express application setup for BhulekhChain
// Configures middleware, routes, and error handling

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { authenticateJWT } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Controllers
import { authRouter } from './controllers/auth.controller.js';
import { landRouter } from './controllers/land.controller.js';
import { transferRouter } from './controllers/transfer.controller.js';
import { encumbranceRouter } from './controllers/encumbrance.controller.js';
import { verificationRouter } from './controllers/verification.controller.js';
import { adminRouter } from './controllers/admin.controller.js';

// ============================================================
// Express App
// ============================================================

export const app = express();

// ---- Security headers ----
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// ---- CORS ----
app.use(
  cors({
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400, // 24 hours
  }),
);

// ---- Body parsing ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- Request ID ----
app.use(requestIdMiddleware);

// ---- HTTP request logging ----
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => {
        // Don't log health check requests
        return req.url === '/v1/admin/health';
      },
    },
    customProps: (req) => ({
      requestId: (req as express.Request).requestId,
    }),
    customLogLevel: (_req, res) => {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

// ---- Rate limiting ----
app.use(createRateLimiter(config.REDIS_URL));

// ---- JWT authentication (skips PUBLIC_PATHS automatically) ----
app.use(authenticateJWT);

// ---- Audit middleware (auto-detects auditable routes) ----
app.use(auditMiddleware);

// ---- Trust proxy (for correct IP behind reverse proxy) ----
app.set('trust proxy', 1);

// ============================================================
// Routes — all under /v1
// ============================================================

// Auth routes (public — no JWT required)
app.use('/v1/auth', authRouter);

// Verification routes (public — no JWT required)
app.use('/v1/verify', verificationRouter);

// Admin routes (health is public, others require auth)
app.use('/v1/admin', adminRouter);

// Land record routes (authenticated)
app.use('/v1/land', landRouter);

// Transfer routes (authenticated)
app.use('/v1/transfer', transferRouter);

// Encumbrance routes (authenticated)
app.use('/v1/encumbrance', encumbranceRouter);

// ---- 404 handler for unmatched routes ----
app.use(notFoundHandler);

// ---- Global error handler (must be last) ----
app.use(errorHandler);

// ============================================================
// HTTP Server + Socket.io
// ============================================================

export const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/ws',
});

// Socket.io connection handler
io.on('connection', (socket) => {
  logger.debug({ socketId: socket.id }, 'Socket.io client connected');

  // Allow clients to subscribe to property-specific events
  socket.on('subscribe:property', (propertyId: string) => {
    socket.join(`property:${propertyId}`);
    logger.debug({ socketId: socket.id, propertyId }, 'Client subscribed to property events');
  });

  // Allow clients to subscribe to state-level events
  socket.on('subscribe:state', (stateCode: string) => {
    socket.join(`state:${stateCode}`);
    logger.debug({ socketId: socket.id, stateCode }, 'Client subscribed to state events');
  });

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'Socket.io client disconnected');
  });
});

/**
 * Emit a real-time event to all clients watching a specific property.
 */
export function emitPropertyEvent(
  propertyId: string,
  eventType: string,
  data: Record<string, unknown>,
): void {
  io.to(`property:${propertyId}`).emit(eventType, {
    propertyId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  // Also emit to the state channel
  const stateCode = propertyId.split('-')[0];
  if (stateCode) {
    io.to(`state:${stateCode}`).emit(eventType, {
      propertyId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
