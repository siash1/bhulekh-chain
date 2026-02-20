/**
 * Standalone script to anchor a Fabric state root to Algorand testnet.
 *
 * Usage:
 *   cd backend && npx tsx --env-file=.env scripts/trigger-anchor.ts
 *
 * This bypasses the full backend stack (Prisma, Redis, BullMQ) and calls
 * the TitleProofAnchor ARC4 contract directly via algosdk.
 */

import algosdk from 'algosdk';
import { createHash } from 'node:crypto';

// --- Config from env ---
const ALGOD_URL = process.env['ALGORAND_ALGOD_URL'] ?? 'https://testnet-api.algonode.cloud';
const APP_ID = parseInt(process.env['ALGORAND_APP_ID'] ?? '0', 10);
const MNEMONIC = process.env['ALGORAND_ANCHOR_ACCOUNT_MNEMONIC'] ?? '';

if (!MNEMONIC || MNEMONIC.includes('abandon')) {
  console.error('Error: ALGORAND_ANCHOR_ACCOUNT_MNEMONIC is not set or is the placeholder.');
  console.error('Update backend/.env with the funded testnet mnemonic.');
  process.exit(1);
}

if (!APP_ID) {
  console.error('Error: ALGORAND_APP_ID is not set (still 0).');
  console.error('Deploy the TitleProofAnchor contract first, then update backend/.env.');
  process.exit(1);
}

// --- Anchor parameters for the DL (Delhi) state ---
const STATE_CODE = 'DL';
const CHANNEL_ID = 'dl-land-channel';
const BLOCK_START = 0;
const BLOCK_END = 50;
const TX_COUNT = 12;

// Compute a deterministic state root from the DL property data
const stateRoot = createHash('sha256')
  .update(`${STATE_CODE}:DL-NDL-CNK-VJP-201-0:${BLOCK_START}:${BLOCK_END}`)
  .digest('hex');

async function main(): Promise<void> {
  console.log('BhulekhChain — Algorand Testnet Anchor');
  console.log('=======================================');
  console.log(`  Algod URL:   ${ALGOD_URL}`);
  console.log(`  App ID:      ${APP_ID}`);
  console.log(`  State Code:  ${STATE_CODE}`);
  console.log(`  Block Range: ${BLOCK_START} - ${BLOCK_END}`);
  console.log(`  State Root:  ${stateRoot}`);
  console.log(`  Tx Count:    ${TX_COUNT}`);
  console.log('');

  // Initialize client and account
  const algodClient = new algosdk.Algodv2('', ALGOD_URL, '');
  const account = algosdk.mnemonicToSecretKey(MNEMONIC);
  console.log(`  Sender:      ${account.addr}`);

  // Check account balance
  const accountInfo = await algodClient.accountInformation(account.addr).do();
  const balanceMicroAlgo = Number(accountInfo['amount']);
  console.log(`  Balance:     ${(balanceMicroAlgo / 1_000_000).toFixed(6)} ALGO`);

  if (balanceMicroAlgo < 200_000) {
    console.error('\nError: Account balance too low. Fund it at https://lora.algokit.io/testnet/fund');
    process.exit(1);
  }

  // Define the ARC4 ABI method
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

  const suggestedParams = await algodClient.getTransactionParams().do();

  // Build the note field with anchor metadata
  const note = new Uint8Array(
    Buffer.from(
      JSON.stringify({
        standard: 'bhulekhchain-anchor-v1',
        stateCode: STATE_CODE,
        channelId: CHANNEL_ID,
        blockRange: { start: BLOCK_START, end: BLOCK_END },
        stateRoot,
        txCount: TX_COUNT,
        timestamp: new Date().toISOString(),
      }),
    ),
  );

  const signer = algosdk.makeBasicAccountTransactionSigner(account);

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: APP_ID,
    method: anchorMethod,
    methodArgs: [
      STATE_CODE,
      CHANNEL_ID,
      BigInt(BLOCK_START),
      BigInt(BLOCK_END),
      new Uint8Array(Buffer.from(stateRoot, 'hex')),
      BigInt(TX_COUNT),
    ],
    sender: account.addr,
    signer,
    suggestedParams,
    note,
  });

  console.log('\n  Submitting anchor transaction...');
  const result = await atc.execute(algodClient, 4);

  const txId = result.txIDs[0]!;
  const confirmedRound = Number(result.confirmedRound);
  const anchorSeq = result.methodResults[0]?.returnValue;

  console.log('\n=======================================');
  console.log('  ANCHOR SUCCESSFUL');
  console.log('=======================================');
  console.log(`  Tx ID:           ${txId}`);
  console.log(`  Confirmed Round: ${confirmedRound}`);
  console.log(`  Anchor Seq #:    ${anchorSeq}`);
  console.log('');
  console.log(`  Explorer (tx):   https://testnet.explorer.perawallet.app/tx/${txId}`);
  console.log(`  Explorer (app):  https://testnet.explorer.perawallet.app/application/${APP_ID}`);
  console.log('=======================================');
}

main().catch((err) => {
  console.error('Anchoring failed:', err);
  process.exit(1);
});
