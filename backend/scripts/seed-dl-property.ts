/**
 * Seed the DL-NDL-CNK-VJP-201-0 property record into PostgreSQL
 * and link it to the Algorand anchor.
 *
 * Usage:
 *   cd backend && npx tsx --env-file=.env scripts/seed-dl-property.ts
 */

import prisma from '../src/models/prisma.js';

async function main(): Promise<void> {
  // Find the latest DL anchor to get the real Algorand tx ID
  const latestAnchor = await prisma.algorandAnchor.findFirst({
    where: { stateCode: 'DL' },
    orderBy: { anchoredAt: 'desc' },
  });

  const algorandTxId = latestAnchor?.algorandTxId ?? null;
  console.log(`Latest DL anchor tx: ${algorandTxId ?? 'none'}`);

  await prisma.landRecord.upsert({
    where: { propertyId: 'DL-NDL-CNK-VJP-201-0' },
    update: {
      algorandLastAnchor: algorandTxId,
    },
    create: {
      propertyId: 'DL-NDL-CNK-VJP-201-0',
      surveyNumber: '201',
      subSurveyNumber: '0',
      stateCode: 'DL',
      districtCode: 'NDL',
      tehsilCode: 'CNK',
      villageCode: 'VJP',
      pinCode: '110092',
      areaSqMeters: 150.00,
      ownerAadhaarHash:
        'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      ownerName: 'Rajesh Kumar',
      ownerFatherName: 'Suresh Kumar',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2020-06-15'),
      landUse: 'RESIDENTIAL',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'CLEAR',
      fabricTxId: 'fab_tx_seed_001',
      algorandLastAnchor: algorandTxId,
      annualLandRevenue: BigInt(500000),
    },
  });

  console.log('Property DL-NDL-CNK-VJP-201-0 seeded OK');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
