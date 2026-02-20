// server.ts — BhulekhChain backend server startup
// Initializes all services and starts listening

import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { httpServer } from './app.js';
import prisma from './models/prisma.js';
import redis from './models/redis.js';
import fabricService from './services/fabric.service.js';
import { initAuditChain } from './middleware/audit.middleware.js';
import { startAnchoringWorker } from './jobs/anchoring.job.js';
import { startNotificationWorker } from './jobs/notification.job.js';
import { startSyncWorker } from './jobs/sync.job.js';
import type { Worker } from 'bullmq';

const log = logger.child({ service: 'server' });

// Track workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Main server startup sequence.
 * Initializes all connections and starts the HTTP server.
 */
async function start(): Promise<void> {
  log.info(
    {
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      logLevel: config.LOG_LEVEL,
    },
    'Starting BhulekhChain backend...',
  );

  // ---- 1. Initialize Prisma (PostgreSQL) ----
  try {
    await prisma.$connect();
    log.info('PostgreSQL connected via Prisma');
  } catch (err) {
    log.error({ err }, 'Failed to connect to PostgreSQL');
    process.exit(1);
  }

  // ---- 2. Verify Redis connection ----
  try {
    await redis.ping();
    log.info('Redis connected');
  } catch (err) {
    log.error({ err }, 'Failed to connect to Redis');
    process.exit(1);
  }

  // ---- 3. Initialize audit chain ----
  await initAuditChain();

  // ---- 4. Connect to Fabric (non-blocking) ----
  try {
    await fabricService.connect();
    log.info('Fabric gateway connected');
  } catch (err) {
    log.warn(
      { err },
      'Failed to connect to Fabric gateway. Continuing without blockchain — PostgreSQL fallback active.',
    );
  }

  // ---- 5. Start BullMQ workers ----
  try {
    workers.push(startAnchoringWorker());
    workers.push(startNotificationWorker());
    workers.push(startSyncWorker());
    log.info({ workerCount: workers.length }, 'BullMQ workers started');
  } catch (err) {
    log.warn({ err }, 'Failed to start some BullMQ workers');
  }

  // ---- 6. Start HTTP server ----
  httpServer.listen(config.PORT, () => {
    log.info(
      {
        port: config.PORT,
        environment: config.NODE_ENV,
        fabricConnected: fabricService.isConnected(),
      },
      `BhulekhChain backend listening on port ${config.PORT}`,
    );

    log.info({
      endpoints: {
        api: `http://localhost:${config.PORT}/v1`,
        health: `http://localhost:${config.PORT}/v1/admin/health`,
        websocket: `ws://localhost:${config.PORT}/ws`,
      },
    }, 'Server endpoints available');
  });

  // ---- 7. Register shutdown handlers ----
  registerShutdownHandlers();
}

/**
 * Graceful shutdown handler.
 * Closes all connections cleanly before process exit.
 */
function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutdown signal received, starting graceful shutdown...');

    // Stop accepting new connections
    httpServer.close(() => {
      log.info('HTTP server closed');
    });

    // Close BullMQ workers
    for (const worker of workers) {
      try {
        await worker.close();
        log.info({ workerName: worker.name }, 'BullMQ worker closed');
      } catch (err) {
        log.warn({ err, workerName: worker.name }, 'Error closing BullMQ worker');
      }
    }

    // Disconnect from Fabric
    fabricService.disconnect();
    log.info('Fabric gateway disconnected');

    // Close Redis
    try {
      await redis.quit();
      log.info('Redis disconnected');
    } catch (err) {
      log.warn({ err }, 'Error disconnecting Redis');
    }

    // Disconnect Prisma
    try {
      await prisma.$disconnect();
      log.info('PostgreSQL disconnected via Prisma');
    } catch (err) {
      log.warn({ err }, 'Error disconnecting Prisma');
    }

    log.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log.fatal({ err: reason }, 'Unhandled promise rejection');
    // Don't exit immediately — let the error handler deal with it
  });
}

// ---- Start the server ----
start().catch((err) => {
  log.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
