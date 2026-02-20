// jobs/notification.job.ts — BullMQ worker for async SMS/email notifications
// Processes notification queue items asynchronously

import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import redis from '../models/redis.js';
import { notificationService } from '../services/notification.service.js';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('notification-job');

interface TransferNotificationData {
  transferId: string;
  propertyId: string;
  buyerAadhaarHash: string;
  sellerAadhaarHash: string;
  coolingPeriodEnds: string;
  sellerPhone?: string;
  buyerPhone?: string;
  sellerEmail?: string;
  buyerEmail?: string;
}

interface EncumbranceNotificationData {
  encumbranceId: string;
  propertyId: string;
  type: string;
  institutionName: string;
  ownerAadhaarHash: string;
  action: 'ADDED' | 'RELEASED';
}

interface DisputeNotificationData {
  disputeId: string;
  propertyId: string;
  type: string;
  filedByName: string;
  againstName: string;
  courtName: string;
  caseNumber: string;
  action: 'FILED' | 'RESOLVED';
}

type NotificationJobData =
  | (TransferNotificationData & { notificationType: 'transfer-completed' })
  | (EncumbranceNotificationData & { notificationType: 'encumbrance-update' })
  | (DisputeNotificationData & { notificationType: 'dispute-update' });

/**
 * Process a notification job.
 * Dispatches SMS and email notifications based on the event type.
 */
async function processNotificationJob(job: Job<NotificationJobData | TransferNotificationData>): Promise<void> {
  const data = job.data;
  const jobName = job.name;

  log.info({ jobId: job.id, jobName }, 'Processing notification job');

  try {
    switch (jobName) {
      case 'transfer-completed': {
        const transferData = data as TransferNotificationData;
        await notificationService.notifyTransferCompleted({
          transferId: transferData.transferId,
          propertyId: transferData.propertyId,
          sellerPhone: transferData.sellerPhone,
          buyerPhone: transferData.buyerPhone,
          coolingPeriodEnds: transferData.coolingPeriodEnds,
        });

        // Also push to DigiLocker for buyer
        await notificationService.pushToDigiLocker(
          transferData.buyerAadhaarHash,
          `transfer-${transferData.transferId}`,
          'TRANSFER_RECORD',
        );
        break;
      }

      case 'encumbrance-update': {
        const encData = data as unknown as EncumbranceNotificationData;
        const encMessage = encData.action === 'ADDED'
          ? `BhulekhChain: A ${encData.type} by ${encData.institutionName} has been added to property ${encData.propertyId}.`
          : `BhulekhChain: A ${encData.type} by ${encData.institutionName} has been released from property ${encData.propertyId}.`;

        // Send SMS notification to property owner
        // In production, lookup phone from user DB
        log.info(
          { encumbranceId: encData.encumbranceId, propertyId: encData.propertyId, action: encData.action },
          `Encumbrance notification: ${encMessage}`,
        );
        break;
      }

      case 'dispute-update': {
        const dispData = data as unknown as DisputeNotificationData;
        const dispMessage = dispData.action === 'FILED'
          ? `BhulekhChain: A ${dispData.type} dispute has been filed on property ${dispData.propertyId} by ${dispData.filedByName}. Case: ${dispData.caseNumber}`
          : `BhulekhChain: Dispute on property ${dispData.propertyId} has been resolved.`;

        log.info(
          { disputeId: dispData.disputeId, propertyId: dispData.propertyId, action: dispData.action },
          `Dispute notification: ${dispMessage}`,
        );
        break;
      }

      default:
        log.warn({ jobName }, 'Unknown notification job type');
    }

    log.info({ jobId: job.id, jobName }, 'Notification job completed');
  } catch (err) {
    log.error({ err, jobId: job.id, jobName }, 'Notification job failed');
    throw err;
  }
}

/**
 * Create and start the notification worker.
 */
export function startNotificationWorker(): Worker {
  const worker = new Worker('notifications', processNotificationJob, {
    connection: redis as unknown as ConnectionOptions,
    concurrency: 5, // Process up to 5 notifications concurrently
    limiter: {
      max: 100,
      duration: 60_000, // Max 100 notifications per minute
    },
  });

  worker.on('completed', (job) => {
    log.debug({ jobId: job.id, name: job.name }, 'Notification job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Notification job failed',
    );
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Notification worker error');
  });

  log.info('Notification worker started');
  return worker;
}
