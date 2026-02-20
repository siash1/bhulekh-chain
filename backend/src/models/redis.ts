// models/redis.ts — Redis (ioredis) client singleton for BhulekhChain
// Used for session management, rate limiting, caching, and BullMQ

import Redis from 'ioredis';
import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('redis');

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      log.warn({ attempt: times, delay }, 'Redis reconnecting...');
      return delay;
    },
  });

  client.on('connect', () => {
    log.info('Redis connected');
  });

  client.on('ready', () => {
    log.info('Redis ready');
  });

  client.on('error', (err) => {
    log.error({ err }, 'Redis connection error');
  });

  client.on('close', () => {
    log.warn('Redis connection closed');
  });

  return client;
}

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForRedis.redis = redis;
}

export default redis;
