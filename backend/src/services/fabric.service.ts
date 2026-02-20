// services/fabric.service.ts — Hyperledger Fabric Gateway SDK wrapper
// Connects to Fabric peer, submits/evaluates transactions on chaincode

import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, Identity, Signer, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/index.js';
import { createServiceLogger } from '../config/logger.js';
import {
  FabricConnectionError,
  FabricEndorsementError,
  FabricTimeoutError,
} from '../utils/errors.js';

const log = createServiceLogger('fabric-service');

/**
 * FabricService wraps the Hyperledger Fabric Gateway SDK.
 * It manages the gRPC connection, gateway identity, and provides
 * methods to submit (write) and evaluate (read) chaincode transactions.
 */
class FabricService {
  private gateway: Gateway | null = null;
  private grpcClient: grpc.Client | null = null;
  private connected = false;

  /**
   * Connect to the Fabric gateway.
   * Loads the user identity (X.509 certificate) and TLS credentials,
   * then establishes a gRPC connection to the gateway peer.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      log.debug('Already connected to Fabric gateway');
      return;
    }

    try {
      log.info(
        {
          peer: config.FABRIC_GATEWAY_PEER,
          mspId: config.FABRIC_MSP_ID,
          channel: config.FABRIC_CHANNEL_NAME,
        },
        'Connecting to Fabric gateway...',
      );

      // Load TLS certificate for the gateway peer
      const tlsCertPath = config.FABRIC_TLS_CERT_PATH;
      let tlsCredentials: grpc.ChannelCredentials;

      try {
        const tlsRootCert = fs.readFileSync(tlsCertPath);
        tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
      } catch {
        log.warn('TLS cert not found, using insecure credentials (dev only)');
        tlsCredentials = grpc.credentials.createInsecure();
      }

      // Create gRPC client connection
      this.grpcClient = new grpc.Client(
        config.FABRIC_GATEWAY_PEER,
        tlsCredentials,
        {
          'grpc.ssl_target_name_override': config.FABRIC_GATEWAY_PEER.split(':')[0],
        },
      );

      // Load user identity (X.509 certificate)
      const identity = await this.loadIdentity();
      const signer = await this.loadSigner();

      // Connect to Fabric Gateway
      this.gateway = connect({
        client: this.grpcClient,
        identity,
        signer,
        // Default timeouts
        evaluateOptions: () => ({ deadline: Date.now() + 30_000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30_000 }),
        submitOptions: () => ({ deadline: Date.now() + 30_000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
      });

      this.connected = true;
      log.info('Connected to Fabric gateway successfully');
    } catch (err) {
      log.error({ err }, 'Failed to connect to Fabric gateway');
      throw new FabricConnectionError(
        err instanceof Error ? err.message : 'Unknown connection error',
      );
    }
  }

  /**
   * Submit a transaction (write operation) to Fabric chaincode.
   * The transaction is endorsed, ordered, and committed to the ledger.
   */
  async submitTransaction(
    chaincodeName: string,
    functionName: string,
    ...args: string[]
  ): Promise<string> {
    const contract = this.getContract(chaincodeName);

    try {
      log.debug(
        { chaincode: chaincodeName, function: functionName, argsCount: args.length },
        'Submitting Fabric transaction',
      );

      const result = await contract.submitTransaction(functionName, ...args);
      const resultStr = Buffer.from(result).toString('utf8');

      log.info(
        { chaincode: chaincodeName, function: functionName },
        'Fabric transaction submitted successfully',
      );

      return resultStr;
    } catch (err) {
      return this.handleFabricError(err, functionName);
    }
  }

  /**
   * Evaluate a transaction (read-only query) against Fabric chaincode.
   * This does not create a ledger entry.
   */
  async evaluateTransaction(
    chaincodeName: string,
    functionName: string,
    ...args: string[]
  ): Promise<string> {
    const contract = this.getContract(chaincodeName);

    try {
      log.debug(
        { chaincode: chaincodeName, function: functionName, argsCount: args.length },
        'Evaluating Fabric transaction',
      );

      const result = await contract.evaluateTransaction(functionName, ...args);
      return Buffer.from(result).toString('utf8');
    } catch (err) {
      return this.handleFabricError(err, functionName);
    }
  }

  /**
   * Disconnect from the Fabric gateway and close gRPC connection.
   */
  disconnect(): void {
    if (this.gateway) {
      this.gateway.close();
      this.gateway = null;
    }
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }
    this.connected = false;
    log.info('Disconnected from Fabric gateway');
  }

  /**
   * Check if the service is connected to Fabric.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private getContract(chaincodeName: string): Contract {
    if (!this.gateway || !this.connected) {
      throw new FabricConnectionError('Not connected to Fabric gateway. Call connect() first.');
    }

    const network = this.gateway.getNetwork(config.FABRIC_CHANNEL_NAME);
    return network.getContract(chaincodeName);
  }

  private async loadIdentity(): Promise<Identity> {
    const certDir = path.join(config.FABRIC_CERT_PATH, 'signcerts');

    try {
      const certFiles = fs.readdirSync(certDir);
      const certFile = certFiles[0];
      if (!certFile) {
        throw new Error('No certificate files found');
      }
      const credentials = fs.readFileSync(path.join(certDir, certFile));
      return {
        mspId: config.FABRIC_MSP_ID,
        credentials,
      };
    } catch {
      // Dev fallback: create a dummy identity for testing
      log.warn('Certificate files not found, using dev placeholder identity');
      return {
        mspId: config.FABRIC_MSP_ID,
        credentials: Buffer.from('dev-placeholder-cert'),
      };
    }
  }

  private async loadSigner(): Promise<Signer> {
    const keyDir = path.join(config.FABRIC_CERT_PATH, 'keystore');

    try {
      const keyFiles = fs.readdirSync(keyDir);
      const keyFile = keyFiles[0];
      if (!keyFile) {
        throw new Error('No key files found');
      }
      const privateKeyPem = fs.readFileSync(path.join(keyDir, keyFile));
      const privateKey = crypto.createPrivateKey(privateKeyPem);
      return signers.newPrivateKeySigner(privateKey);
    } catch {
      // Dev fallback: create a dummy signer
      log.warn('Private key files not found, using dev placeholder signer');
      const dummyKey = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });
      return signers.newPrivateKeySigner(dummyKey.privateKey);
    }
  }

  private handleFabricError(err: unknown, functionName: string): never {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ENDORSEMENT_POLICY_FAILURE') || message.includes('endorsement')) {
      log.error({ err, function: functionName }, 'Fabric endorsement failed');
      throw new FabricEndorsementError(message);
    }

    if (message.includes('DEADLINE_EXCEEDED') || message.includes('timeout')) {
      log.error({ err, function: functionName }, 'Fabric transaction timeout');
      throw new FabricTimeoutError();
    }

    log.error({ err, function: functionName }, 'Fabric transaction failed');
    throw new FabricConnectionError(message);
  }
}

/** Singleton Fabric service instance */
export const fabricService = new FabricService();
export default fabricService;
