// services/auth.service.ts — Aadhaar authentication and JWT token management
// Handles Aadhaar eKYC OTP flow, user creation/lookup, and JWT lifecycle

import jwt from 'jsonwebtoken';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import redis from '../models/redis.js';
import { hashAadhaar, generateId, nowISO } from '../utils/helpers.js';
import { AuthInvalidOtpError, AuthTokenInvalidError, AuthTokenExpiredError, ValidationError } from '../utils/errors.js';
import type { JwtPayload, UserRole } from '../types/index.js';

const log = createServiceLogger('auth-service');

// Load RSA keys for JWT signing (RS256)
// Fall back to symmetric HMAC in development if keys are not available
let jwtSignKey: string | Buffer;
let jwtVerifyKey: string | Buffer;
let jwtAlgorithm: jwt.Algorithm;

try {
  jwtSignKey = fs.readFileSync(config.JWT_PRIVATE_KEY_PATH, 'utf8');
  jwtVerifyKey = fs.readFileSync(config.JWT_PUBLIC_KEY_PATH, 'utf8');
  jwtAlgorithm = 'RS256';
  log.info('RSA keys loaded for JWT signing');
} catch {
  log.warn('RSA keys not found, falling back to HMAC (dev only)');
  jwtSignKey = 'bhulekhchain-dev-secret-do-not-use-in-production';
  jwtVerifyKey = jwtSignKey;
  jwtAlgorithm = 'HS256';
}

// OTP valid duration: 10 minutes
const OTP_EXPIRY_SECONDS = 600;
// Refresh token Redis prefix
const REFRESH_TOKEN_PREFIX = 'refresh_token:';

/**
 * AuthService handles the complete authentication lifecycle:
 * 1. Aadhaar OTP initiation (call UIDAI API)
 * 2. OTP verification + user creation/lookup
 * 3. JWT token pair generation (access + refresh)
 * 4. Token refresh and logout
 */
class AuthService {
  /**
   * Initiate Aadhaar OTP authentication.
   * In production, this calls the UIDAI API to send an OTP.
   * In development, generates a dev OTP and stores it in Redis.
   *
   * @returns transactionId — used to correlate the OTP verification
   */
  async initiateAadhaarAuth(aadhaarNumber: string): Promise<{ transactionId: string; message: string }> {
    const cleaned = aadhaarNumber.replace(/[-\s]/g, '');
    if (!/^\d{12}$/.test(cleaned)) {
      throw new ValidationError('Aadhaar number must be exactly 12 digits');
    }

    const transactionId = `txn_${crypto.randomBytes(6).toString('hex')}`;
    const aadhaarHash = hashAadhaar(cleaned);

    if (config.NODE_ENV === 'production') {
      // Production: Call UIDAI OTP API
      // The actual UIDAI integration would use their XML-based API
      try {
        const response = await fetch(`${config.AADHAAR_API_URL}otp/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-License-Key': config.AADHAAR_LICENSE_KEY,
          },
          body: JSON.stringify({
            uid: cleaned,
            txnId: transactionId,
          }),
        });

        if (!response.ok) {
          log.error({ status: response.status }, 'UIDAI OTP request failed');
          throw new Error('UIDAI OTP request failed');
        }

        // Store the transaction context in Redis
        await redis.setex(
          `aadhaar_otp:${transactionId}`,
          OTP_EXPIRY_SECONDS,
          JSON.stringify({ aadhaarHash, timestamp: nowISO() }),
        );

        log.info({ transactionId, aadhaarHash }, 'Aadhaar OTP requested (production)');
      } catch (err) {
        log.error({ err }, 'Failed to call UIDAI API');
        throw new ValidationError('Failed to initiate Aadhaar authentication');
      }
    } else {
      // Development: Generate a deterministic dev OTP
      const devOtp = '123456';
      await redis.setex(
        `aadhaar_otp:${transactionId}`,
        OTP_EXPIRY_SECONDS,
        JSON.stringify({
          aadhaarHash,
          otp: devOtp,
          devMode: true,
          timestamp: nowISO(),
        }),
      );

      log.info(
        { transactionId, aadhaarHash, devOtp },
        'Aadhaar OTP initiated (dev mode, OTP: 123456)',
      );
    }

    return {
      transactionId,
      message: 'OTP sent to registered mobile',
    };
  }

  /**
   * Verify OTP and authenticate user.
   * On success: creates/finds user in DB, generates JWT token pair.
   *
   * @returns Token pair + user info
   */
  async verifyAadhaarOtp(
    transactionId: string,
    otp: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      id: string;
      aadhaarHash: string;
      name: string;
      role: UserRole;
      stateCode: string | null;
    };
  }> {
    // Retrieve stored OTP context from Redis
    const stored = await redis.get(`aadhaar_otp:${transactionId}`);
    if (!stored) {
      throw new AuthInvalidOtpError('OTP expired or invalid transaction ID');
    }

    const context = JSON.parse(stored) as {
      aadhaarHash: string;
      otp?: string;
      devMode?: boolean;
    };

    // Verify the OTP
    if (config.NODE_ENV === 'production') {
      // Production: Verify against UIDAI API
      try {
        const response = await fetch(`${config.AADHAAR_API_URL}otp/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-License-Key': config.AADHAAR_LICENSE_KEY,
          },
          body: JSON.stringify({
            txnId: transactionId,
            otp,
          }),
        });

        if (!response.ok) {
          throw new AuthInvalidOtpError();
        }

        // UIDAI returns demographic data on success — extract name
        const uidaiResponse = (await response.json()) as { name?: string };
        // Use the UIDAI-verified name
        const verifiedName = uidaiResponse.name ?? 'Verified User';

        // Create or update user in database
        const user = await this.findOrCreateUser(
          context.aadhaarHash,
          verifiedName,
        );

        // Delete OTP from Redis (one-time use)
        await redis.del(`aadhaar_otp:${transactionId}`);

        return this.buildAuthResponse(user);
      } catch (err) {
        if (err instanceof AuthInvalidOtpError) throw err;
        log.error({ err }, 'UIDAI OTP verification failed');
        throw new AuthInvalidOtpError();
      }
    } else {
      // Development: Check against stored dev OTP
      if (context.otp !== otp) {
        throw new AuthInvalidOtpError('Invalid OTP (dev mode expects 123456)');
      }

      // In dev mode, create user with a generic name
      const user = await this.findOrCreateUser(
        context.aadhaarHash,
        'Dev User',
      );

      // Delete OTP from Redis
      await redis.del(`aadhaar_otp:${transactionId}`);

      log.info({ userId: user.id, aadhaarHash: context.aadhaarHash }, 'User authenticated (dev mode)');

      return this.buildAuthResponse(user);
    }
  }

  /**
   * Refresh an access token using a valid refresh token.
   *
   * @returns New access token (refresh token remains the same)
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    // Verify the refresh token signature
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(refreshToken, jwtVerifyKey, {
        algorithms: [jwtAlgorithm],
        issuer: 'bhulekhchain',
      }) as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthTokenExpiredError('Refresh token expired');
      }
      throw new AuthTokenInvalidError('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new AuthTokenInvalidError('Token is not a refresh token');
    }

    // Check if refresh token has been invalidated (logged out)
    const isBlacklisted = await redis.get(`${REFRESH_TOKEN_PREFIX}${decoded.sub}:blacklist:${refreshToken.slice(-16)}`);
    if (isBlacklisted) {
      throw new AuthTokenInvalidError('Refresh token has been invalidated');
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
    });

    if (!user) {
      throw new AuthTokenInvalidError('User no longer exists');
    }

    // Generate new access token
    const accessToken = this.signToken({
      sub: user.id,
      aadhaarHash: user.aadhaarHash,
      name: user.name,
      role: user.role as UserRole,
      stateCode: user.stateCode,
      districtCode: user.districtCode,
      type: 'access',
    }, config.JWT_ACCESS_TOKEN_EXPIRY);

    log.debug({ userId: user.id }, 'Access token refreshed');

    return {
      accessToken,
      expiresIn: config.JWT_ACCESS_TOKEN_EXPIRY,
    };
  }

  /**
   * Logout by invalidating the refresh token.
   * The token identifier is added to a Redis blacklist.
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = jwt.verify(refreshToken, jwtVerifyKey, {
        algorithms: [jwtAlgorithm],
        issuer: 'bhulekhchain',
      }) as JwtPayload;

      // Blacklist this refresh token for its remaining TTL
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(
          `${REFRESH_TOKEN_PREFIX}${decoded.sub}:blacklist:${refreshToken.slice(-16)}`,
          ttl,
          '1',
        );
      }

      log.info({ userId: decoded.sub }, 'User logged out, refresh token invalidated');
    } catch {
      // If the token is already invalid/expired, just ignore
      log.debug('Logout called with invalid/expired token, ignoring');
    }
  }

  /**
   * Generate an access + refresh JWT token pair for a user.
   */
  generateTokenPair(user: {
    id: string;
    aadhaarHash: string;
    name: string;
    role: string;
    stateCode: string | null;
    districtCode: string | null;
  }): { accessToken: string; refreshToken: string; expiresIn: number } {
    const accessToken = this.signToken({
      sub: user.id,
      aadhaarHash: user.aadhaarHash,
      name: user.name,
      role: user.role as UserRole,
      stateCode: user.stateCode,
      districtCode: user.districtCode,
      type: 'access',
    }, config.JWT_ACCESS_TOKEN_EXPIRY);

    const refreshToken = this.signToken({
      sub: user.id,
      aadhaarHash: user.aadhaarHash,
      name: user.name,
      role: user.role as UserRole,
      stateCode: user.stateCode,
      districtCode: user.districtCode,
      type: 'refresh',
    }, config.JWT_REFRESH_TOKEN_EXPIRY);

    return {
      accessToken,
      refreshToken,
      expiresIn: config.JWT_ACCESS_TOKEN_EXPIRY,
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async findOrCreateUser(
    aadhaarHash: string,
    name: string,
  ): Promise<{
    id: string;
    aadhaarHash: string;
    name: string;
    role: string;
    stateCode: string | null;
    districtCode: string | null;
  }> {
    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { aadhaarHash },
    });

    if (user) {
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return user;
    }

    // Create new user
    const userId = generateId('usr');
    user = await prisma.user.create({
      data: {
        id: userId,
        aadhaarHash,
        name,
        role: 'CITIZEN', // Default role; admin promotes via separate process
      },
    });

    log.info({ userId, aadhaarHash }, 'New user created');
    return user;
  }

  private async buildAuthResponse(user: {
    id: string;
    aadhaarHash: string;
    name: string;
    role: string;
    stateCode: string | null;
    districtCode: string | null;
  }) {
    const tokens = this.generateTokenPair(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        aadhaarHash: user.aadhaarHash,
        name: user.name,
        role: user.role as UserRole,
        stateCode: user.stateCode,
      },
    };
  }

  private signToken(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    expiresInSeconds: number,
  ): string {
    return jwt.sign(
      { ...payload },
      jwtSignKey,
      {
        algorithm: jwtAlgorithm,
        issuer: 'bhulekhchain',
        expiresIn: expiresInSeconds,
      },
    );
  }
}

export const authService = new AuthService();
export default authService;
