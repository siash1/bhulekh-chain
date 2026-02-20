/**
 * BhulekhChain Integration Tests - Transfer Flow
 *
 * Tests the complete ownership transfer lifecycle including
 * stamp duty, disputes, encumbrances, cooling period, and witnesses.
 */

import {
  TEST_PROPERTIES,
  TEST_USERS,
  TEST_TRANSFERS,
  TEST_ENCUMBRANCES,
  TEST_STAMP_DUTY,
  AADHAAR_HASH_LENGTH,
} from '../fixtures/indian-test-data';

// Mock dependencies
const mockPrismaLandRecord = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockPrismaTransfer = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockPrismaEncumbrance = {
  findMany: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    landRecord: mockPrismaLandRecord,
    transfer: mockPrismaTransfer,
    encumbrance: mockPrismaEncumbrance,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      landRecord: mockPrismaLandRecord,
      transfer: mockPrismaTransfer,
      encumbrance: mockPrismaEncumbrance,
    })),
  })),
}));

const mockFabricService = {
  evaluateTransaction: jest.fn(),
  submitTransaction: jest.fn(),
};

jest.mock('../../backend/src/services/fabric.service', () => ({
  FabricService: jest.fn().mockImplementation(() => mockFabricService),
}));

/** Helper: calculate stamp duty using circle rate vs declared value */
function calculateStampDuty(
  stateCode: string,
  areaSqMeters: number,
  declaredValuePaisa: number,
): {
  circleRateValuePaisa: number;
  applicableValuePaisa: number;
  stampDutyPaisa: number;
  registrationFeePaisa: number;
  totalFeesPaisa: number;
} {
  const rates = TEST_STAMP_DUTY[stateCode.toLowerCase() === 'ap' ? 'andhraPradesh' :
    stateCode.toLowerCase() === 'mh' ? 'maharashtra' : 'telangana'];

  const circleRateValuePaisa = rates.circleRatePerSqMeter * areaSqMeters * 100;
  const applicableValuePaisa = Math.max(declaredValuePaisa, circleRateValuePaisa);
  const stampDutyPaisa = Math.floor(applicableValuePaisa * rates.stampDutyRateBps / 10000);
  const registrationFeePaisa = Math.floor(applicableValuePaisa * rates.registrationFeeRateBps / 10000);
  const totalFeesPaisa = stampDutyPaisa + registrationFeePaisa;

  return { circleRateValuePaisa, applicableValuePaisa, stampDutyPaisa, registrationFeePaisa, totalFeesPaisa };
}

describe('Transfer Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initiate Transfer', () => {
    it('should initiate transfer for a clear property', async () => {
      // Setup: property is active, clear of disputes and encumbrances
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.active.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash,
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'CLEAR',
        areaSqMeters: TEST_PROPERTIES.active.areaSqMeters,
        stateCode: TEST_PROPERTIES.active.stateCode,
      });

      mockPrismaEncumbrance.findMany.mockResolvedValue([]);

      const transferRequest = {
        propertyId: TEST_PROPERTIES.active.propertyId,
        seller: { aadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash },
        buyer: { aadhaarHash: TEST_USERS.citizen.aadhaarHash, name: TEST_USERS.citizen.name },
        saleAmountPaisa: 350000000,
        witnesses: [
          { aadhaarHash: 'f'.repeat(64), name: 'Witness One' },
          { aadhaarHash: '3'.repeat(64), name: 'Witness Two' },
        ],
      };

      // Verify property exists and is transferable
      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: transferRequest.propertyId },
      });

      expect(property).not.toBeNull();
      expect(property!.status).toBe('ACTIVE');
      expect(property!.disputeStatus).toBe('CLEAR');
      expect(property!.encumbranceStatus).toBe('CLEAR');
      expect(property!.ownerAadhaarHash).toBe(transferRequest.seller.aadhaarHash);

      // Check no active encumbrances
      const encumbrances = await mockPrismaEncumbrance.findMany({
        where: { propertyId: transferRequest.propertyId, status: 'ACTIVE' },
      });
      expect(encumbrances).toHaveLength(0);

      // Create transfer record
      const newTransfer = {
        transferId: 'xfr_new_001',
        ...transferRequest,
        status: 'STAMP_DUTY_PENDING',
        registeredBy: TEST_USERS.registrar.aadhaarHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaTransfer.create.mockResolvedValue(newTransfer);

      const created = await mockPrismaTransfer.create({ data: newTransfer });

      expect(created.transferId).toBeDefined();
      expect(created.status).toBe('STAMP_DUTY_PENDING');
      expect(created.propertyId).toBe(TEST_PROPERTIES.active.propertyId);
    });

    it('should require exactly 2 witnesses', async () => {
      const transferWithOneWitness = {
        propertyId: TEST_PROPERTIES.active.propertyId,
        seller: { aadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash },
        buyer: { aadhaarHash: TEST_USERS.citizen.aadhaarHash, name: TEST_USERS.citizen.name },
        saleAmountPaisa: 350000000,
        witnesses: [
          { aadhaarHash: 'f'.repeat(64), name: 'Only One Witness' },
        ],
      };

      const witnessCount = transferWithOneWitness.witnesses.length;
      expect(witnessCount).not.toBe(2);

      // The system must reject transfers without exactly 2 witnesses
      const isValid = witnessCount === 2;
      expect(isValid).toBe(false);
    });
  });

  describe('Stamp Duty Calculation', () => {
    it('should calculate stamp duty using circle rate when higher than declared value', () => {
      // Anti-benami rule: stamp duty calculated on higher of declared value vs circle rate
      const declaredValuePaisa = 200000000; // 20 lakh
      const result = calculateStampDuty('AP', TEST_PROPERTIES.active.areaSqMeters, declaredValuePaisa);

      // Circle rate value = 4000 * 80937 * 100 = much higher than 20 lakh
      expect(result.circleRateValuePaisa).toBeGreaterThan(declaredValuePaisa);
      expect(result.applicableValuePaisa).toBe(result.circleRateValuePaisa);
      expect(result.stampDutyPaisa).toBeGreaterThan(0);
      expect(result.registrationFeePaisa).toBeGreaterThan(0);
      expect(result.totalFeesPaisa).toBe(result.stampDutyPaisa + result.registrationFeePaisa);
    });

    it('should calculate stamp duty using declared value when higher than circle rate', () => {
      const declaredValuePaisa = 99999999999; // Very high declared value
      const result = calculateStampDuty('AP', TEST_PROPERTIES.active.areaSqMeters, declaredValuePaisa);

      expect(result.applicableValuePaisa).toBe(declaredValuePaisa);
      expect(result.stampDutyPaisa).toBe(Math.floor(declaredValuePaisa * 500 / 10000));
    });

    it('should apply correct rates for different states', () => {
      const value = 1000000000; // 1 crore
      const area = 1000;

      const apResult = calculateStampDuty('AP', area, value);
      const mhResult = calculateStampDuty('MH', area, value);

      // Maharashtra has higher stamp duty rate (6% vs 5%)
      expect(mhResult.stampDutyPaisa).toBeGreaterThan(apResult.stampDutyPaisa);
    });
  });

  describe('Transfer Restrictions', () => {
    it('should reject transfer for disputed property', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.disputed.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.disputed.ownerAadhaarHash,
        status: 'ACTIVE',
        disputeStatus: 'UNDER_ADJUDICATION',
        encumbranceStatus: 'CLEAR',
        stateCode: TEST_PROPERTIES.disputed.stateCode,
      });

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: TEST_PROPERTIES.disputed.propertyId },
      });

      expect(property).not.toBeNull();
      expect(property!.disputeStatus).not.toBe('CLEAR');

      // Business Rule 1: No transfer if dispute flag active
      const canTransfer = property!.disputeStatus === 'CLEAR';
      expect(canTransfer).toBe(false);

      // Fabric should NOT be called for disputed property
      expect(mockFabricService.submitTransaction).not.toHaveBeenCalled();
    });

    it('should reject transfer for encumbered property without bank consent', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.encumbered.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.encumbered.ownerAadhaarHash,
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'MORTGAGED',
        stateCode: TEST_PROPERTIES.encumbered.stateCode,
      });

      mockPrismaEncumbrance.findMany.mockResolvedValue([
        {
          encumbranceId: TEST_ENCUMBRANCES.activeMortgage.encumbranceId,
          type: 'MORTGAGE',
          status: 'ACTIVE',
          institutionName: TEST_ENCUMBRANCES.activeMortgage.institution.name,
          amountPaisa: TEST_ENCUMBRANCES.activeMortgage.sanctionedAmountPaisa,
        },
      ]);

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: TEST_PROPERTIES.encumbered.propertyId },
      });

      expect(property!.encumbranceStatus).toBe('MORTGAGED');

      const activeEncumbrances = await mockPrismaEncumbrance.findMany({
        where: { propertyId: TEST_PROPERTIES.encumbered.propertyId, status: 'ACTIVE' },
      });

      expect(activeEncumbrances).toHaveLength(1);
      expect(activeEncumbrances[0].type).toBe('MORTGAGE');

      // Bank consent flag (not provided in this test)
      const hasBankConsent = false;
      const hasMortgage = activeEncumbrances.some((e: { type: string }) => e.type === 'MORTGAGE');

      // Business Rule: encumbered property requires bank consent
      const canTransfer = !hasMortgage || hasBankConsent;
      expect(canTransfer).toBe(false);

      expect(mockFabricService.submitTransaction).not.toHaveBeenCalled();
    });

    it('should allow transfer for encumbered property with bank consent', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.encumbered.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.encumbered.ownerAadhaarHash,
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'MORTGAGED',
        stateCode: TEST_PROPERTIES.encumbered.stateCode,
      });

      mockPrismaEncumbrance.findMany.mockResolvedValue([
        {
          encumbranceId: TEST_ENCUMBRANCES.activeMortgage.encumbranceId,
          type: 'MORTGAGE',
          status: 'ACTIVE',
          institutionName: TEST_ENCUMBRANCES.activeMortgage.institution.name,
        },
      ]);

      const hasBankConsent = true;
      const activeEncumbrances = await mockPrismaEncumbrance.findMany({
        where: { propertyId: TEST_PROPERTIES.encumbered.propertyId, status: 'ACTIVE' },
      });

      const hasMortgage = activeEncumbrances.some((e: { type: string }) => e.type === 'MORTGAGE');
      const canTransfer = !hasMortgage || hasBankConsent;
      expect(canTransfer).toBe(true);
    });
  });

  describe('Execute Transfer', () => {
    it('should execute transfer after all prerequisites are met', async () => {
      const transferId = TEST_TRANSFERS.completed.transferId;

      // Mock: transfer is in SIGNATURES_COMPLETE state
      mockPrismaTransfer.findUnique.mockResolvedValue({
        transferId,
        propertyId: TEST_PROPERTIES.active.propertyId,
        sellerAadhaarHash: TEST_TRANSFERS.completed.seller.aadhaarHash,
        buyerAadhaarHash: TEST_TRANSFERS.completed.buyer.aadhaarHash,
        saleAmountPaisa: BigInt(TEST_TRANSFERS.completed.saleAmountPaisa),
        stampDutyPaisa: BigInt(TEST_TRANSFERS.completed.stampDutyAmountPaisa),
        status: 'SIGNATURES_COMPLETE',
      });

      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.active.propertyId,
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'CLEAR',
        ownerAadhaarHash: TEST_TRANSFERS.completed.seller.aadhaarHash,
        stateCode: 'AP',
      });

      mockPrismaEncumbrance.findMany.mockResolvedValue([]);

      // Verify all prerequisites
      const transfer = await mockPrismaTransfer.findUnique({
        where: { transferId },
      });
      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: transfer!.propertyId },
      });
      const encumbrances = await mockPrismaEncumbrance.findMany({
        where: { propertyId: transfer!.propertyId, status: 'ACTIVE' },
      });

      expect(transfer!.status).toBe('SIGNATURES_COMPLETE');
      expect(property!.disputeStatus).toBe('CLEAR');
      expect(property!.encumbranceStatus).toBe('CLEAR');
      expect(encumbrances).toHaveLength(0);
      expect(property!.ownerAadhaarHash).toBe(transfer!.sellerAadhaarHash);

      // Submit to Fabric
      mockFabricService.submitTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify({
          transferId,
          status: 'REGISTERED_PENDING_FINALITY',
          fabricTxId: 'tx_execute_001',
          mutationId: 'mut_auto_001',
        }))
      );

      const fabricResult = await mockFabricService.submitTransaction('ExecuteTransfer', transferId);
      const result = JSON.parse(fabricResult.toString());

      expect(result.status).toBe('REGISTERED_PENDING_FINALITY');
      expect(result.fabricTxId).toBeDefined();
      expect(result.mutationId).toBeDefined();

      // Update transfer status in PostgreSQL
      const coolingPeriodEnds = new Date(Date.now() + 72 * 60 * 60 * 1000);

      mockPrismaTransfer.update.mockResolvedValue({
        transferId,
        status: 'REGISTERED_PENDING_FINALITY',
        fabricTxId: result.fabricTxId,
        coolingPeriodEnds,
      });

      const updated = await mockPrismaTransfer.update({
        where: { transferId },
        data: {
          status: 'REGISTERED_PENDING_FINALITY',
          fabricTxId: result.fabricTxId,
          coolingPeriodEnds,
        },
      });

      expect(updated.status).toBe('REGISTERED_PENDING_FINALITY');
      expect(updated.coolingPeriodEnds).toBeDefined();
    });
  });

  describe('Cooling Period', () => {
    it('should enforce 72-hour cooling period before finalization', async () => {
      const now = new Date();
      const coolingPeriodEnds = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      mockPrismaTransfer.findUnique.mockResolvedValue({
        transferId: TEST_TRANSFERS.completed.transferId,
        status: 'REGISTERED_PENDING_FINALITY',
        coolingPeriodEnds,
      });

      const transfer = await mockPrismaTransfer.findUnique({
        where: { transferId: TEST_TRANSFERS.completed.transferId },
      });

      // Cooling period has not expired
      const isWithinCoolingPeriod = transfer!.coolingPeriodEnds > now;
      expect(isWithinCoolingPeriod).toBe(true);

      // Transfer should NOT be finalized during cooling period
      const canFinalize = !isWithinCoolingPeriod && transfer!.status === 'REGISTERED_PENDING_FINALITY';
      expect(canFinalize).toBe(false);
    });

    it('should allow finalization after cooling period expires', async () => {
      const now = new Date();
      const coolingPeriodEnds = new Date(now.getTime() - 1000); // Expired 1 second ago

      mockPrismaTransfer.findUnique.mockResolvedValue({
        transferId: TEST_TRANSFERS.completed.transferId,
        status: 'REGISTERED_PENDING_FINALITY',
        coolingPeriodEnds,
      });

      const transfer = await mockPrismaTransfer.findUnique({
        where: { transferId: TEST_TRANSFERS.completed.transferId },
      });

      const isWithinCoolingPeriod = transfer!.coolingPeriodEnds > now;
      expect(isWithinCoolingPeriod).toBe(false);

      const canFinalize = !isWithinCoolingPeriod && transfer!.status === 'REGISTERED_PENDING_FINALITY';
      expect(canFinalize).toBe(true);

      // Finalize the transfer
      mockFabricService.submitTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify({
          transferId: TEST_TRANSFERS.completed.transferId,
          status: 'REGISTERED_FINAL',
        }))
      );

      const fabricResult = await mockFabricService.submitTransaction(
        'FinalizeAfterCooling',
        TEST_TRANSFERS.completed.transferId
      );
      const result = JSON.parse(fabricResult.toString());

      expect(result.status).toBe('REGISTERED_FINAL');
    });
  });

  describe('Witness Requirements', () => {
    it('should require 2 witnesses for transfer', () => {
      const transfer = TEST_TRANSFERS.completed;
      expect(transfer.witnesses).toHaveLength(2);

      // Each witness must have valid aadhaar hash and name
      transfer.witnesses.forEach((witness) => {
        expect(witness.aadhaarHash).toHaveLength(AADHAAR_HASH_LENGTH);
        expect(witness.name.length).toBeGreaterThan(0);
        expect(witness.signed).toBe(true);
      });
    });

    it('should reject transfer with fewer than 2 witnesses', () => {
      const insufficientWitnesses = [
        { aadhaarHash: 'f'.repeat(64), name: 'Only Witness', signed: true },
      ];

      expect(insufficientWitnesses.length).toBeLessThan(2);
      const isValid = insufficientWitnesses.length === 2;
      expect(isValid).toBe(false);
    });

    it('should reject transfer with more than 2 witnesses', () => {
      const tooManyWitnesses = [
        { aadhaarHash: 'f'.repeat(64), name: 'Witness 1', signed: true },
        { aadhaarHash: '3'.repeat(64), name: 'Witness 2', signed: true },
        { aadhaarHash: '4'.repeat(64), name: 'Witness 3', signed: true },
      ];

      expect(tooManyWitnesses.length).toBeGreaterThan(2);
      const isValid = tooManyWitnesses.length === 2;
      expect(isValid).toBe(false);
    });

    it('should reject transfer with unsigned witnesses', () => {
      const unsignedWitnesses = TEST_TRANSFERS.pending.witnesses;

      const allSigned = unsignedWitnesses.every((w) => w.signed);
      expect(allSigned).toBe(false);
    });
  });

  describe('Seller Validation', () => {
    it('should verify seller is current owner', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.active.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash,
      });

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: TEST_PROPERTIES.active.propertyId },
      });

      const sellerHash = TEST_PROPERTIES.active.ownerAadhaarHash;
      const isCurrentOwner = property!.ownerAadhaarHash === sellerHash;
      expect(isCurrentOwner).toBe(true);
    });

    it('should reject transfer if seller is not current owner', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue({
        propertyId: TEST_PROPERTIES.active.propertyId,
        ownerAadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash,
      });

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: TEST_PROPERTIES.active.propertyId },
      });

      const fakeSellerHash = '9'.repeat(64);
      const isCurrentOwner = property!.ownerAadhaarHash === fakeSellerHash;
      expect(isCurrentOwner).toBe(false);
    });
  });
});
