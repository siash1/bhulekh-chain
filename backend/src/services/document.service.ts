// services/document.service.ts — IPFS document management
// Uploads, retrieves, and verifies documents stored on IPFS

import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import { DocumentTooLargeError, DocumentInvalidTypeError } from '../utils/errors.js';
import { sha256 } from '../utils/helpers.js';

const log = createServiceLogger('document-service');

// Maximum document size: 25MB
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

// Allowed file extensions (fallback check)
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif']);

class DocumentService {
  /**
   * Upload a document to IPFS.
   * Validates file size and type before upload.
   *
   * @returns IPFS CID (Content Identifier)
   */
  async uploadDocument(
    file: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<{ cid: string; size: number; hash: string }> {
    // Validate file size
    const sizeMb = file.length / (1024 * 1024);
    if (file.length > MAX_DOCUMENT_SIZE) {
      throw new DocumentTooLargeError(Math.round(sizeMb * 100) / 100);
    }

    // Validate file type
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    if (mimeType && !ALLOWED_TYPES.has(mimeType)) {
      throw new DocumentInvalidTypeError(mimeType);
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new DocumentInvalidTypeError(ext);
    }

    // Calculate document hash for integrity verification
    const documentHash = sha256(file.toString('base64'));

    try {
      // Upload to IPFS via HTTP API
      const formData = new FormData();
      const blob = new Blob([file], { type: mimeType ?? 'application/octet-stream' });
      formData.append('file', blob, filename);

      const response = await fetch(`${config.IPFS_API_URL}/api/v0/add`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.statusText}`);
      }

      const result = (await response.json()) as { Hash: string; Size: string };
      const cid = result.Hash;

      log.info(
        { cid, filename, size: file.length, hash: documentHash },
        'Document uploaded to IPFS',
      );

      return {
        cid,
        size: file.length,
        hash: documentHash,
      };
    } catch (err) {
      // In dev mode, generate a mock CID
      if (config.NODE_ENV === 'development') {
        const mockCid = `Qm${documentHash.slice(0, 44)}`;
        log.warn(
          { mockCid, filename },
          'IPFS not available, using mock CID (dev mode)',
        );
        return {
          cid: mockCid,
          size: file.length,
          hash: documentHash,
        };
      }

      log.error({ err, filename }, 'Failed to upload document to IPFS');
      throw err;
    }
  }

  /**
   * Retrieve a document from IPFS by its CID.
   *
   * @returns Document content as a Buffer
   */
  async getDocument(cid: string): Promise<{ data: Buffer; contentType: string }> {
    try {
      // Try IPFS gateway first (faster for cached content)
      const gatewayUrl = `${config.IPFS_GATEWAY_URL}${cid}`;
      const response = await fetch(gatewayUrl);

      if (!response.ok) {
        // Fall back to local IPFS node
        const localResponse = await fetch(`${config.IPFS_API_URL}/api/v0/cat?arg=${cid}`, {
          method: 'POST',
        });

        if (!localResponse.ok) {
          throw new Error(`IPFS document not found: ${cid}`);
        }

        const arrayBuffer = await localResponse.arrayBuffer();
        return {
          data: Buffer.from(arrayBuffer),
          contentType: 'application/octet-stream',
        };
      }

      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const arrayBuffer = await response.arrayBuffer();

      log.debug({ cid, size: arrayBuffer.byteLength }, 'Document retrieved from IPFS');

      return {
        data: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch (err) {
      log.error({ err, cid }, 'Failed to retrieve document from IPFS');
      throw err;
    }
  }

  /**
   * Verify that a document hash exists in any land record, transfer,
   * or encumbrance in the system.
   *
   * @returns Verification result with context about where the hash was found
   */
  async verifyDocument(documentHash: string): Promise<{
    verified: boolean;
    registeredAt?: string;
    documentType?: string;
    propertyId?: string;
  }> {
    // Check if the hash matches any document CID in land records
    const landRecord = await prisma.landRecord.findFirst({
      where: { documentCid: documentHash },
      select: {
        propertyId: true,
        createdAt: true,
      },
    });

    if (landRecord) {
      return {
        verified: true,
        registeredAt: landRecord.createdAt.toISOString(),
        documentType: 'LAND_RECORD',
        propertyId: landRecord.propertyId,
      };
    }

    // Check transfer sale deeds
    const transfer = await prisma.transfer.findFirst({
      where: {
        OR: [
          { saleDeedCid: documentHash },
          { stampDutyReceiptHash: documentHash },
        ],
      },
      select: {
        propertyId: true,
        createdAt: true,
        saleDeedCid: true,
        stampDutyReceiptHash: true,
      },
    });

    if (transfer) {
      const docType = transfer.saleDeedCid === documentHash ? 'SALE_DEED' : 'STAMP_DUTY_RECEIPT';
      return {
        verified: true,
        registeredAt: transfer.createdAt.toISOString(),
        documentType: docType,
        propertyId: transfer.propertyId,
      };
    }

    // Check ownership history documents
    const historyEntry = await prisma.ownershipHistory.findFirst({
      where: { documentCid: documentHash },
      select: {
        propertyId: true,
        createdAt: true,
      },
    });

    if (historyEntry) {
      return {
        verified: true,
        registeredAt: historyEntry.createdAt.toISOString(),
        documentType: 'OWNERSHIP_HISTORY',
        propertyId: historyEntry.propertyId,
      };
    }

    log.debug({ documentHash }, 'Document hash not found in any record');
    return { verified: false };
  }
}

export const documentService = new DocumentService();
export default documentService;
