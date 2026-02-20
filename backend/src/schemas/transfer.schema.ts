import { z } from 'zod';

/**
 * Schema for initiating an ownership transfer.
 *
 * Business Rules Enforced:
 *  - Seller must be current owner (checked at service layer against chaincode)
 *  - Two witnesses are mandatory (beyond buyer/seller)
 *  - Sale amount is in paisa (integer) to avoid floating-point errors
 *  - System automatically computes stamp duty based on circle rate
 */
export const TransferInitSchema = z.object({
  propertyId: z
    .string()
    .regex(
      /^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d+(-[\w]+)?$/,
      'Invalid property ID format'
    )
    .describe('Property to transfer'),

  seller: z.object({
    aadhaarHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/, 'Aadhaar hash must be sha256-prefixed 64-char hex')
      .describe('SHA-256 hash of seller Aadhaar number'),
  }),

  buyer: z.object({
    aadhaarHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/, 'Aadhaar hash must be sha256-prefixed 64-char hex')
      .describe('SHA-256 hash of buyer Aadhaar number'),
    name: z
      .string()
      .min(1, 'Buyer name is required')
      .max(200, 'Buyer name too long')
      .describe('Full name of the buyer'),
  }),

  /** Sale amount in paisa (integer). 1 INR = 100 paisa. */
  saleAmount: z
    .number()
    .int('Sale amount must be an integer (in paisa)')
    .positive('Sale amount must be positive')
    .describe('Sale amount in paisa (e.g., 350000000 = 35 lakh INR)'),

  /**
   * Exactly 2 witnesses required.
   * As per Indian Registration Act, transfer documents require
   * witnesses beyond the buyer and seller.
   */
  witnesses: z
    .array(
      z.object({
        aadhaarHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/, 'Witness Aadhaar hash must be sha256-prefixed 64-char hex'),
        name: z
          .string()
          .min(1, 'Witness name is required')
          .max(200, 'Witness name too long'),
      })
    )
    .length(2, 'Exactly 2 witnesses are required for a property transfer'),

  /** Optional base64-encoded sale deed PDF for IPFS upload */
  saleDeedDocument: z
    .string()
    .max(33554432, 'Document exceeds 25MB limit') // ~25MB base64
    .optional()
    .describe('Base64-encoded sale deed PDF'),
});

export type TransferInitInput = z.infer<typeof TransferInitSchema>;

/**
 * Schema for submitting digital signatures (eSign) from parties.
 *
 * Each party (seller, buyer, witness1, witness2) must individually
 * submit their CCA-approved digital signature via the eSign API.
 */
export const TransferSignSchema = z.object({
  signatory: z
    .enum(['seller', 'buyer', 'witness1', 'witness2'], {
      errorMap: () => ({
        message: 'Signatory must be one of: seller, buyer, witness1, witness2',
      }),
    })
    .describe('Which party is signing'),

  eSignToken: z
    .string()
    .min(1, 'eSign token is required')
    .max(4096, 'eSign token too long')
    .describe('CCA-approved eSign token from the digital signature service'),
});

export type TransferSignInput = z.infer<typeof TransferSignSchema>;

/**
 * Schema for executing a finalized transfer.
 *
 * This is called by the Registrar after all prerequisites are met:
 *  - Stamp duty paid
 *  - All 4 signatures collected (seller, buyer, 2 witnesses)
 *  - Encumbrance check passed
 *  - Dispute check passed
 *  - Minor property check passed (court order if needed)
 */
export const TransferExecuteSchema = z.object({
  transferId: z
    .string()
    .min(1, 'Transfer ID is required')
    .max(30, 'Transfer ID too long')
    .regex(/^xfr_[a-z0-9]+$/, 'Transfer ID must match format: xfr_{alphanumeric}')
    .describe('Transfer ID to execute'),
});

export type TransferExecuteInput = z.infer<typeof TransferExecuteSchema>;

/**
 * Schema for filing an objection during the 72-hour cooling period.
 *
 * Any citizen can file an objection against a pending transfer
 * within the cooling period window. This pauses finalization and
 * triggers a manual review by the Registrar.
 */
export const ObjectionSchema = z.object({
  transferId: z
    .string()
    .min(1, 'Transfer ID is required')
    .max(30, 'Transfer ID too long')
    .regex(/^xfr_[a-z0-9]+$/, 'Transfer ID must match format: xfr_{alphanumeric}')
    .describe('Transfer ID to object against'),

  reason: z
    .string()
    .min(10, 'Objection reason must be at least 10 characters')
    .max(2000, 'Objection reason too long')
    .describe('Detailed reason for the objection'),

  supportingDocumentHash: z
    .string()
    .max(100, 'Document hash too long')
    .optional()
    .describe('IPFS CID of supporting document (if any)'),
});

export type ObjectionInput = z.infer<typeof ObjectionSchema>;

/**
 * Transfer ID params schema (for route parameter validation).
 */
export const TransferIdParamsSchema = z.object({
  transferId: z
    .string()
    .regex(/^xfr_[a-z0-9]+$/, 'Transfer ID must match format: xfr_{alphanumeric}'),
});

export type TransferIdParams = z.infer<typeof TransferIdParamsSchema>;
