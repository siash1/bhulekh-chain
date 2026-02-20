// services/transfer.service.ts — Transfer workflow orchestration
// Manages the complete property transfer lifecycle from initiation to finalization

import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import fabricService from './fabric.service.js';
import { generateId, calculateStampDuty, serializeBigInts, coolingPeriodEnd, isCoolingPeriodExpired } from '../utils/helpers.js';
import {
  TransferNotFoundError,
  TransferInvalidStateError,
  TransferInvalidOwnerError,
  LandNotFoundError,
  LandDisputedError,
  LandEncumberedError,
  LandFrozenError,
  LandCoolingPeriodError,
  ValidationError,
} from '../utils/errors.js';
import type { InitiateTransferInput } from '../schemas/index.js';
import { Queue, type ConnectionOptions } from 'bullmq';
import redis from '../models/redis.js';

const log = createServiceLogger('transfer-service');

// BullMQ queues for async processing
const anchoringQueue = new Queue('anchoring', { connection: redis as unknown as ConnectionOptions });
const notificationQueue = new Queue('notifications', { connection: redis as unknown as ConnectionOptions });

class TransferService {
  /**
   * Initiate a property transfer.
   * Validates all preconditions, calculates stamp duty, creates transfer record.
   */
  async initiateTransfer(
    data: InitiateTransferInput,
    registrarId: string,
  ): Promise<{
    transferId: string;
    status: string;
    stampDutyBreakdown: {
      stampDutyAmount: string;
      registrationFee: string;
      surcharge: string;
      totalFees: string;
      circleRateValue: string;
      applicableValue: string;
    };
  }> {
    // Fetch property from database
    const property = await prisma.landRecord.findUnique({
      where: { propertyId: data.propertyId },
    });

    if (!property) {
      throw new LandNotFoundError(data.propertyId);
    }

    // Business rule validations
    if (property.status === 'FROZEN') {
      throw new LandFrozenError(data.propertyId);
    }

    if (property.disputeStatus !== 'CLEAR') {
      throw new LandDisputedError(data.propertyId);
    }

    if (property.encumbranceStatus !== 'CLEAR') {
      throw new LandEncumberedError(data.propertyId);
    }

    if (property.coolingPeriodEnds && !isCoolingPeriodExpired(property.coolingPeriodEnds)) {
      throw new LandCoolingPeriodError(data.propertyId, property.coolingPeriodEnds.toISOString());
    }

    // Verify seller is current owner
    if (property.ownerAadhaarHash !== data.seller.aadhaarHash) {
      throw new TransferInvalidOwnerError(data.propertyId);
    }

    // Verify seller and buyer are different
    if (data.seller.aadhaarHash === data.buyer.aadhaarHash) {
      throw new ValidationError('Seller and buyer cannot be the same person');
    }

    // Calculate stamp duty using circle rate (default 100000 paisa/sqm for dev)
    const circleRatePerSqMeter = 100000n; // TODO: Fetch from stamp-duty chaincode
    const areaSqMeters = Number(property.areaSqMeters);
    const saleAmountPaisa = BigInt(data.saleAmount);

    const stampDuty = calculateStampDuty(
      property.stateCode,
      areaSqMeters,
      saleAmountPaisa,
      circleRatePerSqMeter,
    );

    // Create transfer record
    const transferId = generateId('xfr');

    await prisma.transfer.create({
      data: {
        transferId,
        propertyId: data.propertyId,
        sellerAadhaarHash: data.seller.aadhaarHash,
        sellerName: property.ownerName,
        buyerAadhaarHash: data.buyer.aadhaarHash,
        buyerName: data.buyer.name,
        saleAmountPaisa: saleAmountPaisa,
        circleRatePaisa: stampDuty.circleRateValue,
        stampDutyPaisa: stampDuty.stampDutyAmount,
        registrationFeePaisa: stampDuty.registrationFee,
        status: 'STAMP_DUTY_PENDING',
        registeredBy: registrarId,
        saleDeedCid: data.saleDeedDocument,
      },
    });

    // Update property status
    await prisma.landRecord.update({
      where: { propertyId: data.propertyId },
      data: { status: 'TRANSFER_IN_PROGRESS' },
    });

    log.info(
      { transferId, propertyId: data.propertyId, stampDuty: stampDuty.totalFees.toString() },
      'Transfer initiated',
    );

    return {
      transferId,
      status: 'STAMP_DUTY_PENDING',
      stampDutyBreakdown: {
        stampDutyAmount: stampDuty.stampDutyAmount.toString(),
        registrationFee: stampDuty.registrationFee.toString(),
        surcharge: stampDuty.surcharge.toString(),
        totalFees: stampDuty.totalFees.toString(),
        circleRateValue: stampDuty.circleRateValue.toString(),
        applicableValue: stampDuty.applicableValue.toString(),
      },
    };
  }

  /**
   * Confirm stamp duty payment for a transfer.
   */
  async confirmStampDuty(
    transferId: string,
    receiptHash: string,
  ): Promise<{ transferId: string; status: string }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    if (transfer.status !== 'STAMP_DUTY_PENDING') {
      throw new TransferInvalidStateError(transferId, 'STAMP_DUTY_PENDING', transfer.status);
    }

    await prisma.transfer.update({
      where: { transferId },
      data: {
        status: 'STAMP_DUTY_PAID',
        stampDutyReceiptHash: receiptHash,
      },
    });

    log.info({ transferId, receiptHash }, 'Stamp duty confirmed');

    return { transferId, status: 'STAMP_DUTY_PAID' };
  }

  /**
   * Submit a digital signature (eSign) for a transfer.
   * Tracks which parties have signed and transitions status when all have signed.
   */
  async submitSignature(
    transferId: string,
    signatory: 'seller' | 'buyer' | 'witness1' | 'witness2',
    _eSignToken: string,
  ): Promise<{ transferId: string; status: string; allSigned: boolean }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    if (transfer.status !== 'STAMP_DUTY_PAID' && transfer.status !== 'SIGNATURES_PENDING') {
      throw new TransferInvalidStateError(transferId, 'STAMP_DUTY_PAID or SIGNATURES_PENDING', transfer.status);
    }

    // TODO: Verify eSign token against CCA (Controller of Certifying Authorities)
    // For now, we accept the token as valid

    // Update the appropriate signature flag
    const updateData: Record<string, unknown> = { status: 'SIGNATURES_PENDING' };
    switch (signatory) {
      case 'seller':
        updateData['sellerSigned'] = true;
        break;
      case 'buyer':
        updateData['buyerSigned'] = true;
        break;
      case 'witness1':
        updateData['witness1Signed'] = true;
        break;
      case 'witness2':
        updateData['witness2Signed'] = true;
        break;
    }

    const updated = await prisma.transfer.update({
      where: { transferId },
      data: updateData,
    });

    // Check if all parties have signed
    const allSigned = updated.sellerSigned && updated.buyerSigned && updated.witness1Signed && updated.witness2Signed;

    if (allSigned) {
      await prisma.transfer.update({
        where: { transferId },
        data: { status: 'SIGNATURES_COMPLETE' },
      });

      log.info({ transferId }, 'All signatures collected, transfer ready for execution');
    } else {
      log.debug(
        {
          transferId,
          signatory,
          signed: {
            seller: updated.sellerSigned,
            buyer: updated.buyerSigned,
            witness1: updated.witness1Signed,
            witness2: updated.witness2Signed,
          },
        },
        'Signature recorded',
      );
    }

    return {
      transferId,
      status: allSigned ? 'SIGNATURES_COMPLETE' : 'SIGNATURES_PENDING',
      allSigned,
    };
  }

  /**
   * Execute the transfer on Fabric and start the 72-hour cooling period.
   * Only callable after all signatures are collected.
   */
  async executeTransfer(
    transferId: string,
    registrarId: string,
  ): Promise<{
    transferId: string;
    status: string;
    fabricTxId: string;
    coolingPeriodEnds: string;
  }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    if (transfer.status !== 'SIGNATURES_COMPLETE') {
      throw new TransferInvalidStateError(transferId, 'SIGNATURES_COMPLETE', transfer.status);
    }

    let fabricTxId = '';

    // Submit to Fabric chaincode
    if (fabricService.isConnected()) {
      try {
        const result = await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'ExecuteTransfer',
          transferId,
        );
        fabricTxId = result || `fabric_tx_${Date.now()}`;
      } catch (err) {
        log.error({ err, transferId }, 'Fabric ExecuteTransfer failed');
        throw err;
      }
    } else {
      fabricTxId = `dev_tx_${Date.now()}`;
      log.warn({ transferId }, 'Fabric not connected, skipping chaincode (dev mode)');
    }

    // Set cooling period (72 hours)
    const coolingEnd = coolingPeriodEnd();

    // Update transfer record
    await prisma.transfer.update({
      where: { transferId },
      data: {
        status: 'REGISTERED_PENDING_FINALITY',
        fabricTxId,
        coolingPeriodEnds: coolingEnd,
      },
    });

    // Update property ownership in PostgreSQL
    await prisma.landRecord.update({
      where: { propertyId: transfer.propertyId },
      data: {
        ownerAadhaarHash: transfer.buyerAadhaarHash,
        ownerName: transfer.buyerName,
        acquisitionType: 'SALE',
        acquisitionDate: new Date(),
        status: 'ACTIVE',
        coolingPeriodEnds: coolingEnd,
        fabricTxId,
        updatedBy: registrarId,
      },
    });

    // Create ownership history entry
    const lastHistory = await prisma.ownershipHistory.findFirst({
      where: { propertyId: transfer.propertyId },
      orderBy: { sequenceNumber: 'desc' },
    });

    await prisma.ownershipHistory.create({
      data: {
        propertyId: transfer.propertyId,
        sequenceNumber: (lastHistory?.sequenceNumber ?? 0) + 1,
        ownerAadhaarHash: transfer.buyerAadhaarHash,
        ownerName: transfer.buyerName,
        acquisitionType: 'SALE',
        acquisitionDate: new Date(),
        saleAmountPaisa: transfer.saleAmountPaisa,
        stampDutyPaisa: transfer.stampDutyPaisa,
        fabricTxId,
      },
    });

    // Queue async jobs
    await anchoringQueue.add('anchor-transfer', {
      transferId,
      propertyId: transfer.propertyId,
      stateCode: transfer.propertyId.split('-')[0],
      fabricTxId,
    });

    await notificationQueue.add('transfer-completed', {
      transferId,
      propertyId: transfer.propertyId,
      buyerAadhaarHash: transfer.buyerAadhaarHash,
      sellerAadhaarHash: transfer.sellerAadhaarHash,
      coolingPeriodEnds: coolingEnd.toISOString(),
    });

    log.info(
      { transferId, propertyId: transfer.propertyId, fabricTxId, coolingPeriodEnds: coolingEnd.toISOString() },
      'Transfer executed, cooling period started',
    );

    return {
      transferId,
      status: 'REGISTERED_PENDING_FINALITY',
      fabricTxId,
      coolingPeriodEnds: coolingEnd.toISOString(),
    };
  }

  /**
   * Cancel a pending transfer.
   * Only transfers that have not been executed can be cancelled.
   */
  async cancelTransfer(
    transferId: string,
    reason: string,
  ): Promise<{ transferId: string; status: string }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    const cancellableStatuses = ['INITIATED', 'STAMP_DUTY_PENDING', 'STAMP_DUTY_PAID', 'SIGNATURES_PENDING'];
    if (!cancellableStatuses.includes(transfer.status)) {
      throw new TransferInvalidStateError(transferId, 'a cancellable status', transfer.status);
    }

    // Cancel in Fabric if connected
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'CancelTransfer',
          transferId,
          reason,
        );
      } catch (err) {
        log.warn({ err, transferId }, 'Fabric CancelTransfer failed, proceeding with PostgreSQL update');
      }
    }

    await prisma.transfer.update({
      where: { transferId },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
      },
    });

    // Restore property status
    await prisma.landRecord.update({
      where: { propertyId: transfer.propertyId },
      data: { status: 'ACTIVE' },
    });

    log.info({ transferId, reason }, 'Transfer cancelled');

    return { transferId, status: 'CANCELLED' };
  }

  /**
   * Get the current status of a transfer.
   */
  async getTransferStatus(transferId: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { transferId },
      include: {
        property: {
          select: {
            propertyId: true,
            surveyNumber: true,
            stateCode: true,
            districtCode: true,
            ownerName: true,
          },
        },
      },
    });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    return serializeBigInts({
      transferId: transfer.transferId,
      propertyId: transfer.propertyId,
      status: transfer.status,
      seller: {
        aadhaarHash: transfer.sellerAadhaarHash,
        name: transfer.sellerName,
      },
      buyer: {
        aadhaarHash: transfer.buyerAadhaarHash,
        name: transfer.buyerName,
      },
      saleAmountPaisa: transfer.saleAmountPaisa,
      stampDutyPaisa: transfer.stampDutyPaisa,
      signatures: {
        seller: transfer.sellerSigned,
        buyer: transfer.buyerSigned,
        witness1: transfer.witness1Signed,
        witness2: transfer.witness2Signed,
      },
      fabricTxId: transfer.fabricTxId,
      coolingPeriodEnds: transfer.coolingPeriodEnds?.toISOString() ?? null,
      objectionReason: transfer.objectionReason,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
      property: transfer.property,
    });
  }

  /**
   * File an objection during the 72-hour cooling period.
   */
  async fileObjection(
    transferId: string,
    reason: string,
    documentHash?: string,
  ): Promise<{ transferId: string; status: string }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    if (transfer.status !== 'REGISTERED_PENDING_FINALITY') {
      throw new TransferInvalidStateError(transferId, 'REGISTERED_PENDING_FINALITY', transfer.status);
    }

    // Verify we are still within the cooling period
    if (transfer.coolingPeriodEnds && isCoolingPeriodExpired(transfer.coolingPeriodEnds)) {
      throw new ValidationError('Cooling period has expired, objections can no longer be filed');
    }

    await prisma.transfer.update({
      where: { transferId },
      data: {
        status: 'OBJECTION_RAISED',
        objectionReason: reason,
        objectionDocHash: documentHash,
      },
    });

    log.info({ transferId, reason }, 'Objection filed during cooling period');

    return { transferId, status: 'OBJECTION_RAISED' };
  }

  /**
   * Finalize a transfer after the cooling period expires without objections.
   */
  async finalizeTransfer(transferId: string): Promise<{ transferId: string; status: string }> {
    const transfer = await prisma.transfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new TransferNotFoundError(transferId);
    }

    if (transfer.status !== 'REGISTERED_PENDING_FINALITY') {
      throw new TransferInvalidStateError(transferId, 'REGISTERED_PENDING_FINALITY', transfer.status);
    }

    // Verify cooling period has expired
    if (transfer.coolingPeriodEnds && !isCoolingPeriodExpired(transfer.coolingPeriodEnds)) {
      throw new ValidationError(
        `Cooling period has not expired yet. Expires at: ${transfer.coolingPeriodEnds.toISOString()}`,
      );
    }

    // Finalize on Fabric
    if (fabricService.isConnected()) {
      try {
        await fabricService.submitTransaction(
          config.FABRIC_CHAINCODE_NAME,
          'FinalizeAfterCooling',
          transferId,
        );
      } catch (err) {
        log.warn({ err, transferId }, 'Fabric FinalizeAfterCooling failed');
      }
    }

    // Update transfer status
    await prisma.transfer.update({
      where: { transferId },
      data: { status: 'REGISTERED_FINAL' },
    });

    // Clear cooling period on property
    await prisma.landRecord.update({
      where: { propertyId: transfer.propertyId },
      data: { coolingPeriodEnds: null },
    });

    log.info({ transferId, propertyId: transfer.propertyId }, 'Transfer finalized');

    return { transferId, status: 'REGISTERED_FINAL' };
  }
}

export const transferService = new TransferService();
export default transferService;
