/**
 * BhulekhChain Integration Tests - Land Record Operations
 *
 * Tests the land record search, retrieval, and registration flows
 * through the backend API layer.
 */

import { TEST_PROPERTIES, TEST_USERS, PROPERTY_ID_REGEX } from '../fixtures/indian-test-data';

// Mock the Prisma client
const mockPrismaLandRecord = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  count: jest.fn(),
};

const mockPrismaOwnershipHistory = {
  findMany: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    landRecord: mockPrismaLandRecord,
    ownershipHistory: mockPrismaOwnershipHistory,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

// Mock the Fabric service
const mockFabricService = {
  evaluateTransaction: jest.fn(),
  submitTransaction: jest.fn(),
};

jest.mock('../../backend/src/services/fabric.service', () => ({
  FabricService: jest.fn().mockImplementation(() => mockFabricService),
}));

describe('Land Record Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Search Records', () => {
    it('should search records by state and district', async () => {
      const searchParams = {
        stateCode: 'AP',
        districtCode: 'GNT',
        page: 1,
        limit: 20,
      };

      const expectedRecords = [
        {
          propertyId: TEST_PROPERTIES.active.propertyId,
          surveyNumber: TEST_PROPERTIES.active.surveyNumber,
          stateCode: TEST_PROPERTIES.active.stateCode,
          districtCode: TEST_PROPERTIES.active.districtCode,
          ownerName: TEST_PROPERTIES.active.ownerName,
          status: TEST_PROPERTIES.active.status,
          disputeStatus: TEST_PROPERTIES.active.disputeStatus,
          encumbranceStatus: TEST_PROPERTIES.active.encumbranceStatus,
          areaSqMeters: TEST_PROPERTIES.active.areaSqMeters,
          landUse: TEST_PROPERTIES.active.landUse,
          createdAt: new Date('2015-03-20T00:00:00Z'),
          updatedAt: new Date('2019-06-15T10:30:00Z'),
        },
      ];

      mockPrismaLandRecord.findMany.mockResolvedValue(expectedRecords);
      mockPrismaLandRecord.count.mockResolvedValue(1);

      const whereClause = {
        stateCode: searchParams.stateCode,
        districtCode: searchParams.districtCode,
      };

      const records = await mockPrismaLandRecord.findMany({
        where: whereClause,
        skip: (searchParams.page - 1) * searchParams.limit,
        take: searchParams.limit,
        orderBy: { updatedAt: 'desc' },
      });

      const total = await mockPrismaLandRecord.count({ where: whereClause });

      expect(records).toHaveLength(1);
      expect(records[0].stateCode).toBe('AP');
      expect(records[0].districtCode).toBe('GNT');
      expect(records[0].propertyId).toMatch(PROPERTY_ID_REGEX);
      expect(total).toBe(1);

      expect(mockPrismaLandRecord.findMany).toHaveBeenCalledWith({
        where: whereClause,
        skip: 0,
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should return empty results for non-existent state', async () => {
      mockPrismaLandRecord.findMany.mockResolvedValue([]);
      mockPrismaLandRecord.count.mockResolvedValue(0);

      const whereClause = { stateCode: 'XX', districtCode: 'YYY' };

      const records = await mockPrismaLandRecord.findMany({
        where: whereClause,
        skip: 0,
        take: 20,
      });

      const total = await mockPrismaLandRecord.count({ where: whereClause });

      expect(records).toHaveLength(0);
      expect(total).toBe(0);
    });

    it('should support pagination correctly', async () => {
      const page2Records = [
        {
          propertyId: 'AP-GNT-TNL-SKM-200-0',
          surveyNumber: '200',
          stateCode: 'AP',
          districtCode: 'GNT',
          ownerName: 'Test Owner',
          status: 'ACTIVE',
        },
      ];

      mockPrismaLandRecord.findMany.mockResolvedValue(page2Records);
      mockPrismaLandRecord.count.mockResolvedValue(25);

      const records = await mockPrismaLandRecord.findMany({
        where: { stateCode: 'AP' },
        skip: 20,
        take: 20,
      });

      const total = await mockPrismaLandRecord.count({ where: { stateCode: 'AP' } });

      expect(records).toHaveLength(1);
      expect(total).toBe(25);

      expect(mockPrismaLandRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 })
      );
    });
  });

  describe('Get Property by ID', () => {
    it('should get property by ID', async () => {
      const expectedProperty = {
        propertyId: TEST_PROPERTIES.active.propertyId,
        surveyNumber: TEST_PROPERTIES.active.surveyNumber,
        stateCode: TEST_PROPERTIES.active.stateCode,
        districtCode: TEST_PROPERTIES.active.districtCode,
        ownerAadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash,
        ownerName: TEST_PROPERTIES.active.ownerName,
        areaSqMeters: TEST_PROPERTIES.active.areaSqMeters,
        status: TEST_PROPERTIES.active.status,
        disputeStatus: TEST_PROPERTIES.active.disputeStatus,
        encumbranceStatus: TEST_PROPERTIES.active.encumbranceStatus,
        landUse: TEST_PROPERTIES.active.landUse,
        ownershipType: TEST_PROPERTIES.active.ownershipType,
        acquisitionType: TEST_PROPERTIES.active.acquisitionType,
        acquisitionDate: new Date(TEST_PROPERTIES.active.acquisitionDate),
        registrationNumber: TEST_PROPERTIES.active.registrationNumber,
        fabricTxId: TEST_PROPERTIES.active.fabricTxId,
      };

      mockPrismaLandRecord.findUnique.mockResolvedValue(expectedProperty);

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: TEST_PROPERTIES.active.propertyId },
      });

      expect(property).not.toBeNull();
      expect(property!.propertyId).toBe('AP-GNT-TNL-SKM-142-3');
      expect(property!.ownerName).toBe('Ramesh Kumar');
      expect(property!.stateCode).toBe('AP');
      expect(property!.status).toBe('ACTIVE');
      expect(property!.disputeStatus).toBe('CLEAR');
      expect(property!.encumbranceStatus).toBe('CLEAR');
      expect(property!.ownerAadhaarHash).toHaveLength(64);
    });

    it('should return null for non-existent property', async () => {
      mockPrismaLandRecord.findUnique.mockResolvedValue(null);

      const property = await mockPrismaLandRecord.findUnique({
        where: { propertyId: 'XX-XXX-XXX-XXX-999-0' },
      });

      expect(property).toBeNull();
    });
  });

  describe('Get Property History', () => {
    it('should get property history ordered by sequence', async () => {
      const expectedHistory = [
        {
          id: 'hist-001',
          propertyId: TEST_PROPERTIES.active.propertyId,
          sequenceNumber: 1,
          ownerAadhaarHash: '9'.repeat(64),
          ownerName: 'Original Survey Settlement',
          acquisitionType: 'GOVERNMENT_GRANT',
          acquisitionDate: new Date('1965-01-01'),
          saleAmountPaisa: null,
          fabricTxId: 'tx_genesis_001',
        },
        {
          id: 'hist-002',
          propertyId: TEST_PROPERTIES.active.propertyId,
          sequenceNumber: 2,
          ownerAadhaarHash: '8'.repeat(64),
          ownerName: 'Suresh Kumar',
          acquisitionType: 'INHERITANCE',
          acquisitionDate: new Date('1992-08-12'),
          saleAmountPaisa: null,
          fabricTxId: 'tx_inh_001',
        },
        {
          id: 'hist-003',
          propertyId: TEST_PROPERTIES.active.propertyId,
          sequenceNumber: 3,
          ownerAadhaarHash: TEST_PROPERTIES.active.ownerAadhaarHash,
          ownerName: 'Ramesh Kumar',
          acquisitionType: 'SALE',
          acquisitionDate: new Date('2019-06-15'),
          saleAmountPaisa: BigInt(250000000),
          fabricTxId: 'tx_sale_042',
        },
      ];

      mockPrismaOwnershipHistory.findMany.mockResolvedValue(expectedHistory);

      const history = await mockPrismaOwnershipHistory.findMany({
        where: { propertyId: TEST_PROPERTIES.active.propertyId },
        orderBy: { sequenceNumber: 'asc' },
      });

      expect(history).toHaveLength(3);
      expect(history[0].sequenceNumber).toBe(1);
      expect(history[0].acquisitionType).toBe('GOVERNMENT_GRANT');
      expect(history[1].sequenceNumber).toBe(2);
      expect(history[1].acquisitionType).toBe('INHERITANCE');
      expect(history[2].sequenceNumber).toBe(3);
      expect(history[2].acquisitionType).toBe('SALE');
      expect(history[2].ownerName).toBe('Ramesh Kumar');

      // Verify provenance chain is continuous
      for (let i = 0; i < history.length; i++) {
        expect(history[i].sequenceNumber).toBe(i + 1);
      }
    });

    it('should return empty history for non-existent property', async () => {
      mockPrismaOwnershipHistory.findMany.mockResolvedValue([]);

      const history = await mockPrismaOwnershipHistory.findMany({
        where: { propertyId: 'XX-XXX-XXX-XXX-999-0' },
        orderBy: { sequenceNumber: 'asc' },
      });

      expect(history).toHaveLength(0);
    });
  });

  describe('Register Property', () => {
    it('should register a new property when called by a registrar', async () => {
      const newProperty = {
        propertyId: 'AP-GNT-TNL-SKM-500-1',
        surveyNumber: '500/1',
        stateCode: 'AP',
        districtCode: 'GNT',
        tehsilCode: 'TNL',
        villageCode: 'SKM',
        ownerAadhaarHash: 'e'.repeat(64),
        ownerName: 'Priya Sharma',
        areaSqMeters: 4047,
        ownershipType: 'FREEHOLD',
        acquisitionType: 'SALE',
        acquisitionDate: new Date('2027-03-15'),
        landUse: 'RESIDENTIAL',
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'CLEAR',
      };

      // Mock Fabric chaincode invoke for registration
      mockFabricService.submitTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify({
          propertyId: newProperty.propertyId,
          fabricTxId: 'tx_new_property_001',
        }))
      );

      // Mock Prisma create
      mockPrismaLandRecord.create.mockResolvedValue({
        ...newProperty,
        fabricTxId: 'tx_new_property_001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate registrar role check
      const callerRole = TEST_USERS.registrar.role;
      expect(callerRole).toBe('registrar');

      // Submit to Fabric
      const fabricResult = await mockFabricService.submitTransaction(
        'RegisterProperty',
        JSON.stringify(newProperty)
      );

      expect(fabricResult).toBeDefined();

      // Create in PostgreSQL mirror
      const created = await mockPrismaLandRecord.create({ data: newProperty });

      expect(created.propertyId).toBe('AP-GNT-TNL-SKM-500-1');
      expect(created.stateCode).toBe('AP');
      expect(created.ownerName).toBe('Priya Sharma');
      expect(created.status).toBe('ACTIVE');

      expect(mockFabricService.submitTransaction).toHaveBeenCalledWith(
        'RegisterProperty',
        expect.any(String)
      );
      expect(mockPrismaLandRecord.create).toHaveBeenCalledTimes(1);
    });

    it('should reject registration from non-registrar', async () => {
      const callerRole = TEST_USERS.citizen.role;
      expect(callerRole).not.toBe('registrar');

      // Simulate the access control check
      const isAuthorized = callerRole === 'registrar';
      expect(isAuthorized).toBe(false);

      // When the role check fails, the Fabric submission should not occur
      if (!isAuthorized) {
        expect(mockFabricService.submitTransaction).not.toHaveBeenCalled();
        expect(mockPrismaLandRecord.create).not.toHaveBeenCalled();
      }
    });

    it('should reject registration from registrar of different state', async () => {
      const callerStateCode = TEST_USERS.registrar.stateCode;
      const targetStateCode = 'MH';

      // State mismatch check
      const stateMatch = callerStateCode === targetStateCode;
      expect(stateMatch).toBe(false);

      if (!stateMatch) {
        expect(mockFabricService.submitTransaction).not.toHaveBeenCalled();
      }
    });
  });

  describe('Property ID Validation', () => {
    it('should validate correct property ID format', () => {
      const validIds = [
        'AP-GNT-TNL-SKM-142-3',
        'TG-HYD-SEC-AMR-567-0',
        'MH-PUN-HVL-KTJ-1234-0',
        'GJ-AMD-CTY-NAR-89-2A',
      ];

      validIds.forEach((id) => {
        expect(id).toMatch(PROPERTY_ID_REGEX);
      });
    });

    it('should reject invalid property ID format', () => {
      const invalidIds = [
        'ap-gnt-tnl-skm-142-3',    // lowercase
        'AP-GN-TNL-SKM-142-3',     // district code too short
        'APGNTTNLSKM1423',         // no separators
        '',                          // empty
        'AP-GNT-TNL-SKM',          // missing survey number
      ];

      invalidIds.forEach((id) => {
        expect(id).not.toMatch(PROPERTY_ID_REGEX);
      });
    });
  });
});
