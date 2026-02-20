// controllers/auth.controller.ts — Authentication route handlers
// POST /auth/aadhaar/init, POST /auth/aadhaar/verify, POST /auth/refresh, POST /auth/logout

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import { AadhaarInitSchema, AadhaarVerifySchema, RefreshTokenSchema, LogoutSchema } from '../schemas/auth.schema.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('auth-controller');

export const authRouter = Router();

/**
 * POST /auth/aadhaar/init
 * Initiate Aadhaar OTP authentication.
 * No auth required.
 */
authRouter.post(
  '/aadhaar/init',
  validateBody(AadhaarInitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { aadhaarNumber } = req.body as { aadhaarNumber: string };

      const result = await authService.initiateAadhaarAuth(aadhaarNumber);

      log.info({ transactionId: result.transactionId }, 'Aadhaar OTP initiated');

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
 * POST /auth/aadhaar/verify
 * Verify Aadhaar OTP and receive JWT tokens.
 * No auth required.
 */
authRouter.post(
  '/aadhaar/verify',
  validateBody(AadhaarVerifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transactionId, otp } = req.body as { transactionId: string; otp: string };

      const result = await authService.verifyAadhaarOtp(transactionId, otp);

      log.info({ userId: result.user.id, role: result.user.role }, 'Aadhaar OTP verified, user authenticated');

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
 * POST /auth/refresh
 * Refresh access token using a valid refresh token.
 * No auth required (uses refresh token).
 */
authRouter.post(
  '/refresh',
  validateBody(RefreshTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as { refreshToken: string };

      const result = await authService.refreshToken(refreshToken);

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
 * POST /auth/logout
 * Invalidate refresh token.
 * No auth required (uses refresh token in body).
 */
authRouter.post(
  '/logout',
  validateBody(LogoutSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as { refreshToken: string };

      await authService.logout(refreshToken);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default authRouter;
