/**
 * BhulekhChain Test Fixtures
 *
 * Deterministic test data for Indian land records.
 * NEVER use real Aadhaar numbers or PII in tests.
 * All hashes use repeated characters for predictable testing.
 */

export const TEST_PROPERTIES = {
  /** Active property in Andhra Pradesh with clear status */
  active: {
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    surveyNumber: '142/3',
    subSurveyNumber: '3',
    stateCode: 'AP',
    stateName: 'Andhra Pradesh',
    districtCode: 'GNT',
    districtName: 'Guntur',
    tehsilCode: 'TNL',
    tehsilName: 'Tenali',
    villageCode: 'SKM',
    villageName: 'Sakhamuru',
    pinCode: '522201',
    ownerAadhaarHash: 'a'.repeat(64),
    ownerName: 'Ramesh Kumar',
    ownerFatherName: 'Suresh Kumar',
    areaSqMeters: 80937,
    areaLocalValue: 2.0,
    areaLocalUnit: 'ACRES',
    ownershipType: 'FREEHOLD',
    acquisitionType: 'SALE',
    acquisitionDate: '2019-06-15',
    landUse: 'AGRICULTURAL',
    landClassification: 'IRRIGATED_WET',
    status: 'ACTIVE',
    disputeStatus: 'CLEAR',
    encumbranceStatus: 'CLEAR',
    registrationNumber: 'AP/GNT/2019/12345',
    subRegistrarOffice: 'SRO Tenali',
    registrationDate: '2019-06-15',
    fabricTxId: 'tx_f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    annualLandRevenue: 120000,
    taxPaidUpTo: '2027-2028',
    provenanceSequence: 3,
  },

  /** Disputed property in Telangana under adjudication */
  disputed: {
    propertyId: 'TG-HYD-SEC-AMR-567-0',
    surveyNumber: '567',
    subSurveyNumber: '0',
    stateCode: 'TG',
    stateName: 'Telangana',
    districtCode: 'HYD',
    districtName: 'Hyderabad',
    tehsilCode: 'SEC',
    tehsilName: 'Secunderabad',
    villageCode: 'AMR',
    villageName: 'Amerpet',
    pinCode: '500016',
    ownerAadhaarHash: 'b'.repeat(64),
    ownerName: 'Lakshmi Devi',
    ownerFatherName: 'Venkat Rao',
    areaSqMeters: 4047,
    areaLocalValue: 1.0,
    areaLocalUnit: 'ACRES',
    ownershipType: 'FREEHOLD',
    acquisitionType: 'INHERITANCE',
    acquisitionDate: '2015-03-20',
    landUse: 'RESIDENTIAL',
    landClassification: 'URBAN',
    status: 'ACTIVE',
    disputeStatus: 'UNDER_ADJUDICATION',
    encumbranceStatus: 'CLEAR',
    registrationNumber: 'TG/HYD/2015/67890',
    subRegistrarOffice: 'SRO Secunderabad',
    registrationDate: '2015-03-20',
    fabricTxId: 'tx_b1b2b3b4b5b6b7b8b9b0c1c2c3c4c5c6c7c8c9c0d1d2d3d4d5d6d7d8d9d0e1e2',
    annualLandRevenue: 500000,
    taxPaidUpTo: '2026-2027',
    provenanceSequence: 2,
  },

  /** Encumbered (mortgaged) property in Maharashtra */
  encumbered: {
    propertyId: 'MH-PUN-HVL-KTJ-1234-0',
    surveyNumber: '1234',
    subSurveyNumber: '0',
    stateCode: 'MH',
    stateName: 'Maharashtra',
    districtCode: 'PUN',
    districtName: 'Pune',
    tehsilCode: 'HVL',
    tehsilName: 'Haveli',
    villageCode: 'KTJ',
    villageName: 'Katraj',
    pinCode: '411046',
    ownerAadhaarHash: 'c'.repeat(64),
    ownerName: 'Amit Patil',
    ownerFatherName: 'Rajesh Patil',
    areaSqMeters: 2023,
    areaLocalValue: 0.5,
    areaLocalUnit: 'ACRES',
    ownershipType: 'FREEHOLD',
    acquisitionType: 'SALE',
    acquisitionDate: '2020-11-10',
    landUse: 'COMMERCIAL',
    landClassification: 'URBAN',
    status: 'ACTIVE',
    disputeStatus: 'CLEAR',
    encumbranceStatus: 'MORTGAGED',
    registrationNumber: 'MH/PUN/2020/11234',
    subRegistrarOffice: 'SRO Haveli',
    registrationDate: '2020-11-10',
    fabricTxId: 'tx_c1c2c3c4c5c6c7c8c9c0d1d2d3d4d5d6d7d8d9d0e1e2e3e4e5e6e7e8e9e0f1f2',
    annualLandRevenue: 250000,
    taxPaidUpTo: '2027-2028',
    provenanceSequence: 4,
  },
} as const;

export const TEST_USERS = {
  /** Sub-registrar for Andhra Pradesh - can register properties and initiate transfers */
  registrar: {
    id: 'usr_reg_ap_001',
    aadhaarHash: 'd'.repeat(64),
    name: 'Srinivas Reddy',
    role: 'registrar',
    stateCode: 'AP',
    districtCode: 'GNT',
    mspId: 'RevenueOrgMSP',
    fabricEnrolled: true,
  },

  /** Regular citizen - can view own property and verify */
  citizen: {
    id: 'usr_cit_ap_001',
    aadhaarHash: 'e'.repeat(64),
    name: 'Priya Sharma',
    role: 'citizen',
    stateCode: 'AP',
    districtCode: 'GNT',
    mspId: '',
    fabricEnrolled: false,
  },

  /** Bank officer - can add/release encumbrances */
  bank_officer: {
    id: 'usr_bnk_sbi_001',
    aadhaarHash: 'f'.repeat(64),
    name: 'Vikram Singh',
    role: 'bank_officer',
    stateCode: 'AP',
    districtCode: 'GNT',
    mspId: 'BankOrgMSP',
    fabricEnrolled: true,
    institution: 'State Bank of India',
    branchCode: 'SBI-GNT-001',
  },

  /** Tehsildar - can approve mutations */
  tehsildar: {
    id: 'usr_teh_ap_001',
    aadhaarHash: '1'.repeat(64),
    name: 'Rajesh Naidu',
    role: 'tehsildar',
    stateCode: 'AP',
    districtCode: 'GNT',
    mspId: 'RevenueOrgMSP',
    fabricEnrolled: true,
  },

  /** Admin user - full system access */
  admin: {
    id: 'usr_adm_001',
    aadhaarHash: '2'.repeat(64),
    name: 'System Administrator',
    role: 'admin',
    stateCode: '',
    districtCode: '',
    mspId: 'RevenueOrgMSP',
    fabricEnrolled: true,
  },
} as const;

export const TEST_TRANSFERS = {
  /** Sample completed transfer for the active property */
  completed: {
    transferId: 'xfr_t1u2v3w4',
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    seller: {
      aadhaarHash: 'a'.repeat(64),
      name: 'Ramesh Kumar',
    },
    buyer: {
      aadhaarHash: 'e'.repeat(64),
      name: 'Priya Sharma',
    },
    witnesses: [
      {
        aadhaarHash: 'f'.repeat(64),
        name: 'Anil Verma',
        signed: true,
      },
      {
        aadhaarHash: '3'.repeat(64),
        name: 'Sunita Devi',
        signed: true,
      },
    ],
    saleAmountPaisa: 350000000,
    declaredValuePaisa: 350000000,
    circleRateValuePaisa: 320000000,
    stampDutyAmountPaisa: 21000000,
    registrationFeePaisa: 3500000,
    totalGovernmentFeesPaisa: 24500000,
    status: 'REGISTERED_FINAL',
    registeredBy: 'd'.repeat(64),
    fabricTxId: 'tx_xfr_099a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
    saleDeedHash: 'QmX7b3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    stampDutyReceiptHash: 'QmY8c4e5f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2',
    coolingPeriodEnds: '2027-03-18T10:30:00Z',
    createdAt: '2027-03-15T09:00:00Z',
    updatedAt: '2027-03-18T10:30:00Z',
  },

  /** Pending transfer for testing in-progress flows */
  pending: {
    transferId: 'xfr_p5q6r7s8',
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    seller: {
      aadhaarHash: 'a'.repeat(64),
      name: 'Ramesh Kumar',
    },
    buyer: {
      aadhaarHash: 'e'.repeat(64),
      name: 'Priya Sharma',
    },
    witnesses: [
      {
        aadhaarHash: 'f'.repeat(64),
        name: 'Anil Verma',
        signed: false,
      },
      {
        aadhaarHash: '3'.repeat(64),
        name: 'Sunita Devi',
        signed: false,
      },
    ],
    saleAmountPaisa: 350000000,
    declaredValuePaisa: 350000000,
    circleRateValuePaisa: 320000000,
    stampDutyAmountPaisa: 21000000,
    registrationFeePaisa: 3500000,
    totalGovernmentFeesPaisa: 24500000,
    status: 'INITIATED',
    registeredBy: 'd'.repeat(64),
    fabricTxId: '',
    saleDeedHash: '',
    stampDutyReceiptHash: '',
    coolingPeriodEnds: '',
    createdAt: '2027-04-01T09:00:00Z',
    updatedAt: '2027-04-01T09:00:00Z',
  },
} as const;

export const TEST_ENCUMBRANCES = {
  /** Active mortgage on the encumbered property */
  activeMortgage: {
    encumbranceId: 'enc_e1f2g3h4',
    propertyId: 'MH-PUN-HVL-KTJ-1234-0',
    type: 'MORTGAGE',
    status: 'ACTIVE',
    institution: {
      name: 'State Bank of India',
      branchCode: 'SBI-GNT-001',
      mspId: 'BankOrgMSP',
    },
    loanAccountNumber: 'SBI-HL-123456',
    sanctionedAmountPaisa: 200000000,
    outstandingAmountPaisa: 180000000,
    interestRateBps: 850,
    startDate: '2021-04-01',
    endDate: '2041-04-01',
    createdBy: 'f'.repeat(64),
    createdAt: '2021-04-01T00:00:00Z',
  },

  /** Released mortgage for history testing */
  releasedMortgage: {
    encumbranceId: 'enc_r5s6t7u8',
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    type: 'MORTGAGE',
    status: 'RELEASED',
    institution: {
      name: 'HDFC Bank',
      branchCode: 'HDFC-GNT-002',
      mspId: 'BankOrgMSP',
    },
    loanAccountNumber: 'HDFC-HL-789012',
    sanctionedAmountPaisa: 150000000,
    outstandingAmountPaisa: 0,
    interestRateBps: 900,
    startDate: '2016-01-15',
    endDate: '2036-01-15',
    releasedAt: '2019-06-14T00:00:00Z',
    createdBy: 'f'.repeat(64),
    createdAt: '2016-01-15T00:00:00Z',
  },
} as const;

export const TEST_DISPUTES = {
  /** Active dispute on the disputed property */
  activeDispute: {
    disputeId: 'dsp_d1e2f3g4',
    propertyId: 'TG-HYD-SEC-AMR-567-0',
    type: 'OWNERSHIP_CLAIM',
    status: 'UNDER_ADJUDICATION',
    filedBy: {
      aadhaarHash: '4'.repeat(64),
      name: 'Vijay Kumar',
    },
    against: {
      aadhaarHash: 'b'.repeat(64),
      name: 'Lakshmi Devi',
    },
    courtName: 'Civil Court, Secunderabad',
    caseNumber: 'OS/2027/456',
    filedDate: '2027-05-01',
    nextHearingDate: '2027-07-15',
    description: 'Claimant alleges inheritance right to 50% share',
    createdAt: '2027-05-01T00:00:00Z',
  },
} as const;

export const TEST_STAMP_DUTY = {
  /** Andhra Pradesh stamp duty rates */
  andhraPradesh: {
    stateCode: 'AP',
    stampDutyRateBps: 500,
    registrationFeeRateBps: 100,
    surchargeBps: 0,
    circleRatePerSqMeter: 4000,
  },
  /** Maharashtra stamp duty rates */
  maharashtra: {
    stateCode: 'MH',
    stampDutyRateBps: 600,
    registrationFeeRateBps: 100,
    surchargeBps: 100,
    circleRatePerSqMeter: 8000,
  },
  /** Telangana stamp duty rates */
  telangana: {
    stateCode: 'TG',
    stampDutyRateBps: 400,
    registrationFeeRateBps: 50,
    surchargeBps: 150,
    circleRatePerSqMeter: 6000,
  },
} as const;

/** Property ID format regex - used across validation schemas */
export const PROPERTY_ID_REGEX = /^[A-Z]{2}-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}-\d+(-\w+)?$/;

/** Aadhaar hash length (SHA-256 hex string) */
export const AADHAAR_HASH_LENGTH = 64;
