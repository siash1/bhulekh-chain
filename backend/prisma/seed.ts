// prisma/seed.ts — Seed test data for BhulekhChain development
// Creates 3 test properties, 2 test users, 1 transfer, and 1 encumbrance

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Deterministic hash function for test data
function testHash(input: string): string {
  return `sha256:${crypto.createHash('sha256').update(input + 'dev-salt-do-not-use-in-production').digest('hex')}`;
}

async function main() {
  console.log('Seeding BhulekhChain database...');

  // ============================================================
  // Test Users
  // ============================================================

  const registrar = await prisma.user.upsert({
    where: { id: 'usr_registrar1' },
    update: {},
    create: {
      id: 'usr_registrar1',
      aadhaarHash: testHash('111111111111'),
      name: 'Rajesh Kumar Sharma',
      role: 'REGISTRAR',
      stateCode: 'AP',
      districtCode: 'GNT',
      fabricMspEnrolled: true,
    },
  });

  const citizen = await prisma.user.upsert({
    where: { id: 'usr_citizen1' },
    update: {},
    create: {
      id: 'usr_citizen1',
      aadhaarHash: testHash('222222222222'),
      name: 'Ramesh Kumar',
      role: 'CITIZEN',
      stateCode: 'AP',
    },
  });

  console.log(`  Users: ${registrar.name} (${registrar.role}), ${citizen.name} (${citizen.role})`);

  // ============================================================
  // Test Property 1: Active property in Andhra Pradesh
  // ============================================================

  const property1 = await prisma.landRecord.upsert({
    where: { propertyId: 'AP-GNT-TNL-SKM-142-3' },
    update: {},
    create: {
      propertyId: 'AP-GNT-TNL-SKM-142-3',
      surveyNumber: '142/3',
      subSurveyNumber: '',
      stateCode: 'AP',
      districtCode: 'GNT',
      tehsilCode: 'TNL',
      villageCode: 'SKM',
      pinCode: '522201',
      areaSqMeters: 80937,
      areaLocalValue: 2.0,
      areaLocalUnit: 'ACRES',
      ownerAadhaarHash: testHash('222222222222'),
      ownerName: 'Ramesh Kumar',
      ownerFatherName: 'Suresh Kumar',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2019-06-15'),
      landUse: 'AGRICULTURAL',
      landClassification: 'IRRIGATED_WET',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'CLEAR',
      registrationNumber: 'AP/GNT/2019/12345',
      subRegistrarOffice: 'SRO Tenali',
      registrationDate: new Date('2019-06-15'),
      fabricTxId: 'tx_seed_ap_001',
      annualLandRevenue: 120000n, // 1200 rupees in paisa
      taxPaidUpTo: '2027-2028',
      provenanceSequence: 3,
      createdBy: testHash('111111111111'),
      updatedBy: testHash('111111111111'),
    },
  });

  // Ownership history for property 1
  await prisma.ownershipHistory.upsert({
    where: {
      propertyId_sequenceNumber: { propertyId: 'AP-GNT-TNL-SKM-142-3', sequenceNumber: 1 },
    },
    update: {},
    create: {
      propertyId: 'AP-GNT-TNL-SKM-142-3',
      sequenceNumber: 1,
      ownerAadhaarHash: 'sha256:genesis',
      ownerName: 'Original Survey Settlement',
      acquisitionType: 'GOVERNMENT_GRANT',
      acquisitionDate: new Date('1965-01-01'),
      fabricTxId: 'tx_genesis_ap',
    },
  });

  await prisma.ownershipHistory.upsert({
    where: {
      propertyId_sequenceNumber: { propertyId: 'AP-GNT-TNL-SKM-142-3', sequenceNumber: 2 },
    },
    update: {},
    create: {
      propertyId: 'AP-GNT-TNL-SKM-142-3',
      sequenceNumber: 2,
      ownerAadhaarHash: testHash('333333333333'),
      ownerName: 'Suresh Kumar',
      acquisitionType: 'INHERITANCE',
      acquisitionDate: new Date('1992-08-12'),
      fabricTxId: 'tx_inh_ap_001',
    },
  });

  await prisma.ownershipHistory.upsert({
    where: {
      propertyId_sequenceNumber: { propertyId: 'AP-GNT-TNL-SKM-142-3', sequenceNumber: 3 },
    },
    update: {},
    create: {
      propertyId: 'AP-GNT-TNL-SKM-142-3',
      sequenceNumber: 3,
      ownerAadhaarHash: testHash('222222222222'),
      ownerName: 'Ramesh Kumar',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2019-06-15'),
      saleAmountPaisa: 250000000n, // 25 lakh rupees
      stampDutyPaisa: 15000000n,   // 1.5 lakh rupees
      fabricTxId: 'tx_sale_ap_042',
    },
  });

  console.log(`  Property 1: ${property1.propertyId} - ${property1.ownerName} (${property1.status})`);

  // ============================================================
  // Test Property 2: Disputed property in Telangana
  // ============================================================

  const property2 = await prisma.landRecord.upsert({
    where: { propertyId: 'TG-HYD-SEC-AMR-567-0' },
    update: {},
    create: {
      propertyId: 'TG-HYD-SEC-AMR-567-0',
      surveyNumber: '567',
      subSurveyNumber: '0',
      stateCode: 'TG',
      districtCode: 'HYD',
      tehsilCode: 'SEC',
      villageCode: 'AMR',
      pinCode: '500018',
      areaSqMeters: 4047,
      areaLocalValue: 1.0,
      areaLocalUnit: 'ACRES',
      ownerAadhaarHash: testHash('444444444444'),
      ownerName: 'Lakshmi Devi',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'INHERITANCE',
      acquisitionDate: new Date('2015-03-20'),
      landUse: 'RESIDENTIAL',
      status: 'FROZEN',
      disputeStatus: 'DISPUTED',
      encumbranceStatus: 'CLEAR',
      registrationNumber: 'TG/HYD/2015/67890',
      subRegistrarOffice: 'SRO Secunderabad',
      registrationDate: new Date('2015-03-20'),
      fabricTxId: 'tx_seed_tg_001',
      provenanceSequence: 2,
      createdBy: testHash('111111111111'),
      updatedBy: testHash('111111111111'),
    },
  });

  // Active dispute for property 2
  await prisma.dispute.upsert({
    where: { disputeId: 'dsp_seed_001' },
    update: {},
    create: {
      disputeId: 'dsp_seed_001',
      propertyId: 'TG-HYD-SEC-AMR-567-0',
      type: 'OWNERSHIP_CLAIM',
      status: 'UNDER_ADJUDICATION',
      filedByHash: testHash('555555555555'),
      filedByName: 'Vijay Kumar',
      againstHash: testHash('444444444444'),
      againstName: 'Lakshmi Devi',
      courtName: 'Civil Court, Secunderabad',
      caseNumber: 'OS/2027/456',
      description: 'Claimant alleges inheritance right to 50% share based on deceased father will',
      filedDate: new Date('2027-05-01'),
      fabricTxId: 'tx_dsp_tg_001',
    },
  });

  console.log(`  Property 2: ${property2.propertyId} - ${property2.ownerName} (${property2.status}, DISPUTED)`);

  // ============================================================
  // Test Property 3: Encumbered property in Maharashtra
  // ============================================================

  const property3 = await prisma.landRecord.upsert({
    where: { propertyId: 'MH-PUN-HVL-KTJ-1234-0' },
    update: {},
    create: {
      propertyId: 'MH-PUN-HVL-KTJ-1234-0',
      surveyNumber: '1234',
      subSurveyNumber: '0',
      stateCode: 'MH',
      districtCode: 'PUN',
      tehsilCode: 'HVL',
      villageCode: 'KTJ',
      pinCode: '411046',
      areaSqMeters: 2023,
      areaLocalValue: 0.5,
      areaLocalUnit: 'ACRES',
      ownerAadhaarHash: testHash('666666666666'),
      ownerName: 'Priya Sharma',
      ownershipType: 'FREEHOLD',
      acquisitionType: 'SALE',
      acquisitionDate: new Date('2022-11-10'),
      landUse: 'RESIDENTIAL',
      status: 'ACTIVE',
      disputeStatus: 'CLEAR',
      encumbranceStatus: 'ENCUMBERED',
      registrationNumber: 'MH/PUN/2022/34567',
      subRegistrarOffice: 'SRO Haveli',
      registrationDate: new Date('2022-11-10'),
      fabricTxId: 'tx_seed_mh_001',
      provenanceSequence: 2,
      createdBy: testHash('111111111111'),
      updatedBy: testHash('111111111111'),
    },
  });

  // Encumbrance (mortgage) for property 3
  await prisma.encumbrance.upsert({
    where: { encumbranceId: 'enc_seed_001' },
    update: {},
    create: {
      encumbranceId: 'enc_seed_001',
      propertyId: 'MH-PUN-HVL-KTJ-1234-0',
      type: 'MORTGAGE',
      status: 'ACTIVE',
      institutionName: 'State Bank of India',
      branchCode: 'SBI-PUN-001',
      loanAccountNumber: 'SBI-HL-789012',
      amountPaisa: 5000000000n,   // 50 lakh rupees
      outstandingPaisa: 4500000000n, // 45 lakh rupees
      startDate: new Date('2022-12-01'),
      endDate: new Date('2042-12-01'),
      createdBy: testHash('777777777777'),
    },
  });

  console.log(`  Property 3: ${property3.propertyId} - ${property3.ownerName} (${property3.status}, ENCUMBERED)`);

  // ============================================================
  // Test Transfer Record (completed transfer for property 1)
  // ============================================================

  const transfer = await prisma.transfer.upsert({
    where: { transferId: 'xfr_seed_001' },
    update: {},
    create: {
      transferId: 'xfr_seed_001',
      propertyId: 'AP-GNT-TNL-SKM-142-3',
      sellerAadhaarHash: testHash('333333333333'),
      sellerName: 'Suresh Kumar',
      buyerAadhaarHash: testHash('222222222222'),
      buyerName: 'Ramesh Kumar',
      saleAmountPaisa: 250000000n,  // 25 lakh rupees
      circleRatePaisa: 240000000n,  // 24 lakh rupees (circle rate)
      stampDutyPaisa: 12500000n,    // stamp duty (5% of 25 lakh)
      registrationFeePaisa: 1250000n, // registration fee (0.5% of 25 lakh)
      status: 'REGISTERED_FINAL',
      sellerSigned: true,
      buyerSigned: true,
      witness1Signed: true,
      witness2Signed: true,
      registeredBy: testHash('111111111111'),
      fabricTxId: 'tx_sale_ap_042',
    },
  });

  console.log(`  Transfer: ${transfer.transferId} - ${transfer.status}`);

  // ============================================================
  // Seed audit log entries
  // ============================================================

  const auditEntryHash = crypto.createHash('sha256').update('seed-audit-entry-1').digest('hex');

  await prisma.auditLog.upsert({
    where: { id: 'audit_seed_001' },
    update: {},
    create: {
      id: 'audit_seed_001',
      actorAadhaarHash: testHash('111111111111'),
      actorRole: 'REGISTRAR',
      actorIp: '10.0.1.100',
      actorUserAgent: 'BhulekhChain-Admin/1.0',
      action: 'PROPERTY_REGISTERED',
      resourceType: 'LAND_RECORD',
      resourceId: 'AP-GNT-TNL-SKM-142-3',
      stateCode: 'AP',
      newState: { propertyId: 'AP-GNT-TNL-SKM-142-3', status: 'ACTIVE' },
      fabricTxId: 'tx_seed_ap_001',
      entryHash: auditEntryHash,
      previousEntryHash: '0000000000000000000000000000000000000000000000000000000000000000',
    },
  });

  console.log('  Audit log: 1 seed entry created');

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials (dev mode):');
  console.log('  Registrar Aadhaar: 111111111111 (OTP: 123456)');
  console.log('  Citizen Aadhaar:   222222222222 (OTP: 123456)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
