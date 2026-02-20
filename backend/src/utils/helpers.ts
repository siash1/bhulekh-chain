// utils/helpers.ts — Utility functions for BhulekhChain backend

import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Generate a short unique ID with a given prefix.
 * Format: {prefix}_{8 random hex chars}
 * Examples: xfr_a1b2c3d4, enc_e5f6g7h8, dsp_i9j0k1l2
 */
export function generateId(prefix: string): string {
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${randomPart}`;
}

/**
 * Hash an Aadhaar number with the application salt using SHA-256.
 * The raw Aadhaar number is NEVER stored — only this hash is retained.
 */
export function hashAadhaar(aadhaarNumber: string): string {
  const cleaned = aadhaarNumber.replace(/[-\s]/g, '');
  const hash = crypto
    .createHash('sha256')
    .update(cleaned + config.AADHAAR_HASH_SALT)
    .digest('hex');
  return `sha256:${hash}`;
}

/**
 * Generate a SHA-256 hash of arbitrary data for audit chain integrity.
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate stamp duty based on Indian state rules.
 * Uses the higher of declared value and circle rate (anti-benami measure).
 * All amounts in paisa (BigInt).
 */
export function calculateStampDuty(
  stateCode: string,
  areaSqMeters: number,
  declaredValuePaisa: bigint,
  circleRatePerSqMeterPaisa: bigint,
): {
  circleRateValue: bigint;
  applicableValue: bigint;
  stampDutyRate: number;
  stampDutyAmount: bigint;
  registrationFee: bigint;
  surcharge: bigint;
  totalFees: bigint;
  state: string;
} {
  const circleRateValue = circleRatePerSqMeterPaisa * BigInt(Math.round(areaSqMeters));
  // Anti-benami: use the higher of declared value and circle rate value
  const applicableValue = declaredValuePaisa > circleRateValue ? declaredValuePaisa : circleRateValue;

  // State-specific stamp duty rates (basis points)
  // These are simplified; real rates vary by property type, location, gender, etc.
  const stateRates: Record<string, { stampDutyBps: number; registrationBps: number; surchargeBps: number }> = {
    AP: { stampDutyBps: 500, registrationBps: 50, surchargeBps: 100 },
    TG: { stampDutyBps: 600, registrationBps: 50, surchargeBps: 100 },
    MH: { stampDutyBps: 600, registrationBps: 100, surchargeBps: 100 },
    KA: { stampDutyBps: 550, registrationBps: 100, surchargeBps: 200 },
    GJ: { stampDutyBps: 490, registrationBps: 100, surchargeBps: 0 },
    RJ: { stampDutyBps: 600, registrationBps: 100, surchargeBps: 0 },
    UP: { stampDutyBps: 700, registrationBps: 100, surchargeBps: 0 },
    MP: { stampDutyBps: 750, registrationBps: 100, surchargeBps: 0 },
    DL: { stampDutyBps: 600, registrationBps: 100, surchargeBps: 0 },
    TN: { stampDutyBps: 700, registrationBps: 100, surchargeBps: 0 },
  };

  const rates = stateRates[stateCode] ?? { stampDutyBps: 600, registrationBps: 100, surchargeBps: 0 };

  const stampDutyAmount = (applicableValue * BigInt(rates.stampDutyBps)) / 10000n;
  const registrationFee = (applicableValue * BigInt(rates.registrationBps)) / 10000n;
  const surcharge = (applicableValue * BigInt(rates.surchargeBps)) / 10000n;
  const totalFees = stampDutyAmount + registrationFee + surcharge;

  return {
    circleRateValue,
    applicableValue,
    stampDutyRate: rates.stampDutyBps,
    stampDutyAmount,
    registrationFee,
    surcharge,
    totalFees,
    state: stateCode,
  };
}

/**
 * Validate Indian property ID format.
 * Format: {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}-{SubSurveyNo}
 */
export function isValidPropertyId(propertyId: string): boolean {
  return /^[A-Z]{2}-[A-Z]{2,5}-[A-Z]{2,5}-[A-Z]{2,5}-[0-9A-Za-z]+-[0-9A-Za-z]+$/.test(propertyId);
}

/**
 * Extract state code from property ID.
 */
export function extractStateCode(propertyId: string): string {
  return propertyId.split('-')[0] ?? '';
}

/**
 * Validate 12-digit Aadhaar number format.
 */
export function isValidAadhaar(aadhaar: string): boolean {
  const cleaned = aadhaar.replace(/[-\s]/g, '');
  return /^\d{12}$/.test(cleaned);
}

/**
 * Convert BigInt to a JSON-safe number representation (in paisa).
 * Use only for values that fit safely in a regular number.
 */
export function bigintToNumber(value: bigint): number {
  return Number(value);
}

/**
 * Format paisa amount to rupees string for display.
 */
export function paisaToRupees(paisa: bigint): string {
  const rupees = Number(paisa) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(rupees);
}

/**
 * Get current ISO timestamp.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Calculate cooling period end date (72 hours from now).
 */
export function coolingPeriodEnd(): Date {
  const end = new Date();
  end.setHours(end.getHours() + 72);
  return end;
}

/**
 * Check if cooling period has expired.
 */
export function isCoolingPeriodExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return new Date() > expiry;
}

/**
 * Serialize BigInt values to strings for JSON output.
 * Prisma returns BigInt for certain fields which cannot be serialized to JSON natively.
 */
export function serializeBigInts<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString() as unknown as T;
  if (Array.isArray(obj)) return obj.map(serializeBigInts) as unknown as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInts(value);
    }
    return result as T;
  }
  return obj;
}
