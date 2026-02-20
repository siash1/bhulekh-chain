// services/land.service.ts — Land record CRUD operations
// Reads from Fabric (primary) with PostgreSQL fallback for search

import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import fabricService from './fabric.service.js';
import type { LandRecord } from '../types/index.js';
import type { LandSearchInput } from '../schemas/index.js';
import { LandNotFoundError } from '../utils/errors.js';
import { serializeBigInts } from '../utils/helpers.js';

const log = createServiceLogger('land-service');

class LandService {
  /**
   * Search land records via PostgreSQL (Prisma).
   * Supports filtering by survey number, district, owner name, etc.
   * Results are paginated.
   */
  async searchRecords(query: LandSearchInput) {
    const { page, limit, stateCode, district, tehsil, village, surveyNo, ownerName } = query;
    const skip = (page - 1) * limit;

    // Build Prisma where clause dynamically
    const where: Record<string, unknown> = {};

    if (stateCode) where['stateCode'] = stateCode;
    if (district) where['districtCode'] = district;
    if (tehsil) where['tehsilCode'] = tehsil;
    if (village) where['villageCode'] = village;
    if (surveyNo) where['surveyNumber'] = surveyNo;

    if (ownerName) {
      where['ownerName'] = {
        contains: ownerName,
        mode: 'insensitive',
      };
    }

    const [records, total] = await Promise.all([
      prisma.landRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          propertyId: true,
          surveyNumber: true,
          stateCode: true,
          districtCode: true,
          tehsilCode: true,
          villageCode: true,
          areaSqMeters: true,
          areaLocalValue: true,
          areaLocalUnit: true,
          ownerAadhaarHash: true,
          ownerName: true,
          ownershipType: true,
          acquisitionType: true,
          acquisitionDate: true,
          landUse: true,
          status: true,
          disputeStatus: true,
          encumbranceStatus: true,
          fabricTxId: true,
          algorandAsaId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.landRecord.count({ where }),
    ]);

    log.debug({ query, total, returned: records.length }, 'Land search completed');

    return {
      records: serializeBigInts(records),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single property by ID.
   * Primary source: Fabric chaincode (GetProperty).
   * Fallback: PostgreSQL if Fabric is unavailable.
   */
  async getProperty(propertyId: string): Promise<LandRecord | Record<string, unknown>> {
    // Try Fabric first
    if (fabricService.isConnected()) {
      try {
        const result = await fabricService.evaluateTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'GetProperty',
          propertyId,
        );

        if (result && result !== '') {
          const record = JSON.parse(result) as LandRecord;
          log.debug({ propertyId }, 'Property fetched from Fabric');
          return record;
        }
      } catch (err) {
        log.warn({ err, propertyId }, 'Fabric query failed, falling back to PostgreSQL');
      }
    }

    // Fallback to PostgreSQL
    const record = await prisma.landRecord.findUnique({
      where: { propertyId },
      include: {
        encumbrances: {
          where: { status: 'ACTIVE' },
        },
        disputes: {
          where: {
            status: {
              notIn: ['RESOLVED_IN_FAVOR', 'RESOLVED_AGAINST', 'SETTLED'],
            },
          },
        },
      },
    });

    if (!record) {
      throw new LandNotFoundError(propertyId);
    }

    log.debug({ propertyId }, 'Property fetched from PostgreSQL (fallback)');
    return serializeBigInts(record);
  }

  /**
   * Get the ownership history (provenance chain) of a property.
   * Primary source: Fabric GetPropertyHistory.
   * Fallback: PostgreSQL ownership_history table.
   */
  async getPropertyHistory(propertyId: string) {
    // Verify property exists
    const exists = await prisma.landRecord.findUnique({
      where: { propertyId },
      select: { propertyId: true },
    });

    if (!exists) {
      throw new LandNotFoundError(propertyId);
    }

    // Try Fabric first for full ledger history
    if (fabricService.isConnected()) {
      try {
        const result = await fabricService.evaluateTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'GetPropertyHistory',
          propertyId,
        );

        if (result && result !== '' && result !== '[]') {
          const history = JSON.parse(result) as Array<{
            txId: string;
            timestamp: string;
            isDelete: boolean;
            record: LandRecord | null;
          }>;

          log.debug({ propertyId, entries: history.length }, 'Property history fetched from Fabric');
          return {
            propertyId,
            chain: history
              .filter((entry) => !entry.isDelete && entry.record)
              .map((entry, idx) => ({
                sequence: idx + 1,
                owner: {
                  name: entry.record!.currentOwner.owners[0]?.name ?? 'Unknown',
                  aadhaarHash: entry.record!.currentOwner.owners[0]?.aadhaarHash ?? null,
                },
                acquisitionType: entry.record!.currentOwner.acquisitionType,
                date: entry.record!.currentOwner.acquisitionDate,
                fabricTxId: entry.txId,
              })),
          };
        }
      } catch (err) {
        log.warn({ err, propertyId }, 'Fabric history query failed, falling back to PostgreSQL');
      }
    }

    // Fallback to PostgreSQL
    const history = await prisma.ownershipHistory.findMany({
      where: { propertyId },
      orderBy: { sequenceNumber: 'asc' },
    });

    return {
      propertyId,
      chain: serializeBigInts(
        history.map((entry) => ({
          sequence: entry.sequenceNumber,
          owner: {
            name: entry.ownerName,
            aadhaarHash: entry.ownerAadhaarHash,
          },
          acquisitionType: entry.acquisitionType,
          date: entry.acquisitionDate.toISOString().slice(0, 10),
          saleAmount: entry.saleAmountPaisa ? Number(entry.saleAmountPaisa) : undefined,
          stampDutyPaid: entry.stampDutyPaisa ? Number(entry.stampDutyPaisa) : undefined,
          fabricTxId: entry.fabricTxId,
          algorandTxId: entry.algorandTxId,
          documentHash: entry.documentCid,
        })),
      ),
    };
  }

  /**
   * Register a new property on the Fabric ledger and sync to PostgreSQL.
   * Only registrars can register new properties.
   */
  async registerProperty(
    data: {
      propertyId: string;
      surveyNumber: string;
      subSurveyNumber?: string;
      location: {
        stateCode: string;
        stateName: string;
        districtCode: string;
        districtName: string;
        tehsilCode: string;
        tehsilName: string;
        villageCode: string;
        villageName: string;
        pinCode: string;
      };
      area: {
        value: number;
        unit: string;
        localValue: number;
        localUnit: string;
      };
      ownerAadhaarHash: string;
      ownerName: string;
      ownerFatherName?: string;
      ownershipType: string;
      acquisitionType: string;
      acquisitionDate: string;
      landUse: string;
      landClassification?: string;
      registrationNumber?: string;
      subRegistrarOffice?: string;
    },
    registrarId: string,
  ): Promise<{ propertyId: string; fabricTxId: string }> {
    // Build the full LandRecord object for Fabric chaincode
    const landRecordJson = JSON.stringify({
      docType: 'landRecord',
      propertyId: data.propertyId,
      surveyNumber: data.surveyNumber,
      subSurveyNumber: data.subSurveyNumber ?? '',
      location: data.location,
      area: data.area,
      boundaries: { north: '', south: '', east: '', west: '', geoJson: null },
      currentOwner: {
        ownerType: 'INDIVIDUAL',
        owners: [
          {
            aadhaarHash: data.ownerAadhaarHash,
            name: data.ownerName,
            fatherName: data.ownerFatherName ?? '',
            sharePercentage: 100,
            isMinor: false,
          },
        ],
        ownershipType: data.ownershipType,
        acquisitionType: data.acquisitionType,
        acquisitionDate: data.acquisitionDate,
        acquisitionDocumentHash: '',
      },
      landUse: data.landUse,
      landClassification: data.landClassification ?? '',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'CLEAR',
      coolingPeriod: { active: false, expiresAt: '' },
      taxInfo: { annualLandRevenue: 0, lastPaidDate: '', paidUpToYear: '' },
      registrationInfo: {
        registrationNumber: data.registrationNumber ?? '',
        bookNumber: '',
        subRegistrarOffice: data.subRegistrarOffice ?? '',
        registrationDate: data.acquisitionDate,
      },
      algorandInfo: { asaId: 0, lastAnchorTxId: '', lastAnchoredAt: '' },
      polygonInfo: { tokenized: false, erc721TokenId: null, contractAddress: null },
      provenance: { previousPropertyId: '', splitFrom: '', mergedFrom: [], sequence: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: registrarId,
      updatedBy: registrarId,
    });

    let fabricTxId = '';

    // Submit to Fabric chaincode
    if (fabricService.isConnected()) {
      try {
        const result = await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'RegisterProperty',
          landRecordJson,
        );
        fabricTxId = result || `fabric_tx_${Date.now()}`;
        log.info({ propertyId: data.propertyId, fabricTxId }, 'Property registered on Fabric');
      } catch (err) {
        log.error({ err, propertyId: data.propertyId }, 'Failed to register on Fabric');
        throw err;
      }
    } else {
      fabricTxId = `dev_tx_${Date.now()}`;
      log.warn({ propertyId: data.propertyId }, 'Fabric not connected, skipping chaincode (dev mode)');
    }

    // Sync to PostgreSQL
    await prisma.landRecord.create({
      data: {
        propertyId: data.propertyId,
        surveyNumber: data.surveyNumber,
        subSurveyNumber: data.subSurveyNumber ?? '',
        stateCode: data.location.stateCode,
        districtCode: data.location.districtCode,
        tehsilCode: data.location.tehsilCode,
        villageCode: data.location.villageCode,
        pinCode: data.location.pinCode,
        areaSqMeters: data.area.value,
        areaLocalValue: data.area.localValue,
        areaLocalUnit: data.area.localUnit,
        ownerAadhaarHash: data.ownerAadhaarHash,
        ownerName: data.ownerName,
        ownerFatherName: data.ownerFatherName,
        ownershipType: data.ownershipType,
        acquisitionType: data.acquisitionType,
        acquisitionDate: new Date(data.acquisitionDate),
        landUse: data.landUse,
        landClassification: data.landClassification,
        status: 'ACTIVE',
        disputeStatus: 'CLEAR',
        encumbranceStatus: 'CLEAR',
        registrationNumber: data.registrationNumber,
        subRegistrarOffice: data.subRegistrarOffice,
        registrationDate: new Date(data.acquisitionDate),
        fabricTxId,
        createdBy: registrarId,
        updatedBy: registrarId,
      },
    });

    // Create initial ownership history entry
    await prisma.ownershipHistory.create({
      data: {
        propertyId: data.propertyId,
        sequenceNumber: 1,
        ownerAadhaarHash: data.ownerAadhaarHash,
        ownerName: data.ownerName,
        acquisitionType: data.acquisitionType,
        acquisitionDate: new Date(data.acquisitionDate),
        fabricTxId,
      },
    });

    log.info({ propertyId: data.propertyId, fabricTxId }, 'Property registered and synced to PostgreSQL');

    return { propertyId: data.propertyId, fabricTxId };
  }
}

export const landService = new LandService();
export default landService;
