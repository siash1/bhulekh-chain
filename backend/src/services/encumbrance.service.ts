// services/encumbrance.service.ts — Encumbrance (mortgage/lien) management
// Manages adding and releasing encumbrances via Fabric + PostgreSQL

import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import fabricService from './fabric.service.js';
import { generateId, serializeBigInts, nowISO } from '../utils/helpers.js';
import {
  EncumbranceNotFoundError,
  LandNotFoundError,
  TransferInvalidStateError,
} from '../utils/errors.js';
import type { AddEncumbranceInput } from '../schemas/index.js';

const log = createServiceLogger('encumbrance-service');

class EncumbranceService {
  /**
   * Add an encumbrance (mortgage, lien, or court order) to a property.
   * Only bank officers or court officials can add encumbrances.
   */
  async addEncumbrance(
    data: AddEncumbranceInput,
    bankOfficerId: string,
  ): Promise<{ encumbranceId: string; propertyId: string; status: string }> {
    // Verify property exists
    const property = await prisma.landRecord.findUnique({
      where: { propertyId: data.propertyId },
    });

    if (!property) {
      throw new LandNotFoundError(data.propertyId);
    }

    const encumbranceId = generateId('enc');

    // Build Fabric chaincode input
    const encumbranceJson = JSON.stringify({
      docType: 'encumbranceRecord',
      encumbranceId,
      propertyId: data.propertyId,
      type: data.type,
      status: 'ACTIVE',
      institution: {
        name: data.institution.name,
        branchCode: data.institution.branchCode ?? '',
        mspId: 'BankOrgMSP',
      },
      details: {
        loanAccountNumber: data.loanAccountNumber ?? '',
        sanctionedAmount: data.amount,
        outstandingAmount: data.amount,
        interestRate: 0,
        startDate: data.startDate,
        endDate: data.endDate ?? '',
      },
      courtOrderRef: '',
      createdAt: nowISO(),
      createdBy: bankOfficerId,
    });

    // Submit to Fabric
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'AddEncumbrance',
          encumbranceJson,
        );
        log.info({ encumbranceId, propertyId: data.propertyId }, 'Encumbrance added on Fabric');
      } catch (err) {
        log.error({ err, encumbranceId }, 'Failed to add encumbrance on Fabric');
        throw err;
      }
    } else {
      log.warn({ encumbranceId }, 'Fabric not connected, skipping chaincode (dev mode)');
    }

    // Sync to PostgreSQL
    await prisma.encumbrance.create({
      data: {
        encumbranceId,
        propertyId: data.propertyId,
        type: data.type,
        status: 'ACTIVE',
        institutionName: data.institution.name,
        branchCode: data.institution.branchCode,
        loanAccountNumber: data.loanAccountNumber,
        amountPaisa: BigInt(data.amount),
        outstandingPaisa: BigInt(data.amount),
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        createdBy: bankOfficerId,
      },
    });

    // Update property encumbrance status
    await prisma.landRecord.update({
      where: { propertyId: data.propertyId },
      data: { encumbranceStatus: 'ENCUMBERED' },
    });

    log.info(
      { encumbranceId, propertyId: data.propertyId, type: data.type, institution: data.institution.name },
      'Encumbrance added and synced',
    );

    return {
      encumbranceId,
      propertyId: data.propertyId,
      status: 'ACTIVE',
    };
  }

  /**
   * Release an encumbrance (e.g., loan fully paid).
   * Only the institution that created it (or court) can release.
   */
  async releaseEncumbrance(
    encumbranceId: string,
    _bankOfficerId: string,
  ): Promise<{ encumbranceId: string; status: string }> {
    const encumbrance = await prisma.encumbrance.findUnique({
      where: { encumbranceId },
    });

    if (!encumbrance) {
      throw new EncumbranceNotFoundError(encumbranceId);
    }

    if (encumbrance.status !== 'ACTIVE') {
      throw new TransferInvalidStateError(encumbranceId, 'ACTIVE', encumbrance.status);
    }

    // Release on Fabric
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'ReleaseEncumbrance',
          encumbranceId,
        );
        log.info({ encumbranceId }, 'Encumbrance released on Fabric');
      } catch (err) {
        log.error({ err, encumbranceId }, 'Failed to release encumbrance on Fabric');
        throw err;
      }
    } else {
      log.warn({ encumbranceId }, 'Fabric not connected, skipping chaincode (dev mode)');
    }

    // Update PostgreSQL
    await prisma.encumbrance.update({
      where: { encumbranceId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    // Check if property has any remaining active encumbrances
    const remainingActive = await prisma.encumbrance.count({
      where: {
        propertyId: encumbrance.propertyId,
        status: 'ACTIVE',
        encumbranceId: { not: encumbranceId },
      },
    });

    if (remainingActive === 0) {
      await prisma.landRecord.update({
        where: { propertyId: encumbrance.propertyId },
        data: { encumbranceStatus: 'CLEAR' },
      });
    }

    log.info(
      { encumbranceId, propertyId: encumbrance.propertyId, remainingActive },
      'Encumbrance released',
    );

    return { encumbranceId, status: 'RELEASED' };
  }

  /**
   * Get all encumbrances for a property.
   */
  async getEncumbrances(propertyId: string) {
    // Verify property exists
    const property = await prisma.landRecord.findUnique({
      where: { propertyId },
      select: { propertyId: true },
    });

    if (!property) {
      throw new LandNotFoundError(propertyId);
    }

    const encumbrances = await prisma.encumbrance.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });

    return serializeBigInts(encumbrances);
  }
}

export const encumbranceService = new EncumbranceService();
export default encumbranceService;
