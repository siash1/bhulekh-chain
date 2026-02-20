import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('rate-limiter');

/**
 * Rate limit configuration per role.
 * Values from API_SPEC.md Rate Limits table.
 *
 * All limits are per minute (60-second sliding window).
 */
const RATE_LIMITS: Record<string, { maxRequests: number; windowSeconds: number }> = {
  CITIZEN: { maxRequests: 100, windowSeconds: 60 },
  BANK: { maxRequests: 1000, windowSeconds: 60 },
  COURT: { maxRequests: 500, windowSeconds: 60 },
  REGISTRAR: { maxRequests: 500, windowSeconds: 60 },
  TEHSILDAR: { maxRequests: 500, windowSeconds: 60 },
  ADMIN: { maxRequests: 2000, windowSeconds: 60 },
  PUBLIC: { maxRequests: 30, windowSeconds: 60 },
};

/**
 * Rate limit error with proper error code per API_SPEC.md.
 */
class RateLimitExceededError extends Error {
  public readonly code = 'RATE_LIMIT_EXCEEDED';
  public readonly statusCode = 429;
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super('Too many requests. Please try again later.');
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Lua script for atomic rate limiting using sliding window counter.
 *
 * This runs as a single atomic operation in Redis, preventing race conditions.
 * Uses a sorted set with timestamped entries for a true sliding window.
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = current timestamp in milliseconds
 * ARGV[2] = window size in milliseconds
 * ARGV[3] = max requests allowed in the window
 *
 * Returns: [allowed (0|1), remaining requests, reset timestamp in ms]
 */
const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local max_requests = tonumber(ARGV[3])
  local window_start = now - window

  -- Remove expired entries outside the window
  redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

  -- Count current requests in the window
  local current = redis.call('ZCARD', key)

  if current < max_requests then
    -- Add current request with timestamp as score
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    -- Set TTL to window size (auto-cleanup)
    redis.call('PEXPIRE', key, window)
    return {1, max_requests - current - 1, now + window}
  else
    -- Get the oldest entry to calculate retry-after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local reset_at = window_start + window
    if #oldest >= 2 then
      reset_at = tonumber(oldest[2]) + window
    end
    return {0, 0, reset_at}
  end
`;

/**
 * Get the client IP address from the request, handling reverse proxies.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? '0.0.0.0';
  }
  return req.ip ?? '0.0.0.0';
}

/**
 * Build the Redis key for rate limiting.
 *
 * Authenticated users: keyed by user ID (limits apply per-user)
 * Unauthenticated users: keyed by IP address (limits apply per-IP)
 */
function buildRateLimitKey(req: Request): { key: string; role: string } {
  const user = req.user;

  if (user) {
    return {
      key: `ratelimit:${user.role}:${user.id}`,
      role: user.role,
    };
  }

  const ip = getClientIp(req);
  return {
    key: `ratelimit:PUBLIC:${ip}`,
    role: 'PUBLIC',
  };
}

/**
 * Create a rate limiter middleware backed by Redis.
 *
 * Uses a sliding window algorithm implemented as an atomic Lua script
 * in Redis for accuracy and thread safety.
 *
 * Response headers (per RFC 6585 / draft-ietf-httpapi-ratelimit-headers):
 *  - X-RateLimit-Limit: maximum requests allowed in window
 *  - X-RateLimit-Remaining: remaining requests in current window
 *  - X-RateLimit-Reset: Unix timestamp when the window resets
 *  - Retry-After: seconds until the client can retry (only on 429)
 *
 * @param redisUrl - Redis connection URL (e.g., redis://localhost:6379)
 * @returns Express middleware function
 */
export function createRateLimiter(redisUrl: string) {
  let redis: Redis | null = null;

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          log.error('Redis connection failed for rate limiter — disabling rate limiting');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err: Error) => {
      log.error({ err }, 'Redis rate limiter connection error');
    });

    redis.connect().catch((err: unknown) => {
      log.error({ err }, 'Failed to connect Redis for rate limiter');
    });
  } catch (err) {
    log.error({ err }, 'Failed to initialize Redis for rate limiter');
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If Redis is unavailable, allow the request (fail-open)
    // In production, this should be monitored via alerts
    if (!redis || redis.status !== 'ready') {
      log.warn('Rate limiter Redis not ready — allowing request');
      next();
      return;
    }

    const { key, role } = buildRateLimitKey(req);
    const config = RATE_LIMITS[role] ?? RATE_LIMITS['PUBLIC']!;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    try {
      const result = (await redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        now.toString(),
        windowMs.toString(),
        config.maxRequests.toString()
      )) as [number, number, number];

      const [allowed, remaining, resetAtMs] = result;
      const resetAtSeconds = Math.ceil((resetAtMs ?? now + windowMs) / 1000);

      // Set rate limit headers on all responses
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining ?? 0));
      res.setHeader('X-RateLimit-Reset', resetAtSeconds);

      if (allowed === 1) {
        next();
        return;
      }

      // Rate limit exceeded
      const retryAfterSeconds = Math.max(1, Math.ceil(((resetAtMs ?? now) - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);

      log.warn(
        {
          key,
          role,
          limit: config.maxRequests,
          retryAfter: retryAfterSeconds,
        },
        'Rate limit exceeded'
      );

      next(new RateLimitExceededError(retryAfterSeconds));
    } catch (err) {
      // On Redis errors, fail open (allow the request)
      log.error({ err, key }, 'Rate limiter error — allowing request');
      next();
    }
  };
}
