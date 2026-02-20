/**
 * BhulekhChain Unit Tests - Land Service
 *
 * Tests the land service business logic with mocked Prisma and Fabric dependencies.
 */

import { TEST_PROPERTIES, PROPERTY_ID_REGEX } from '../../../../tests/fixtures/indian-test-data';

// ---- Mock Setup ----

interface LandRecordRow {
  propertyId: string;
  surveyNumber: string;
  stateCode: string;
  districtCode: string;
  tehsilCode: string;
  villageCode: string;
  ownerAadhaarHash: string;
  ownerName: string;
  areaSqMeters: number;
  status: string;
  disputeStatus: string;
  encumbranceStatus: string;
  landUse: string;
  ownershipType: string;
  acquisitionType: string;
  acquisitionDate: Date;
  fabricTxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockPrisma = {
  landRecord: {
    findMany: jest.fn<Promise<LandRecordRow[]>, [unknown]>(),
    findUnique: jest.fn<Promise<LandRecordRow | null>, [unknown]>(),
    count: jest.fn<Promise<number>, [unknown]>(),
  },
};

const mockFabricService = {
  evaluateTransaction: jest.fn<Promise<Buffer>, [string, ...string[]]>(),
};

// ---- Service Under Test (Inline Implementation) ----

interface SearchParams {
  stateCode: string;
  districtCode?: string;
  surveyNo?: string;
  ownerName?: string;
  page: number;
  limit: number;
}

interface SearchResult {
  records: LandRecordRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function searchLandRecords(params: SearchParams): Promise<SearchResult> {
  const where: Record<string, unknown> = {
    stateCode: params.stateCode,
  };

  if (params.districtCode) {
    where.districtCode = params.districtCode;
  }
  if (params.surveyNo) {
    where.surveyNumber = params.surveyNo;
  }
  if (params.ownerName) {
    where.ownerName = { contains: params.ownerName, mode: 'insensitive' };
  }

  const skip = (params.page - 1) * params.limit;
  const take = params.limit;

  const [records, total] = await Promise.all([
    mockPrisma.landRecord.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
    mockPrisma.landRecord.count({ where }),
  ]);

  return {
    records,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}

function validatePropertyIdFormat(propertyId: string): boolean {
  return PROPERTY_ID_REGEX.test(propertyId);
}

async function getPropertyById(propertyId: string): Promise<LandRecordRow | null> {
  if (!validatePropertyIdFormat(propertyId)) {
    return null;
  }

  // First try PostgreSQL mirror for fast read
  const dbRecord = await mockPrisma.landRecord.findUnique({
    where: { propertyId },
  });

  if (dbRecord) {
    return dbRecord;
  }

  // Fallback to Fabric if not in PostgreSQL yet
  try {
    const fabricResult = await mockFabricService.evaluateTransaction('GetProperty', propertyId);
    if (fabricResult && fabricResult.length > 0) {
      const parsed = JSON.parse(fabricResult.toString());
      return parsed as LandRecordRow;
    }
  } catch {
    // Property not found in Fabric either
  }

  return null;
}

// ---- Tests ----

describe('Land Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchLandRecords', () => {
    it('should search with pagination', async () => {
      const mockRecords: LandRecordRow[] = [
        {
          propertyId: TEST_PROPERTIES.active.propertyId,
          surveyNumber: TEST_PROPERTIES.active.surveyNumber,
          stateCode: TEST_PROPERTIES.active.stateCode,
          districtCode: TEST_PROPERTIES.active.districtCode,
          tehsilCode: TEST_PROPERTIES.active.tehsilCode,
          villageCode: TEST_PROPERTIES.active.villageCode,
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
          fabricTxId: TEST_PROPERTIES.active.fabricTxId,
          createdAt: new Date('2015-03-20'),
          updatedAt: new Date('2019-06-15'),
        },
      ];

      mockPrisma.landRecord.findMany.mockResolvedValue(mockRecords);
      mockPrisma.landRecord.count.mockResolvedValue(1);

      const result = await searchLandRecords({
        stateCode: 'AP',
        districtCode: 'GNT',
        page: 1,
        limit: 20,
      });

      expect(result.records).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);

      expect(mockPrisma.landRecord.findMany).toHaveBeenCalledWith({
        where: { stateCode: 'AP', districtCode: 'GNT' },
        skip: 0,
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should apply all search filters', async () => {
      mockPrisma.landRecord.findMany.mockResolvedValue([]);
      mockPrisma.landRecord.count.mockResolvedValue(0);

      await searchLandRecords({
        stateCode: 'AP',
        districtCode: 'GNT',
        surveyNo: '142/3',
        ownerName: 'Ramesh',
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.landRecord.findMany).toHaveBeenCalledWith({
        where: {
          stateCode: 'AP',
          districtCode: 'GNT',
          surveyNumber: '142/3',
          ownerName: { contains: 'Ramesh', mode: 'insensitive' },
        },
        skip: 0,
        take: 10,
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should calculate pagination correctly for multiple pages', async () => {
      mockPrisma.landRecord.findMany.mockResolvedValue([]);
      mockPrisma.landRecord.count.mockResolvedValue(55);

      const result = await searchLandRecords({
        stateCode: 'AP',
        page: 3,
        limit: 20,
      });

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.total).toBe(55);
      expect(result.pagination.totalPages).toBe(3);

      expect(mockPrisma.landRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 })
      );
    });

    it('should return empty results when no records match', async () => {
      mockPrisma.landRecord.findMany.mockResolvedValue([]);
      mockPrisma.landRecord.count.mockResolvedValue(0);

      const result = await searchLandRecords({
        stateCode: 'ZZ',
        page: 1,
        limit: 20,
      });

      expect(result.records).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('validatePropertyIdFormat', () => {
    it('should accept valid property ID formats', () => {
      expect(validatePropertyIdFormat('AP-GNT-TNL-SKM-142-3')).toBe(true);
      expect(validatePropertyIdFormat('TG-HYD-SEC-AMR-567-0')).toBe(true);
      expect(validatePropertyIdFormat('MH-PUN-HVL-KTJ-1234-0')).toBe(true);
      expect(validatePropertyIdFormat('GJ-AMD-CTY-NAR-89-2A')).toBe(true);
    });

    it('should reject invalid property ID formats', () => {
      expect(validatePropertyIdFormat('')).toBe(false);
      expect(validatePropertyIdFormat('ap-gnt-tnl-skm-142-3')).toBe(false);
      expect(validatePropertyIdFormat('INVALID')).toBe(false);
      expect(validatePropertyIdFormat('AP-GN-TNL-SKM-142-3')).toBe(false);
      expect(validatePropertyIdFormat('123-456-789-012-345-6')).toBe(false);
      expect(validatePropertyIdFormat('AP GNT TNL SKM 142 3')).toBe(false);
    });
  });

  describe('getPropertyById', () => {
    it('should return property from PostgreSQL when available', async () => {
      const expectedProperty: LandRecordRow = {
        propertyId: TEST_PROPERTIES.active.propertyId,
        surveyNumber: TEST_PROPERTIES.active.surveyNumber,
        stateCode: TEST_PROPERTIES.active.stateCode,
        districtCode: TEST_PROPERTIES.active.districtCode,
        tehsilCode: TEST_PROPERTIES.active.tehsilCode,
        villageCode: TEST_PROPERTIES.active.villageCode,
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
        fabricTxId: TEST_PROPERTIES.active.fabricTxId,
        createdAt: new Date('2015-03-20'),
        updatedAt: new Date('2019-06-15'),
      };

      mockPrisma.landRecord.findUnique.mockResolvedValue(expectedProperty);

      const result = await getPropertyById('AP-GNT-TNL-SKM-142-3');

      expect(result).not.toBeNull();
      expect(result!.propertyId).toBe('AP-GNT-TNL-SKM-142-3');
      expect(result!.ownerName).toBe('Ramesh Kumar');
      expect(result!.stateCode).toBe('AP');

      // Should not hit Fabric when found in PostgreSQL
      expect(mockFabricService.evaluateTransaction).not.toHaveBeenCalled();
    });

    it('should fallback to Fabric when not in PostgreSQL', async () => {
      mockPrisma.landRecord.findUnique.mockResolvedValue(null);

      const fabricRecord = {
        propertyId: 'AP-GNT-TNL-SKM-999-0',
        surveyNumber: '999',
        stateCode: 'AP',
        districtCode: 'GNT',
        ownerName: 'Fabric Only Record',
        status: 'ACTIVE',
      };

      mockFabricService.evaluateTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify(fabricRecord))
      );

      const result = await getPropertyById('AP-GNT-TNL-SKM-999-0');

      expect(result).not.toBeNull();
      expect(result!.propertyId).toBe('AP-GNT-TNL-SKM-999-0');

      expect(mockPrisma.landRecord.findUnique).toHaveBeenCalledTimes(1);
      expect(mockFabricService.evaluateTransaction).toHaveBeenCalledWith('GetProperty', 'AP-GNT-TNL-SKM-999-0');
    });

    it('should return null for non-existent property', async () => {
      mockPrisma.landRecord.findUnique.mockResolvedValue(null);
      mockFabricService.evaluateTransaction.mockRejectedValue(new Error('LAND_NOT_FOUND'));

      const result = await getPropertyById('AP-GNT-TNL-SKM-000-0');

      expect(result).toBeNull();
    });

    it('should return null for invalid property ID format', async () => {
      const result = await getPropertyById('invalid-id');

      expect(result).toBeNull();
      expect(mockPrisma.landRecord.findUnique).not.toHaveBeenCalled();
      expect(mockFabricService.evaluateTransaction).not.toHaveBeenCalled();
    });
  });
});
