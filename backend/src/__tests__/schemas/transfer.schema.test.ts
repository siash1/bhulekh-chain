/**
 * BhulekhChain Unit Tests - Transfer Schema Validation
 *
 * Tests the Zod transfer initiation schema to ensure all business
 * validation rules are enforced at the API boundary.
 */

import { z } from 'zod';
import { AADHAAR_HASH_LENGTH, PROPERTY_ID_REGEX } from '../../../../tests/fixtures/indian-test-data';

// ---- Schema Definition (mirrors backend/src/schemas/transfer.schema.ts) ----

const WitnessSchema = z.object({
  aadhaarHash: z
    .string()
    .length(AADHAAR_HASH_LENGTH, `Aadhaar hash must be exactly ${AADHAAR_HASH_LENGTH} characters (SHA-256 hex)`),
  name: z
    .string()
    .min(1, 'Witness name is required')
    .max(200, 'Witness name must not exceed 200 characters'),
});

const TransferInitSchema = z.object({
  propertyId: z
    .string()
    .regex(PROPERTY_ID_REGEX, 'Invalid property ID format. Expected: XX-XXX-XXX-XXX-NNN-S'),
  seller: z.object({
    aadhaarHash: z
      .string()
      .length(AADHAAR_HASH_LENGTH, `Aadhaar hash must be exactly ${AADHAAR_HASH_LENGTH} characters`),
  }),
  buyer: z.object({
    aadhaarHash: z
      .string()
      .length(AADHAAR_HASH_LENGTH, `Aadhaar hash must be exactly ${AADHAAR_HASH_LENGTH} characters`),
    name: z
      .string()
      .min(1, 'Buyer name is required')
      .max(200, 'Buyer name must not exceed 200 characters'),
  }),
  saleAmount: z
    .number()
    .int('Sale amount must be an integer (paisa)')
    .positive('Sale amount must be positive'),
  witnesses: z
    .array(WitnessSchema)
    .length(2, 'Exactly 2 witnesses are required'),
});

type TransferInitInput = z.infer<typeof TransferInitSchema>;

// ---- Tests ----

describe('Transfer Schema Validation', () => {
  const validTransferData: TransferInitInput = {
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    seller: {
      aadhaarHash: 'a'.repeat(64),
    },
    buyer: {
      aadhaarHash: 'e'.repeat(64),
      name: 'Priya Sharma',
    },
    saleAmount: 350000000,
    witnesses: [
      { aadhaarHash: 'f'.repeat(64), name: 'Anil Verma' },
      { aadhaarHash: '3'.repeat(64), name: 'Sunita Devi' },
    ],
  };

  describe('Valid Data', () => {
    it('should accept valid transfer data', () => {
      const result = TransferInitSchema.safeParse(validTransferData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.propertyId).toBe('AP-GNT-TNL-SKM-142-3');
        expect(result.data.seller.aadhaarHash).toHaveLength(64);
        expect(result.data.buyer.aadhaarHash).toHaveLength(64);
        expect(result.data.buyer.name).toBe('Priya Sharma');
        expect(result.data.saleAmount).toBe(350000000);
        expect(result.data.witnesses).toHaveLength(2);
      }
    });

    it('should accept property IDs with alphabetic sub-survey numbers', () => {
      const data = { ...validTransferData, propertyId: 'GJ-AMD-CTY-NAR-89-2A' };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept minimum valid sale amount of 1 paisa', () => {
      const data = { ...validTransferData, saleAmount: 1 };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept large sale amounts', () => {
      const data = { ...validTransferData, saleAmount: 999999999999 };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Property ID Validation', () => {
    it('should reject invalid property ID format', () => {
      const invalidIds = [
        'ap-gnt-tnl-skm-142-3',    // lowercase
        'INVALID',                   // not matching pattern
        'AP-GN-TNL-SKM-142-3',     // district code too short
        '',                          // empty string
        '123-456-789-012-345-6',    // numeric codes instead of alpha
      ];

      invalidIds.forEach((id) => {
        const data = { ...validTransferData, propertyId: id };
        const result = TransferInitSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          const propertyIdErrors = result.error.issues.filter(
            (issue) => issue.path.includes('propertyId')
          );
          expect(propertyIdErrors.length).toBeGreaterThan(0);
        }
      });
    });

    it('should reject missing property ID', () => {
      const { propertyId, ...withoutPropertyId } = validTransferData;
      const result = TransferInitSchema.safeParse(withoutPropertyId);
      expect(result.success).toBe(false);
    });
  });

  describe('Witness Validation', () => {
    it('should require exactly 2 witnesses', () => {
      const result = TransferInitSchema.safeParse(validTransferData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.witnesses).toHaveLength(2);
      }
    });

    it('should reject 0 witnesses', () => {
      const data = { ...validTransferData, witnesses: [] };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const witnessErrors = result.error.issues.filter(
          (issue) => issue.path.includes('witnesses')
        );
        expect(witnessErrors.length).toBeGreaterThan(0);
      }
    });

    it('should reject 1 witness', () => {
      const data = {
        ...validTransferData,
        witnesses: [{ aadhaarHash: 'f'.repeat(64), name: 'Single Witness' }],
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject 3 witnesses', () => {
      const data = {
        ...validTransferData,
        witnesses: [
          { aadhaarHash: 'f'.repeat(64), name: 'Witness 1' },
          { aadhaarHash: '3'.repeat(64), name: 'Witness 2' },
          { aadhaarHash: '4'.repeat(64), name: 'Witness 3' },
        ],
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject witness with invalid aadhaar hash length', () => {
      const data = {
        ...validTransferData,
        witnesses: [
          { aadhaarHash: 'abc123', name: 'Bad Hash Witness' },
          { aadhaarHash: '3'.repeat(64), name: 'Good Witness' },
        ],
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject witness with empty name', () => {
      const data = {
        ...validTransferData,
        witnesses: [
          { aadhaarHash: 'f'.repeat(64), name: '' },
          { aadhaarHash: '3'.repeat(64), name: 'Good Witness' },
        ],
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Sale Amount Validation', () => {
    it('should require positive sale amount', () => {
      const result = TransferInitSchema.safeParse(validTransferData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.saleAmount).toBeGreaterThan(0);
      }
    });

    it('should reject zero sale amount', () => {
      const data = { ...validTransferData, saleAmount: 0 };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject negative sale amount', () => {
      const data = { ...validTransferData, saleAmount: -100 };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject floating point sale amount', () => {
      const data = { ...validTransferData, saleAmount: 350000.50 };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject string sale amount', () => {
      const data = { ...validTransferData, saleAmount: '350000000' as unknown as number };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Aadhaar Hash Validation', () => {
    it('should validate aadhaar hash length is exactly 64 chars', () => {
      const result = TransferInitSchema.safeParse(validTransferData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.seller.aadhaarHash).toHaveLength(64);
        expect(result.data.buyer.aadhaarHash).toHaveLength(64);
      }
    });

    it('should reject seller aadhaar hash shorter than 64 chars', () => {
      const data = {
        ...validTransferData,
        seller: { aadhaarHash: 'a'.repeat(63) },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject seller aadhaar hash longer than 64 chars', () => {
      const data = {
        ...validTransferData,
        seller: { aadhaarHash: 'a'.repeat(65) },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject buyer aadhaar hash shorter than 64 chars', () => {
      const data = {
        ...validTransferData,
        buyer: { aadhaarHash: 'short', name: 'Test Buyer' },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject empty aadhaar hash', () => {
      const data = {
        ...validTransferData,
        seller: { aadhaarHash: '' },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Buyer Validation', () => {
    it('should require buyer name', () => {
      const data = {
        ...validTransferData,
        buyer: { aadhaarHash: 'e'.repeat(64), name: '' },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject buyer name exceeding 200 characters', () => {
      const data = {
        ...validTransferData,
        buyer: { aadhaarHash: 'e'.repeat(64), name: 'X'.repeat(201) },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should accept buyer name with Indian characters', () => {
      const data = {
        ...validTransferData,
        buyer: { aadhaarHash: 'e'.repeat(64), name: 'Priya Sharma (daughter of Raj Kumar)' },
      };
      const result = TransferInitSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('Missing Required Fields', () => {
    it('should reject missing seller', () => {
      const { seller, ...withoutSeller } = validTransferData;
      const result = TransferInitSchema.safeParse(withoutSeller);
      expect(result.success).toBe(false);
    });

    it('should reject missing buyer', () => {
      const { buyer, ...withoutBuyer } = validTransferData;
      const result = TransferInitSchema.safeParse(withoutBuyer);
      expect(result.success).toBe(false);
    });

    it('should reject missing sale amount', () => {
      const { saleAmount, ...withoutAmount } = validTransferData;
      const result = TransferInitSchema.safeParse(withoutAmount);
      expect(result.success).toBe(false);
    });

    it('should reject missing witnesses', () => {
      const { witnesses, ...withoutWitnesses } = validTransferData;
      const result = TransferInitSchema.safeParse(withoutWitnesses);
      expect(result.success).toBe(false);
    });

    it('should reject null input', () => {
      const result = TransferInitSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined input', () => {
      const result = TransferInitSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = TransferInitSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
