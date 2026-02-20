/**
 * Seed the dashboard mock properties into PostgreSQL.
 *
 * Usage:
 *   cd backend && npx tsx --env-file=.env scripts/seed-mock-props.ts
 */

import prisma from '../src/models/prisma.js';

async function main(): Promise<void> {
  const props = [
    {
      propertyId: 'PROP-MH-2024-00142',
      surveyNumber: '123/4A',
      stateCode: 'MH',
      districtCode: 'PUNE',
      tehsilCode: 'HVL',
      villageCode: 'WDGN',
      pinCode: '411014',
      areaSqMeters: 222.97,
      ownerAadhaarHash:
        'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      ownerName: 'Rajesh Kumar Sharma',
      ownerFatherName: 'Mohan Sharma',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2024-03-15'),
      landUse: 'RESIDENTIAL',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'CLEAR',
      fabricTxId: 'fab_tx_8a7b6c5d4e3f2g1h',
      annualLandRevenue: BigInt(250000),
    },
    {
      propertyId: 'PROP-MH-2024-00891',
      surveyNumber: '456/7B',
      stateCode: 'MH',
      districtCode: 'PUNE',
      tehsilCode: 'HVL',
      villageCode: 'KHRD',
      pinCode: '411014',
      areaSqMeters: 111.48,
      ownerAadhaarHash:
        'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      ownerName: 'Rajesh Kumar Sharma',
      ownerFatherName: 'Mohan Sharma',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2023-11-20'),
      landUse: 'RESIDENTIAL',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'ENCUMBERED',
      fabricTxId: 'fab_tx_2k3l4m5n6o7p8q9r',
      annualLandRevenue: BigInt(180000),
    },
  ];

  for (const p of props) {
    await prisma.landRecord.upsert({
      where: { propertyId: p.propertyId },
      update: {},
      create: p,
    });
    console.log('Seeded:', p.propertyId);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
