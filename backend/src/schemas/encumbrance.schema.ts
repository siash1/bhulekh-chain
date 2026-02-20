import { z } from 'zod';

/**
 * Schema for adding an encumbrance (mortgage, lien, or court order) to a property.
 *
 * Only Bank and Court roles can add encumbrances. The encumbrance is
 * written to both Fabric chaincode and the PostgreSQL mirror.
 *
 * Business Rules:
 *  - Property must exist and be ACTIVE
 *  - Amounts are in paisa (integer)
 *  - Adding an encumbrance sets property's encumbranceStatus to ENCUMBERED
 *  - A property can have multiple active encumbrances
 */
export const AddEncumbranceSchema = z.object({
  propertyId: z
    .string()
    .regex(
      /^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d+(-[\w]+)?$/,
      'Invalid property ID format'
    )
    .describe('Property to encumber'),

  type: z
    .enum(['MORTGAGE', 'LIEN', 'COURT_ORDER'], {
      errorMap: () => ({
        message: 'Encumbrance type must be MORTGAGE, LIEN, or COURT_ORDER',
      }),
    })
    .describe('Type of encumbrance'),

  institution: z.object({
    name: z
      .string()
      .min(1, 'Institution name is required')
      .max(200, 'Institution name too long')
      .describe('Name of the bank, financial institution, or court'),
    branchCode: z
      .string()
      .max(50, 'Branch code too long')
      .default('')
      .describe('Branch code (e.g., SBI-GNT-001)'),
  }),

  loanAccountNumber: z
    .string()
    .max(50, 'Loan account number too long')
    .optional()
    .describe('Loan account number (for mortgages)'),

  /** Sanctioned or order amount in paisa */
  amount: z
    .number()
    .int('Amount must be an integer (in paisa)')
    .positive('Amount must be positive')
    .describe('Sanctioned/order amount in paisa'),

  /** Interest rate in basis points (e.g., 850 = 8.50%). Only for mortgages. */
  interestRate: z
    .number()
    .int('Interest rate must be in basis points')
    .nonnegative()
    .max(10000, 'Interest rate cannot exceed 100%')
    .optional()
    .describe('Interest rate in basis points (850 = 8.50%)'),

  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD format')
    .describe('Encumbrance start date'),

  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD format')
    .optional()
    .describe('Encumbrance end date (optional for court orders)'),

  /** Reference to court order (for COURT_ORDER type) */
  courtOrderRef: z
    .string()
    .max(100, 'Court order reference too long')
    .optional()
    .describe('Court order reference number'),
});

export type AddEncumbranceInput = z.infer<typeof AddEncumbranceSchema>;

/**
 * Schema for releasing an encumbrance.
 *
 * When a loan is repaid or a court order is lifted, the encumbrance
 * is released. If no other active encumbrances remain, the property's
 * encumbranceStatus reverts to CLEAR.
 */
export const ReleaseEncumbranceSchema = z.object({
  encumbranceId: z
    .string()
    .min(1, 'Encumbrance ID is required')
    .max(30, 'Encumbrance ID too long')
    .regex(/^enc_[a-z0-9]+$/, 'Encumbrance ID must match format: enc_{alphanumeric}')
    .describe('ID of the encumbrance to release'),
});

export type ReleaseEncumbranceInput = z.infer<typeof ReleaseEncumbranceSchema>;

/**
 * Encumbrance ID params schema (for route parameter validation).
 */
export const EncumbranceIdParamsSchema = z.object({
  encumbranceId: z
    .string()
    .regex(/^enc_[a-z0-9]+$/, 'Encumbrance ID must match format: enc_{alphanumeric}'),
});

export type EncumbranceIdParams = z.infer<typeof EncumbranceIdParamsSchema>;
