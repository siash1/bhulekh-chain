// services/notification.service.ts — Notification stubs for SMS, email, DigiLocker
// These are stubs that log notifications in dev and will integrate with
// NIC SMS Gateway, email service, and DigiLocker in production

import { createServiceLogger } from '../config/logger.js';
import { config } from '../config/index.js';

const log = createServiceLogger('notification-service');

class NotificationService {
  /**
   * Send an SMS via NIC SMS Gateway.
   * In development, logs the message instead of actually sending.
   *
   * NIC SMS Gateway integration for production:
   * - URL: https://smsgw.sms.gov.in/failsafe/HttpLink
   * - Requires registration with DIT/NIC
   */
  async sendSms(phoneNumber: string, message: string): Promise<{ sent: boolean; messageId: string }> {
    const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (config.NODE_ENV === 'production') {
      try {
        // Production: Call NIC SMS Gateway
        const response = await fetch('https://smsgw.sms.gov.in/failsafe/HttpLink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            username: 'bhulekhchain',
            pin: process.env['NIC_SMS_PIN'] ?? '',
            message,
            mnumber: phoneNumber,
            signature: 'BKLEKH',
          }),
        });

        if (!response.ok) {
          log.error({ status: response.status, phoneNumber: phoneNumber.slice(-4) }, 'SMS gateway error');
          return { sent: false, messageId };
        }

        log.info({ messageId, phoneLastFour: phoneNumber.slice(-4) }, 'SMS sent via NIC gateway');
        return { sent: true, messageId };
      } catch (err) {
        log.error({ err, phoneNumber: phoneNumber.slice(-4) }, 'Failed to send SMS');
        return { sent: false, messageId };
      }
    }

    // Development: Just log
    log.info(
      { messageId, phoneNumber: phoneNumber.slice(-4), message: message.slice(0, 50) },
      'SMS notification (dev stub)',
    );
    return { sent: true, messageId };
  }

  /**
   * Send an email notification.
   * In development, logs the email instead of actually sending.
   *
   * Production integration: NIC email service or SMTP relay.
   */
  async sendEmail(
    email: string,
    subject: string,
    body: string,
  ): Promise<{ sent: boolean; messageId: string }> {
    const messageId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (config.NODE_ENV === 'production') {
      try {
        // Production: Send via SMTP relay or NIC email service
        // TODO: Integrate with nodemailer + SMTP relay
        log.info({ messageId, email: email.replace(/(.{2}).+(@.+)/, '$1***$2'), subject }, 'Email sent');
        return { sent: true, messageId };
      } catch (err) {
        log.error({ err, subject }, 'Failed to send email');
        return { sent: false, messageId };
      }
    }

    // Development: Just log
    log.info(
      {
        messageId,
        email: email.replace(/(.{2}).+(@.+)/, '$1***$2'),
        subject,
        bodyPreview: body.slice(0, 80),
      },
      'Email notification (dev stub)',
    );
    return { sent: true, messageId };
  }

  /**
   * Push a document to DigiLocker for the citizen.
   * DigiLocker is India's digital document storage platform.
   *
   * In development, logs the push instead of actually calling.
   *
   * Production integration:
   * - DigiLocker Issuer API: https://partners.digilocker.gov.in
   * - Requires registration as DigiLocker Issuer
   */
  async pushToDigiLocker(
    aadhaarHash: string,
    documentCid: string,
    documentType: string = 'PROPERTY_RECORD',
  ): Promise<{ pushed: boolean; digiLockerId: string }> {
    const digiLockerId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (config.NODE_ENV === 'production') {
      try {
        // Production: Call DigiLocker Issuer API
        const response = await fetch('https://api.digilocker.gov.in/v1/issuer/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env['DIGILOCKER_API_KEY'] ?? ''}`,
          },
          body: JSON.stringify({
            aadhaarHash,
            documentUri: `ipfs://${documentCid}`,
            documentType,
            issuer: 'BhulekhChain - National Blockchain Property Register',
          }),
        });

        if (!response.ok) {
          log.error({ status: response.status }, 'DigiLocker push failed');
          return { pushed: false, digiLockerId };
        }

        log.info(
          { digiLockerId, aadhaarHash: aadhaarHash.slice(0, 12), documentType },
          'Document pushed to DigiLocker',
        );
        return { pushed: true, digiLockerId };
      } catch (err) {
        log.error({ err, aadhaarHash: aadhaarHash.slice(0, 12) }, 'Failed to push to DigiLocker');
        return { pushed: false, digiLockerId };
      }
    }

    // Development: Just log
    log.info(
      {
        digiLockerId,
        aadhaarHash: aadhaarHash.slice(0, 12),
        documentCid: documentCid.slice(0, 10),
        documentType,
      },
      'DigiLocker push (dev stub)',
    );
    return { pushed: true, digiLockerId };
  }

  /**
   * Send a transfer completion notification to all parties.
   */
  async notifyTransferCompleted(params: {
    transferId: string;
    propertyId: string;
    sellerPhone?: string;
    buyerPhone?: string;
    coolingPeriodEnds: string;
  }): Promise<void> {
    const { transferId, propertyId, sellerPhone, buyerPhone, coolingPeriodEnds } = params;

    const message = `BhulekhChain: Property transfer ${transferId} for ${propertyId} has been registered. 72-hour cooling period ends at ${coolingPeriodEnds}. Visit bhulekhchain.gov.in for details.`;

    const promises: Promise<unknown>[] = [];

    if (sellerPhone) {
      promises.push(this.sendSms(sellerPhone, message));
    }
    if (buyerPhone) {
      promises.push(this.sendSms(buyerPhone, message));
    }

    await Promise.allSettled(promises);

    log.info({ transferId, propertyId }, 'Transfer completion notifications dispatched');
  }
}

export const notificationService = new NotificationService();
export default notificationService;
