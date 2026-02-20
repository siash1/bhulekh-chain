// schemas/index.ts — Re-export barrel file for all Zod validation schemas
// Individual schemas are in their own files; this provides a unified import point
// for services that need type definitions.

// Re-export from individual schema files
export {
  AadhaarInitSchema,
  AadhaarVerifySchema,
  RefreshTokenSchema,
  LogoutSchema,
  type AadhaarInitInput,
  type AadhaarVerifyInput,
  type RefreshTokenInput,
  type LogoutInput,
} from './auth.schema.js';

export {
  PropertyIdSchema,
  LandSearchSchema,
  RegisterPropertySchema,
  PROPERTY_ID_REGEX,
  type PropertyIdInput,
  type LandSearchInput,
  type RegisterPropertyInput,
} from './land.schema.js';

export {
  TransferInitSchema,
  TransferSignSchema,
  TransferExecuteSchema,
  TransferIdParamsSchema,
  ObjectionSchema,
  type TransferInitInput,
  type TransferSignInput,
  type TransferExecuteInput,
  type TransferIdParams,
  type ObjectionInput,
} from './transfer.schema.js';

export {
  AddEncumbranceSchema,
  ReleaseEncumbranceSchema,
  EncumbranceIdParamsSchema,
  type AddEncumbranceInput,
  type ReleaseEncumbranceInput,
  type EncumbranceIdParams,
} from './encumbrance.schema.js';

// ============================================================
// Schemas without dedicated files (dispute, verification, admin)
// ============================================================

import { z } from 'zod';

// ---- Dispute Schemas ----

/** Property ID format for inline use */
const propertyIdSchema = z
  .string()
  .regex(/^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d+(-[\w]+)?$/, 'Invalid property ID format');

/** Aadhaar hash format */
const aadhaarHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, 'Invalid Aadhaar hash format');

export const flagDisputeSchema = z.object({
  propertyId: propertyIdSchema,
  type: z.enum(['OWNERSHIP_CLAIM', 'BOUNDARY', 'INHERITANCE', 'FRAUD', 'GOVERNMENT_ACQUISITION']),
  filedBy: z.object({
    aadhaarHash: aadhaarHashSchema,
    name: z.string().min(1),
  }),
  against: z.object({
    aadhaarHash: aadhaarHashSchema,
    name: z.string().min(1),
  }),
  courtName: z.string().min(1),
  caseNumber: z.string().min(1),
  description: z.string().min(10),
});

export const resolveDisputeSchema = z.object({
  resolution: z.enum(['RESOLVED_IN_FAVOR', 'RESOLVED_AGAINST', 'SETTLED']),
  resolutionDetails: z.string().min(1),
});

export const disputeIdParamSchema = z.object({
  disputeId: z.string().min(1),
});

// ---- Verification Schemas ----

export const verifyDocumentSchema = z.object({
  documentHash: z.string().min(1, 'Document hash is required'),
});

// ---- Type Exports ----

export type FlagDisputeInput = z.infer<typeof flagDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;

// ---- Compatibility Aliases ----
// These aliases ensure services that import by the old names still work.

/** @deprecated Use TransferInitInput instead */
import type { TransferInitInput as _TransferInitInput } from './transfer.schema.js';
export type InitiateTransferInput = _TransferInitInput;
