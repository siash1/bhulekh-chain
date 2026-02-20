// models/prisma.ts — Prisma Client singleton for BhulekhChain
// Prevents multiple instances during hot-reload in development

import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Log slow queries in development
prisma.$on('query' as never, (e: { duration: number; query: string }) => {
  if (e.duration > 200) {
    log.warn({ duration: e.duration, query: e.query }, 'Slow database query detected');
  }
});

prisma.$on('error' as never, (e: { message: string }) => {
  log.error({ err: e.message }, 'Prisma client error');
});

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
