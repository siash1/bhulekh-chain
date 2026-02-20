import { z } from 'zod';

/**
 * Aadhaar OTP initiation schema.
 *
 * The aadhaarNumber is the full 12-digit Aadhaar number, transmitted
 * encrypted from the client. The backend hashes it immediately and
 * NEVER stores the raw number anywhere (not in DB, not in logs).
 *
 * Validation: exactly 12 digits (no spaces or dashes — those are UI-only).
 */
export const AadhaarInitSchema = z.object({
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 digits')
    .describe('Full 12-digit Aadhaar number (transmitted encrypted, never stored)'),
});

export type AadhaarInitInput = z.infer<typeof AadhaarInitSchema>;

/**
 * Aadhaar OTP verification schema.
 *
 * After calling /auth/aadhaar/init, the user receives an OTP on their
 * registered mobile number. They submit the OTP along with the
 * transactionId received from the init response.
 */
export const AadhaarVerifySchema = z.object({
  transactionId: z
    .string()
    .min(1, 'Transaction ID is required')
    .max(100, 'Transaction ID is too long')
    .describe('Transaction ID received from the Aadhaar OTP init call'),
  otp: z
    .string()
    .regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
    .describe('6-digit OTP received via SMS on Aadhaar-linked mobile'),
});

export type AadhaarVerifyInput = z.infer<typeof AadhaarVerifySchema>;

/**
 * Refresh token schema.
 *
 * Used to obtain a new access token without requiring re-authentication.
 * Refresh tokens are long-lived (7 days) and stored server-side in Redis
 * for revocation capability.
 */
export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .describe('JWT refresh token issued during authentication'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

/**
 * Logout schema.
 *
 * Invalidates the refresh token on the server side.
 */
export const LogoutSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .describe('Refresh token to invalidate'),
});

export type LogoutInput = z.infer<typeof LogoutSchema>;
