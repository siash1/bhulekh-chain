// services/dispute.service.ts — Dispute management
// Handles filing and resolving property disputes, including property freezing

import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import fabricService from './fabric.service.js';
import { generateId, nowISO } from '../utils/helpers.js';
import { DisputeNotFoundError, LandNotFoundError, ValidationError } from '../utils/errors.js';
import type { FlagDisputeInput, ResolveDisputeInput } from '../schemas/index.js';

const log = createServiceLogger('dispute-service');

class DisputeService {
  /**
   * Flag a dispute against a property.
   * Filed by courts or authorized parties.
   * Optionally freezes the property to prevent transfers during adjudication.
   */
  async flagDispute(
    data: FlagDisputeInput,
    _courtId: string,
  ): Promise<{ disputeId: string; propertyId: string; status: string; propertyFrozen: boolean }> {
    // Verify property exists
    const property = await prisma.landRecord.findUnique({
      where: { propertyId: data.propertyId },
    });

    if (!property) {
      throw new LandNotFoundError(data.propertyId);
    }

    const disputeId = generateId('dsp');

    // Build Fabric chaincode input
    const disputeJson = JSON.stringify({
      docType: 'disputeRecord',
      disputeId,
      propertyId: data.propertyId,
      type: data.type,
      status: 'FILED',
      filedBy: { aadhaarHash: data.filedBy.aadhaarHash, name: data.filedBy.name },
      against: { aadhaarHash: data.against.aadhaarHash, name: data.against.name },
      courtDetails: {
        courtName: data.courtName,
        caseNumber: data.caseNumber,
        filedDate: new Date().toISOString().slice(0, 10),
        nextHearingDate: '',
      },
      description: data.description,
      createdAt: nowISO(),
      resolvedAt: null,
      resolution: null,
    });

    // Submit to Fabric
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'FlagDispute',
          disputeJson,
        );
        log.info({ disputeId, propertyId: data.propertyId }, 'Dispute flagged on Fabric');
      } catch (err) {
        log.error({ err, disputeId }, 'Failed to flag dispute on Fabric');
        throw err;
      }
    } else {
      log.warn({ disputeId }, 'Fabric not connected, skipping chaincode (dev mode)');
    }

    // Create dispute in PostgreSQL
    await prisma.dispute.create({
      data: {
        disputeId,
        propertyId: data.propertyId,
        type: data.type,
        status: 'FILED',
        filedByHash: data.filedBy.aadhaarHash,
        filedByName: data.filedBy.name,
        againstHash: data.against.aadhaarHash,
        againstName: data.against.name,
        courtName: data.courtName,
        caseNumber: data.caseNumber,
        description: data.description,
        filedDate: new Date(),
      },
    });

    // Determine if property should be frozen
    // OWNERSHIP_CLAIM and FRAUD disputes automatically freeze the property
    const shouldFreeze = data.type === 'OWNERSHIP_CLAIM' || data.type === 'FRAUD';
    let propertyFrozen = false;

    if (shouldFreeze) {
      await this.freezeProperty(data.propertyId, `Dispute ${disputeId} - ${data.caseNumber}`);
      propertyFrozen = true;
    }

    // Update dispute status on property
    await prisma.landRecord.update({
      where: { propertyId: data.propertyId },
      data: {
        disputeStatus: 'DISPUTED',
        status: shouldFreeze ? 'FROZEN' : property.status,
      },
    });

    log.info(
      { disputeId, propertyId: data.propertyId, type: data.type, frozen: propertyFrozen },
      'Dispute flagged',
    );

    return {
      disputeId,
      propertyId: data.propertyId,
      status: 'FILED',
      propertyFrozen,
    };
  }

  /**
   * Resolve a dispute.
   * Unfreezes the property if it was frozen due to this dispute.
   */
  async resolveDispute(
    disputeId: string,
    resolution: ResolveDisputeInput,
  ): Promise<{ disputeId: string; status: string; propertyUnfrozen: boolean }> {
    const dispute = await prisma.dispute.findUnique({ where: { disputeId } });

    if (!dispute) {
      throw new DisputeNotFoundError(disputeId);
    }

    const activeStatuses = ['FILED', 'UNDER_ADJUDICATION'];
    if (!activeStatuses.includes(dispute.status)) {
      throw new ValidationError(`Dispute ${disputeId} is already resolved with status: ${dispute.status}`);
    }

    // Resolve on Fabric
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'ResolveDispute',
          disputeId,
          resolution.resolution,
        );
        log.info({ disputeId }, 'Dispute resolved on Fabric');
      } catch (err) {
        log.error({ err, disputeId }, 'Failed to resolve dispute on Fabric');
        throw err;
      }
    }

    // Update in PostgreSQL
    await prisma.dispute.update({
      where: { disputeId },
      data: {
        status: resolution.resolution,
        resolution: resolution.resolutionDetails,
        resolvedAt: new Date(),
      },
    });

    // Check if there are any remaining active disputes on this property
    const remainingActive = await prisma.dispute.count({
      where: {
        propertyId: dispute.propertyId,
        disputeId: { not: disputeId },
        status: { in: ['FILED', 'UNDER_ADJUDICATION'] },
      },
    });

    let propertyUnfrozen = false;

    if (remainingActive === 0) {
      // No more active disputes — clear dispute status and unfreeze
      await prisma.landRecord.update({
        where: { propertyId: dispute.propertyId },
        data: {
          disputeStatus: 'CLEAR',
          status: 'ACTIVE',
        },
      });
      propertyUnfrozen = true;

      // Also unfreeze on Fabric
      if (fabricService.isConnected()) {
        try {
          await fabricService.submitTransaction(
            config.FABRIC_CHAINCODE_NAME,
            'UnfreezeProperty',
            dispute.propertyId,
            `Dispute ${disputeId} resolved`,
          );
        } catch (err) {
          log.warn({ err }, 'Failed to unfreeze property on Fabric');
        }
      }
    }

    log.info(
      { disputeId, propertyId: dispute.propertyId, resolution: resolution.resolution, propertyUnfrozen },
      'Dispute resolved',
    );

    return {
      disputeId,
      status: resolution.resolution,
      propertyUnfrozen,
    };
  }

  /**
   * Freeze a property by court order.
   * Prevents any transfers while frozen.
   */
  async freezeProperty(propertyId: string, courtOrderRef: string): Promise<void> {
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'FreezeProperty',
          propertyId,
          courtOrderRef,
        );
      } catch (err) {
        log.warn({ err, propertyId }, 'Failed to freeze property on Fabric');
      }
    }

    await prisma.landRecord.update({
      where: { propertyId },
      data: { status: 'FROZEN' },
    });

    log.info({ propertyId, courtOrderRef }, 'Property frozen');
  }

  /**
   * Unfreeze a property after court order is lifted.
   */
  async unfreezeProperty(propertyId: string, courtOrderRef: string): Promise<void> {
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'UnfreezeProperty',
          propertyId,
          courtOrderRef,
        );
      } catch (err) {
        log.warn({ err, propertyId }, 'Failed to unfreeze property on Fabric');
      }
    }

    await prisma.landRecord.update({
      where: { propertyId },
      data: { status: 'ACTIVE' },
    });

    log.info({ propertyId, courtOrderRef }, 'Property unfrozen');
  }
}

export const disputeService = new DisputeService();
export default disputeService;
