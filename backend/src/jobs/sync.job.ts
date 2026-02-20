// jobs/sync.job.ts — BullMQ worker for Fabric -> PostgreSQL data sync
// Listens for chaincode events and updates the PostgreSQL mirror

import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import redis from '../models/redis.js';
import prisma from '../models/prisma.js';
import { createServiceLogger } from '../config/logger.js';
import type {
  TransferCompletedPayload,
  PropertyRegisteredPayload,
  EncumbranceAddedPayload,
  EncumbranceReleasedPayload,
  DisputeFlaggedPayload,
  DisputeResolvedPayload,
} from '../types/events.js';

const log = createServiceLogger('sync-job');

interface SyncJobData {
  eventName: string;
  transactionId: string;
  blockNumber: number;
  timestamp: string;
  channelName: string;
  payload: Record<string, unknown>;
}

/**
 * Process a Fabric event sync job.
 * Updates the PostgreSQL mirror to reflect chaincode state changes.
 */
async function processSyncJob(job: Job<SyncJobData>): Promise<void> {
  const { eventName, transactionId, payload } = job.data;

  log.info(
    { jobId: job.id, eventName, transactionId },
    'Processing Fabric sync job',
  );

  try {
    switch (eventName) {
      case 'PropertyRegistered':
        await syncPropertyRegistered(payload as unknown as PropertyRegisteredPayload, transactionId);
        break;

      case 'TransferCompleted':
        await syncTransferCompleted(payload as unknown as TransferCompletedPayload, transactionId);
        break;

      case 'EncumbranceAdded':
        await syncEncumbranceAdded(payload as unknown as EncumbranceAddedPayload, transactionId);
        break;

      case 'EncumbranceReleased':
        await syncEncumbranceReleased(payload as unknown as EncumbranceReleasedPayload);
        break;

      case 'DisputeFlagged':
        await syncDisputeFlagged(payload as unknown as DisputeFlaggedPayload, transactionId);
        break;

      case 'DisputeResolved':
        await syncDisputeResolved(payload as unknown as DisputeResolvedPayload);
        break;

      default:
        log.warn({ eventName }, 'Unknown event type in sync job');
    }

    log.info({ jobId: job.id, eventName }, 'Sync job completed');
  } catch (err) {
    log.error({ err, jobId: job.id, eventName }, 'Sync job failed');
    throw err;
  }
}

/**
 * Sync a new property registration event from Fabric to PostgreSQL.
 */
async function syncPropertyRegistered(
  payload: PropertyRegisteredPayload,
  fabricTxId: string,
): Promise<void> {
  // Upsert the land record (may already exist if registered through our backend)
  await prisma.landRecord.upsert({
    where: { propertyId: payload.propertyId },
    update: {
      fabricTxId,
      updatedBy: payload.registeredBy,
    },
    create: {
      propertyId: payload.propertyId,
      surveyNumber: payload.surveyNumber,
      stateCode: payload.stateCode,
      districtCode: payload.districtCode,
      tehsilCode: payload.tehsilCode,
      villageCode: payload.villageCode,
      areaSqMeters: payload.areaSqMeters,
      ownerAadhaarHash: payload.ownerAadhaarHash,
      ownerName: payload.ownerName,
      ownershipType: 'FREEHOLD',
      acquisitionType: 'GOVERNMENT_GRANT',
      acquisitionDate: new Date(),
      landUse: payload.landUse,
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'CLEAR',
      fabricTxId,
      createdBy: payload.registeredBy,
      updatedBy: payload.registeredBy,
    },
  });

  log.info({ propertyId: payload.propertyId }, 'Property synced to PostgreSQL');
}

/**
 * Sync a transfer completion event from Fabric to PostgreSQL.
 * Updates property ownership, transfer status, and creates ownership history.
 */
async function syncTransferCompleted(
  payload: TransferCompletedPayload,
  fabricTxId: string,
): Promise<void> {
  // Update property ownership
  await prisma.landRecord.update({
    where: { propertyId: payload.propertyId },
    data: {
      ownerAadhaarHash: payload.buyerAadhaarHash,
      ownerName: payload.buyerName,
      acquisitionType: 'SALE',
      acquisitionDate: new Date(),
      status: 'ACTIVE',
      coolingPeriodEnds: new Date(payload.coolingPeriodEnds),
      fabricTxId,
      updatedBy: payload.registeredBy,
    },
  });

  // Update transfer record
  await prisma.transfer.updateMany({
    where: { transferId: payload.transferId },
    data: {
      status: 'REGISTERED_PENDING_FINALITY',
      fabricTxId,
      coolingPeriodEnds: new Date(payload.coolingPeriodEnds),
    },
  });

  // Create ownership history entry
  const lastHistory = await prisma.ownershipHistory.findFirst({
    where: { propertyId: payload.propertyId },
    orderBy: { sequenceNumber: 'desc' },
  });

  await prisma.ownershipHistory.create({
    data: {
      propertyId: payload.propertyId,
      sequenceNumber: (lastHistory?.sequenceNumber ?? 0) + 1,
      ownerAadhaarHash: payload.buyerAadhaarHash,
      ownerName: payload.buyerName,
      acquisitionType: 'SALE',
      acquisitionDate: new Date(),
      saleAmountPaisa: BigInt(payload.saleAmountPaisa),
      stampDutyPaisa: BigInt(payload.stampDutyPaisa),
      documentCid: payload.saleDeedHash,
      fabricTxId,
    },
  });

  log.info(
    { propertyId: payload.propertyId, transferId: payload.transferId },
    'Transfer synced to PostgreSQL',
  );
}

/**
 * Sync an encumbrance added event.
 */
async function syncEncumbranceAdded(
  payload: EncumbranceAddedPayload,
  _fabricTxId: string,
): Promise<void> {
  await prisma.encumbrance.upsert({
    where: { encumbranceId: payload.encumbranceId },
    update: {},
    create: {
      encumbranceId: payload.encumbranceId,
      propertyId: payload.propertyId,
      type: payload.type,
      status: 'ACTIVE',
      institutionName: payload.institutionName,
      branchCode: payload.institutionBranchCode,
      loanAccountNumber: payload.loanAccountNumber,
      amountPaisa: BigInt(payload.amountPaisa),
      outstandingPaisa: BigInt(payload.amountPaisa),
      startDate: new Date(payload.startDate),
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      createdBy: payload.addedBy,
    },
  });

  await prisma.landRecord.update({
    where: { propertyId: payload.propertyId },
    data: { encumbranceStatus: 'ENCUMBERED' },
  });

  log.info(
    { encumbranceId: payload.encumbranceId, propertyId: payload.propertyId },
    'Encumbrance synced to PostgreSQL',
  );
}

/**
 * Sync an encumbrance released event.
 */
async function syncEncumbranceReleased(payload: EncumbranceReleasedPayload): Promise<void> {
  await prisma.encumbrance.update({
    where: { encumbranceId: payload.encumbranceId },
    data: {
      status: 'RELEASED',
      releasedAt: new Date(),
    },
  });

  // Check remaining active encumbrances
  const remaining = await prisma.encumbrance.count({
    where: {
      propertyId: payload.propertyId,
      status: 'ACTIVE',
      encumbranceId: { not: payload.encumbranceId },
    },
  });

  if (remaining === 0) {
    await prisma.landRecord.update({
      where: { propertyId: payload.propertyId },
      data: { encumbranceStatus: 'CLEAR' },
    });
  }

  log.info(
    { encumbranceId: payload.encumbranceId, propertyId: payload.propertyId },
    'Encumbrance release synced to PostgreSQL',
  );
}

/**
 * Sync a dispute flagged event.
 */
async function syncDisputeFlagged(
  payload: DisputeFlaggedPayload,
  fabricTxId: string,
): Promise<void> {
  await prisma.dispute.upsert({
    where: { disputeId: payload.disputeId },
    update: {},
    create: {
      disputeId: payload.disputeId,
      propertyId: payload.propertyId,
      type: payload.type,
      status: 'FILED',
      filedByHash: payload.filedByAadhaarHash,
      filedByName: payload.filedByName,
      againstHash: payload.againstAadhaarHash,
      againstName: payload.againstName,
      courtName: payload.courtName,
      caseNumber: payload.caseNumber,
      description: payload.description,
      filedDate: new Date(),
      fabricTxId,
    },
  });

  await prisma.landRecord.update({
    where: { propertyId: payload.propertyId },
    data: { disputeStatus: 'DISPUTED' },
  });

  log.info(
    { disputeId: payload.disputeId, propertyId: payload.propertyId },
    'Dispute synced to PostgreSQL',
  );
}

/**
 * Sync a dispute resolved event.
 */
async function syncDisputeResolved(payload: DisputeResolvedPayload): Promise<void> {
  await prisma.dispute.update({
    where: { disputeId: payload.disputeId },
    data: {
      status: payload.resolution,
      resolution: payload.resolutionDetails,
      resolvedAt: new Date(),
    },
  });

  // Check remaining active disputes
  const remaining = await prisma.dispute.count({
    where: {
      propertyId: payload.propertyId,
      status: { in: ['FILED', 'UNDER_ADJUDICATION'] },
      disputeId: { not: payload.disputeId },
    },
  });

  if (remaining === 0) {
    await prisma.landRecord.update({
      where: { propertyId: payload.propertyId },
      data: {
        disputeStatus: 'CLEAR',
        status: 'ACTIVE',
      },
    });
  }

  log.info(
    { disputeId: payload.disputeId, propertyId: payload.propertyId },
    'Dispute resolution synced to PostgreSQL',
  );
}

/**
 * Create and start the sync worker.
 */
export function startSyncWorker(): Worker {
  const worker = new Worker('fabric-sync', processSyncJob, {
    connection: redis as unknown as ConnectionOptions,
    concurrency: 3, // Process up to 3 sync events concurrently
  });

  worker.on('completed', (job) => {
    log.debug({ jobId: job.id, eventName: job.data.eventName }, 'Sync job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, eventName: job?.data.eventName, err: err.message },
      'Sync job failed',
    );
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Sync worker error');
  });

  log.info('Fabric sync worker started');
  return worker;
}
