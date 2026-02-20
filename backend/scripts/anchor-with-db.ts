/**
 * Anchor a DL state root to Algorand testnet AND save to PostgreSQL.
 *
 * Unlike trigger-anchor.ts (which uses raw algosdk), this script imports
 * the backend's anchoringService so the anchor record is persisted in
 * the algorandAnchor table via Prisma.
 *
 * Usage:
 *   cd backend && npx tsx --env-file=.env scripts/anchor-with-db.ts
 */

import { createHash } from 'node:crypto';
import { anchoringService } from '../src/services/anchoring.service.js';
import prisma from '../src/models/prisma.js';

const STATE_CODE = 'DL';
const CHANNEL_ID = 'dl-land-channel';
const BLOCK_START = 0;
const BLOCK_END = 50;
const TX_COUNT = 12;

const stateRoot = createHash('sha256')
  .update(`${STATE_CODE}:DL-NDL-CNK-VJP-201-0:${BLOCK_START}:${BLOCK_END}`)
  .digest('hex');

async function main(): Promise<void> {
  console.log('Anchoring DL state root via backend service (writes to Algorand + PostgreSQL)...');
  console.log(`  State Root: ${stateRoot}`);

  const result = await anchoringService.anchorStateRoot(
    STATE_CODE,
    CHANNEL_ID,
    { start: BLOCK_START, end: BLOCK_END },
    stateRoot,
    TX_COUNT,
  );

  console.log('\nAnchor result:');
  console.log(`  Anchor ID:       ${result.anchorId}`);
  console.log(`  Algorand Tx ID:  ${result.algorandTxId}`);
  console.log(`  Algorand Round:  ${result.algorandRound}`);
  console.log(`  Explorer:        https://testnet.explorer.perawallet.app/tx/${result.algorandTxId}`);

  // Verify it was saved to DB
  const dbRecord = await prisma.algorandAnchor.findFirst({
    where: { stateCode: STATE_CODE },
    orderBy: { anchoredAt: 'desc' },
  });

  if (dbRecord) {
    console.log('\nDB record confirmed:');
    console.log(`  anchorId:      ${dbRecord.anchorId}`);
    console.log(`  algorandTxId:  ${dbRecord.algorandTxId}`);
    console.log(`  verified:      ${dbRecord.verified}`);
  } else {
    console.log('\nWARNING: No DB record found!');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
