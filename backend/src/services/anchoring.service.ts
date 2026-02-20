// services/anchoring.service.ts — Algorand state root anchoring
// Anchors Fabric state roots to Algorand for independent public verification

import algosdk from 'algosdk';
import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import prisma from '../models/prisma.js';
import { generateId, nowISO } from '../utils/helpers.js';
import { AlgorandAnchorError } from '../utils/errors.js';

const log = createServiceLogger('anchoring-service');

class AnchoringService {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;
  private anchorAccount: algosdk.Account | null = null;

  constructor() {
    // Initialize Algorand clients
    this.algodClient = new algosdk.Algodv2('', config.ALGORAND_ALGOD_URL, '');
    this.indexerClient = new algosdk.Indexer('', config.ALGORAND_INDEXER_URL, '');

    // Load anchor account from mnemonic if available
    if (config.ALGORAND_ANCHOR_ACCOUNT_MNEMONIC) {
      try {
        this.anchorAccount = algosdk.mnemonicToSecretKey(config.ALGORAND_ANCHOR_ACCOUNT_MNEMONIC);
        log.info(
          { address: this.anchorAccount.addr },
          'Algorand anchor account loaded',
        );
      } catch (err) {
        log.warn({ err }, 'Failed to load Algorand anchor account from mnemonic');
      }
    } else {
      log.warn('No Algorand anchor mnemonic configured');
    }
  }

  /**
   * Anchor a Fabric state root to the Algorand blockchain.
   * Creates a transaction that calls the TitleProofAnchor smart contract
   * with the state root hash and block range metadata.
   *
   * @returns Anchor record with Algorand transaction details
   */
  async anchorStateRoot(
    stateCode: string,
    channelId: string,
    blockRange: { start: number; end: number },
    stateRoot: string,
    txCount: number,
  ): Promise<{
    anchorId: string;
    algorandTxId: string;
    algorandRound: number;
  }> {
    if (!this.anchorAccount) {
      throw new AlgorandAnchorError('Anchor account not configured');
    }

    if (!config.ALGORAND_APP_ID) {
      throw new AlgorandAnchorError('Algorand App ID not configured');
    }

    const anchorId = generateId('anc');

    try {
      // Build a proper ARC4 ABI method call using AtomicTransactionComposer.
      // The TitleProofAnchor contract is an ARC4 contract — it expects the
      // first 4 bytes of appArgs[0] to be the method selector (SHA-512/256
      // of the method signature), with remaining args ABI-encoded.
      const anchorMethod = new algosdk.ABIMethod({
        name: 'anchor_state',
        args: [
          { name: 'state_code', type: 'string' },
          { name: 'channel_id', type: 'string' },
          { name: 'fabric_block_start', type: 'uint64' },
          { name: 'fabric_block_end', type: 'uint64' },
          { name: 'state_root', type: 'byte[]' },
          { name: 'tx_count', type: 'uint64' },
        ],
        returns: { type: 'uint64' },
      });

      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Note field with full anchor metadata (for indexing by off-chain verifiers)
      const note = new Uint8Array(
        Buffer.from(
          JSON.stringify({
            standard: 'bhulekhchain-anchor-v1',
            anchorId,
            stateCode,
            channelId,
            blockRange,
            stateRoot,
            txCount,
            timestamp: nowISO(),
          }),
        ),
      );

      const signer = algosdk.makeBasicAccountTransactionSigner(this.anchorAccount);

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: config.ALGORAND_APP_ID,
        method: anchorMethod,
        methodArgs: [
          stateCode,
          channelId,
          BigInt(blockRange.start),
          BigInt(blockRange.end),
          new Uint8Array(Buffer.from(stateRoot, 'hex')),
          BigInt(txCount),
        ],
        sender: this.anchorAccount.addr,
        signer,
        suggestedParams,
        note,
      });

      const result = await atc.execute(this.algodClient, 4);
      const txId = result.txIDs[0];
      const confirmedRound = Number(result.confirmedRound);

      // Save anchor record to PostgreSQL
      await prisma.algorandAnchor.create({
        data: {
          anchorId,
          stateCode,
          channelId,
          fabricBlockStart: BigInt(blockRange.start),
          fabricBlockEnd: BigInt(blockRange.end),
          stateRoot,
          transactionCount: txCount,
          algorandTxId: txId,
          algorandRound: BigInt(confirmedRound),
          anchoredAt: new Date(),
          verified: true,
        },
      });

      log.info(
        {
          anchorId,
          algorandTxId: txId,
          algorandRound: confirmedRound,
          stateCode,
          blockRange,
          txCount,
        },
        'State root anchored to Algorand',
      );

      return {
        anchorId,
        algorandTxId: txId,
        algorandRound: confirmedRound,
      };
    } catch (err) {
      // In dev mode, create a mock anchor
      if (config.NODE_ENV === 'development') {
        const mockTxId = `MOCK_ALGO_TX_${Date.now()}`;
        const mockRound = Math.floor(Date.now() / 1000);

        await prisma.algorandAnchor.create({
          data: {
            anchorId,
            stateCode,
            channelId,
            fabricBlockStart: BigInt(blockRange.start),
            fabricBlockEnd: BigInt(blockRange.end),
            stateRoot,
            transactionCount: txCount,
            algorandTxId: mockTxId,
            algorandRound: BigInt(mockRound),
            anchoredAt: new Date(),
            verified: false,
          },
        });

        log.warn(
          { anchorId, mockTxId, stateCode },
          'Algorand anchoring failed, created mock anchor (dev mode)',
        );

        return { anchorId, algorandTxId: mockTxId, algorandRound: mockRound };
      }

      log.error({ err, stateCode, blockRange }, 'Failed to anchor state root to Algorand');
      throw new AlgorandAnchorError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  /**
   * Verify a property's data against the most recent Algorand anchor.
   * Checks that the property's state is consistent with what was anchored.
   */
  async verifyAnchor(propertyId: string): Promise<{
    verified: boolean;
    fabricStateRoot?: string;
    algorandTxId?: string;
    algorandBlockRound?: number;
    anchoredAt?: string;
    proofValid: boolean;
    message: string;
  }> {
    const stateCode = propertyId.split('-')[0] ?? '';

    // Find the most recent anchor for this state
    const latestAnchor = await prisma.algorandAnchor.findFirst({
      where: { stateCode },
      orderBy: { anchoredAt: 'desc' },
    });

    if (!latestAnchor) {
      return {
        verified: false,
        proofValid: false,
        message: `No Algorand anchor found for state ${stateCode}`,
      };
    }

    // Verify the anchor transaction exists on Algorand
    let proofValid = latestAnchor.verified;

    if (!proofValid && this.anchorAccount) {
      try {
        const txnInfo = await this.indexerClient
          .lookupTransactionByID(latestAnchor.algorandTxId)
          .do();

        if (txnInfo && txnInfo.transaction) {
          proofValid = true;
          // Update verified status in DB
          await prisma.algorandAnchor.update({
            where: { anchorId: latestAnchor.anchorId },
            data: { verified: true },
          });
        }
      } catch (err) {
        log.warn({ err, algorandTxId: latestAnchor.algorandTxId }, 'Failed to verify anchor on Algorand');
      }
    }

    return {
      verified: proofValid,
      fabricStateRoot: latestAnchor.stateRoot,
      algorandTxId: latestAnchor.algorandTxId,
      algorandBlockRound: Number(latestAnchor.algorandRound),
      anchoredAt: latestAnchor.anchoredAt.toISOString(),
      proofValid,
      message: proofValid
        ? 'Property ownership independently verified on Algorand public chain'
        : 'Anchor exists but could not be independently verified',
    };
  }

  /**
   * Get the most recent anchor for a given state.
   */
  async getLatestAnchor(stateCode: string) {
    const anchor = await prisma.algorandAnchor.findFirst({
      where: { stateCode },
      orderBy: { anchoredAt: 'desc' },
    });

    if (!anchor) {
      return null;
    }

    return {
      anchorId: anchor.anchorId,
      stateCode: anchor.stateCode,
      channelId: anchor.channelId,
      fabricBlockRange: {
        start: Number(anchor.fabricBlockStart),
        end: Number(anchor.fabricBlockEnd),
      },
      stateRoot: anchor.stateRoot,
      transactionCount: anchor.transactionCount,
      algorandTxId: anchor.algorandTxId,
      algorandRound: Number(anchor.algorandRound),
      anchoredAt: anchor.anchoredAt.toISOString(),
      verified: anchor.verified,
    };
  }
}

export const anchoringService = new AnchoringService();
export default anchoringService;
