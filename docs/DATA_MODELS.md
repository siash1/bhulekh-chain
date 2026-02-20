# DATA_MODELS.md — BhulekhChain Data Models

## 1. Fabric World State (CouchDB JSON Documents)

These are the chaincode data structures stored in Fabric's CouchDB world state.

### LandRecord (Primary Entity)
```json
{
  "docType": "landRecord",
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "surveyNumber": "142/3",
  "subSurveyNumber": "",
  "location": {
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "districtCode": "GNT",
    "districtName": "Guntur",
    "tehsilCode": "TNL",
    "tehsilName": "Tenali",
    "villageCode": "SKM",
    "villageName": "Sakhamuru",
    "pinCode": "522201"
  },
  "area": {
    "value": 80937,
    "unit": "SQ_METERS",
    "localValue": 2.0,
    "localUnit": "ACRES"
  },
  "boundaries": {
    "north": "Survey 141 - Suresh Reddy",
    "south": "Village Road",
    "east": "Irrigation Canal",
    "west": "Survey 143 - Lakshmi Devi",
    "geoJson": {
      "type": "Polygon",
      "coordinates": [[[80.4523, 16.2456], [80.4530, 16.2456], [80.4530, 16.2445], [80.4523, 16.2445], [80.4523, 16.2456]]]
    }
  },
  "currentOwner": {
    "ownerType": "INDIVIDUAL",
    "owners": [
      {
        "aadhaarHash": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        "name": "Ramesh Kumar",
        "fatherName": "Suresh Kumar",
        "sharePercentage": 100,
        "isMinor": false
      }
    ],
    "ownershipType": "FREEHOLD",
    "acquisitionType": "SALE",
    "acquisitionDate": "2019-06-15",
    "acquisitionDocumentHash": "QmX7b3d4e5f6a1b2c3d4e5f6..."
  },
  "landUse": "AGRICULTURAL",
  "landClassification": "IRRIGATED_WET",
  "status": "ACTIVE",
  "disputeStatus": "CLEAR",
  "encumbranceStatus": "CLEAR",
  "coolingPeriod": {
    "active": false,
    "expiresAt": ""
  },
  "taxInfo": {
    "annualLandRevenue": 1200,
    "lastPaidDate": "2027-03-01",
    "paidUpToYear": "2027-2028"
  },
  "registrationInfo": {
    "registrationNumber": "AP/GNT/2019/12345",
    "bookNumber": "I",
    "subRegistrarOffice": "SRO Tenali",
    "registrationDate": "2019-06-15"
  },
  "algorandInfo": {
    "asaId": 123456789,
    "lastAnchorTxId": "ALGO_TX_789ABC...",
    "lastAnchoredAt": "2027-03-15T10:25:00Z"
  },
  "polygonInfo": {
    "tokenized": false,
    "erc721TokenId": null,
    "contractAddress": null
  },
  "provenance": {
    "previousPropertyId": "",
    "splitFrom": "",
    "mergedFrom": [],
    "sequence": 3
  },
  "createdAt": "2015-03-20T00:00:00Z",
  "updatedAt": "2027-03-15T10:30:00Z",
  "createdBy": "sha256:registrar_hash...",
  "updatedBy": "sha256:registrar_hash..."
}
```

### TransferRecord
```json
{
  "docType": "transferRecord",
  "transferId": "xfr_t1u2v3w4",
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "seller": {
    "aadhaarHash": "sha256:a1b2c3...",
    "name": "Ramesh Kumar"
  },
  "buyer": {
    "aadhaarHash": "sha256:g7h8i9...",
    "name": "Priya Sharma"
  },
  "witnesses": [
    { "aadhaarHash": "sha256:j1k2l3...", "name": "Anil Verma", "signed": true },
    { "aadhaarHash": "sha256:m4n5o6...", "name": "Sunita Devi", "signed": true }
  ],
  "transactionDetails": {
    "saleAmount": 350000000,
    "declaredValue": 350000000,
    "circleRateValue": 320000000,
    "stampDutyAmount": 21000000,
    "registrationFee": 3500000,
    "totalGovernmentFees": 24500000
  },
  "documents": {
    "saleDeedHash": "QmX7b3d4e5f6...",
    "stampDutyReceiptHash": "QmY8c4e5f7...",
    "encumbranceCertificateHash": "QmZ9d5f6g8..."
  },
  "status": "REGISTERED_FINAL",
  "statusHistory": [
    { "status": "INITIATED", "at": "2027-03-15T09:00:00Z", "by": "sha256:registrar..." },
    { "status": "STAMP_DUTY_PAID", "at": "2027-03-15T09:30:00Z", "by": "system" },
    { "status": "SIGNATURES_COMPLETE", "at": "2027-03-15T10:00:00Z", "by": "system" },
    { "status": "REGISTERED_PENDING_FINALITY", "at": "2027-03-15T10:30:00Z", "by": "sha256:registrar..." },
    { "status": "REGISTERED_FINAL", "at": "2027-03-18T10:30:00Z", "by": "system" }
  ],
  "registeredBy": "sha256:registrar_hash...",
  "fabricTxId": "tx_xfr_099...",
  "createdAt": "2027-03-15T09:00:00Z",
  "updatedAt": "2027-03-18T10:30:00Z"
}
```

### EncumbranceRecord
```json
{
  "docType": "encumbranceRecord",
  "encumbranceId": "enc_e1f2g3",
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "type": "MORTGAGE",
  "status": "ACTIVE",
  "institution": {
    "name": "State Bank of India",
    "branchCode": "SBI-GNT-001",
    "mspId": "BankOrgMSP"
  },
  "details": {
    "loanAccountNumber": "SBI-HL-123456",
    "sanctionedAmount": 200000000,
    "outstandingAmount": 180000000,
    "interestRate": 850,
    "startDate": "2027-04-01",
    "endDate": "2047-04-01"
  },
  "courtOrderRef": "",
  "createdAt": "2027-04-01T00:00:00Z",
  "createdBy": "sha256:bank_officer_hash..."
}
```

### DisputeRecord
```json
{
  "docType": "disputeRecord",
  "disputeId": "dsp_d1e2f3",
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "type": "OWNERSHIP_CLAIM",
  "status": "UNDER_ADJUDICATION",
  "filedBy": {
    "aadhaarHash": "sha256:claimant...",
    "name": "Vijay Kumar"
  },
  "against": {
    "aadhaarHash": "sha256:a1b2c3...",
    "name": "Ramesh Kumar"
  },
  "courtDetails": {
    "courtName": "Civil Court, Tenali",
    "caseNumber": "OS/2027/456",
    "filedDate": "2027-05-01",
    "nextHearingDate": "2027-07-15"
  },
  "description": "Claimant alleges inheritance right to 50% share",
  "createdAt": "2027-05-01T00:00:00Z",
  "resolvedAt": null,
  "resolution": null
}
```

### MutationRecord
```json
{
  "docType": "mutationRecord",
  "mutationId": "mut_m1n2o3",
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "type": "SALE",
  "transferId": "xfr_t1u2v3w4",
  "previousOwner": { "aadhaarHash": "sha256:a1b2c3...", "name": "Ramesh Kumar" },
  "newOwner": { "aadhaarHash": "sha256:g7h8i9...", "name": "Priya Sharma" },
  "status": "AUTO_APPROVED",
  "approvedBy": "system",
  "approvedAt": "2027-03-18T10:30:00Z",
  "revenueRecordUpdated": true,
  "createdAt": "2027-03-15T10:30:00Z"
}
```

### AnchorRecord (Cross-Chain Reference)
```json
{
  "docType": "anchorRecord",
  "anchorId": "anc_a1b2c3",
  "stateCode": "AP",
  "channelId": "ap-land-channel",
  "fabricBlockRange": { "start": 1042, "end": 1089 },
  "stateRoot": "sha256:merkle_root_hash...",
  "transactionCount": 47,
  "algorandTxId": "ALGO_TX_ANCHOR_001...",
  "algorandRound": 34567890,
  "anchoredAt": "2027-03-15T10:25:00Z",
  "verified": true
}
```

---

## 2. Property ID Format

```
{StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}-{SubSurveyNo}

Examples:
AP-GNT-TNL-SKM-142-3        → Andhra Pradesh, Guntur, Tenali, Sakhamuru, Survey 142/3
TG-HYD-SEC-AMR-567-0        → Telangana, Hyderabad, Secunderabad, Amerpet, Survey 567
GJ-AMD-CTY-NAR-89-2A        → Gujarat, Ahmedabad, City, Naranpura, Survey 89/2A
MH-PUN-HVL-KTJ-1234-0      → Maharashtra, Pune, Haveli, Katraj, Survey 1234
```

Codes follow existing state government survey/revenue systems. The property ID is deterministic from location data — no separate ID generation needed.

---

## 3. PostgreSQL Schema (Read Mirror)

```sql
-- Core tables mirror Fabric state for fast querying

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- LAND RECORDS
-- ============================================
CREATE TABLE land_records (
    property_id         VARCHAR(50) PRIMARY KEY,
    survey_number       VARCHAR(20) NOT NULL,
    sub_survey_number   VARCHAR(10) DEFAULT '',
    
    -- Location
    state_code          VARCHAR(5) NOT NULL,
    district_code       VARCHAR(10) NOT NULL,
    tehsil_code         VARCHAR(10) NOT NULL,
    village_code        VARCHAR(10) NOT NULL,
    pin_code            VARCHAR(6),
    
    -- Area
    area_sq_meters      DECIMAL(15,2) NOT NULL,
    area_local_value    DECIMAL(10,4),
    area_local_unit     VARCHAR(20),
    
    -- GIS (PostGIS geometry)
    boundary            GEOMETRY(POLYGON, 4326),
    centroid            GEOMETRY(POINT, 4326),
    
    -- Ownership (current)
    owner_aadhaar_hash  VARCHAR(64) NOT NULL,
    owner_name          VARCHAR(200) NOT NULL,
    owner_father_name   VARCHAR(200),
    ownership_type      VARCHAR(20) NOT NULL DEFAULT 'FREEHOLD',
    acquisition_type    VARCHAR(20) NOT NULL,
    acquisition_date    DATE NOT NULL,
    
    -- Classification
    land_use            VARCHAR(30) NOT NULL,
    land_classification VARCHAR(30),
    
    -- Status
    status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    dispute_status      VARCHAR(30) NOT NULL DEFAULT 'CLEAR',
    encumbrance_status  VARCHAR(30) NOT NULL DEFAULT 'CLEAR',
    cooling_period_ends TIMESTAMPTZ,
    
    -- Registration
    registration_number VARCHAR(50),
    sub_registrar_office VARCHAR(100),
    registration_date   DATE,
    
    -- Blockchain references
    fabric_tx_id        VARCHAR(100),
    algorand_asa_id     BIGINT,
    algorand_last_anchor VARCHAR(100),
    polygon_token_id    VARCHAR(100),
    polygon_contract    VARCHAR(42),
    
    -- Tax
    annual_land_revenue BIGINT DEFAULT 0,
    tax_paid_up_to      VARCHAR(20),
    
    -- Document
    document_cid        VARCHAR(100),
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(64),
    updated_by          VARCHAR(64),
    provenance_sequence INTEGER NOT NULL DEFAULT 1,
    
    -- Full-text search
    search_vector       TSVECTOR
);

-- Indexes for common queries
CREATE INDEX idx_land_state_district ON land_records(state_code, district_code);
CREATE INDEX idx_land_survey ON land_records(survey_number, village_code);
CREATE INDEX idx_land_owner ON land_records(owner_aadhaar_hash);
CREATE INDEX idx_land_status ON land_records(status, dispute_status, encumbrance_status);
CREATE INDEX idx_land_boundary ON land_records USING GIST(boundary);
CREATE INDEX idx_land_search ON land_records USING GIN(search_vector);
CREATE INDEX idx_land_updated ON land_records(updated_at DESC);

-- Auto-update search vector
CREATE OR REPLACE FUNCTION update_land_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.survey_number, '') || ' ' ||
        COALESCE(NEW.owner_name, '') || ' ' ||
        COALESCE(NEW.village_code, '') || ' ' ||
        COALESCE(NEW.district_code, '') || ' ' ||
        COALESCE(NEW.registration_number, '')
    );
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_land_search_vector
    BEFORE INSERT OR UPDATE ON land_records
    FOR EACH ROW EXECUTE FUNCTION update_land_search_vector();

-- ============================================
-- OWNERSHIP HISTORY (Provenance Chain)
-- ============================================
CREATE TABLE ownership_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         VARCHAR(50) NOT NULL REFERENCES land_records(property_id),
    sequence_number     INTEGER NOT NULL,
    owner_aadhaar_hash  VARCHAR(64) NOT NULL,
    owner_name          VARCHAR(200) NOT NULL,
    acquisition_type    VARCHAR(20) NOT NULL,
    acquisition_date    DATE NOT NULL,
    sale_amount_paisa   BIGINT,
    stamp_duty_paisa    BIGINT,
    document_cid        VARCHAR(100),
    fabric_tx_id        VARCHAR(100) NOT NULL,
    algorand_tx_id      VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(property_id, sequence_number)
);

CREATE INDEX idx_history_property ON ownership_history(property_id, sequence_number);

-- ============================================
-- TRANSFERS
-- ============================================
CREATE TABLE transfers (
    transfer_id         VARCHAR(30) PRIMARY KEY,
    property_id         VARCHAR(50) NOT NULL REFERENCES land_records(property_id),
    seller_aadhaar_hash VARCHAR(64) NOT NULL,
    seller_name         VARCHAR(200) NOT NULL,
    buyer_aadhaar_hash  VARCHAR(64) NOT NULL,
    buyer_name          VARCHAR(200) NOT NULL,
    sale_amount_paisa   BIGINT NOT NULL,
    circle_rate_paisa   BIGINT NOT NULL,
    stamp_duty_paisa    BIGINT NOT NULL,
    registration_fee_paisa BIGINT NOT NULL,
    status              VARCHAR(40) NOT NULL,
    registered_by       VARCHAR(64) NOT NULL,
    fabric_tx_id        VARCHAR(100),
    cooling_period_ends TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ENCUMBRANCES
-- ============================================
CREATE TABLE encumbrances (
    encumbrance_id      VARCHAR(30) PRIMARY KEY,
    property_id         VARCHAR(50) NOT NULL REFERENCES land_records(property_id),
    type                VARCHAR(20) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    institution_name    VARCHAR(200) NOT NULL,
    loan_account_number VARCHAR(50),
    amount_paisa        BIGINT NOT NULL,
    outstanding_paisa   BIGINT,
    start_date          DATE NOT NULL,
    end_date            DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at         TIMESTAMPTZ
);

CREATE INDEX idx_enc_property ON encumbrances(property_id, status);

-- ============================================
-- DISPUTES
-- ============================================
CREATE TABLE disputes (
    dispute_id          VARCHAR(30) PRIMARY KEY,
    property_id         VARCHAR(50) NOT NULL REFERENCES land_records(property_id),
    type                VARCHAR(30) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'FILED',
    filed_by_hash       VARCHAR(64) NOT NULL,
    against_hash        VARCHAR(64) NOT NULL,
    court_name          VARCHAR(200),
    case_number         VARCHAR(50),
    filed_date          DATE NOT NULL,
    resolved_at         TIMESTAMPTZ,
    resolution          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispute_property ON disputes(property_id, status);

-- ============================================
-- AUDIT LOG (Append-only)
-- ============================================
CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_aadhaar_hash  VARCHAR(64) NOT NULL,
    actor_role          VARCHAR(30) NOT NULL,
    actor_ip            INET NOT NULL,
    actor_user_agent    TEXT,
    action              VARCHAR(50) NOT NULL,
    resource_type       VARCHAR(30) NOT NULL,
    resource_id         VARCHAR(50) NOT NULL,
    state_code          VARCHAR(5),
    previous_state      JSONB,
    new_state           JSONB,
    fabric_tx_id        VARCHAR(100),
    algorand_tx_id      VARCHAR(100),
    entry_hash          VARCHAR(64) NOT NULL,
    previous_entry_hash VARCHAR(64) NOT NULL
);

-- Audit log is append-only: REVOKE DELETE, UPDATE on audit_log
CREATE INDEX idx_audit_time ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_aadhaar_hash, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);

-- ============================================
-- ALGORAND ANCHORS (Tracking)
-- ============================================
CREATE TABLE algorand_anchors (
    anchor_id           VARCHAR(30) PRIMARY KEY,
    state_code          VARCHAR(5) NOT NULL,
    channel_id          VARCHAR(50) NOT NULL,
    fabric_block_start  BIGINT NOT NULL,
    fabric_block_end    BIGINT NOT NULL,
    state_root          VARCHAR(64) NOT NULL,
    transaction_count   INTEGER NOT NULL,
    algorand_tx_id      VARCHAR(100) NOT NULL,
    algorand_round      BIGINT NOT NULL,
    anchored_at         TIMESTAMPTZ NOT NULL,
    verified            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_anchor_state ON algorand_anchors(state_code, anchored_at DESC);

-- ============================================
-- USERS (Identity Cache)
-- ============================================
CREATE TABLE users (
    id                  VARCHAR(30) PRIMARY KEY,
    aadhaar_hash        VARCHAR(64) UNIQUE NOT NULL,
    name                VARCHAR(200) NOT NULL,
    role                VARCHAR(30) NOT NULL DEFAULT 'citizen',
    state_code          VARCHAR(5),
    district_code       VARCHAR(10),
    fabric_msp_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_aadhaar ON users(aadhaar_hash);
```

---

## 4. Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]
}

model LandRecord {
  propertyId        String   @id @map("property_id") @db.VarChar(50)
  surveyNumber      String   @map("survey_number") @db.VarChar(20)
  stateCode         String   @map("state_code") @db.VarChar(5)
  districtCode      String   @map("district_code") @db.VarChar(10)
  tehsilCode        String   @map("tehsil_code") @db.VarChar(10)
  villageCode       String   @map("village_code") @db.VarChar(10)
  areaSqMeters      Decimal  @map("area_sq_meters") @db.Decimal(15, 2)
  ownerAadhaarHash  String   @map("owner_aadhaar_hash") @db.VarChar(64)
  ownerName         String   @map("owner_name") @db.VarChar(200)
  ownershipType     String   @map("ownership_type") @db.VarChar(20)
  acquisitionType   String   @map("acquisition_type") @db.VarChar(20)
  acquisitionDate   DateTime @map("acquisition_date") @db.Date
  landUse           String   @map("land_use") @db.VarChar(30)
  status            String   @default("ACTIVE") @db.VarChar(30)
  disputeStatus     String   @default("CLEAR") @map("dispute_status") @db.VarChar(30)
  encumbranceStatus String   @default("CLEAR") @map("encumbrance_status") @db.VarChar(30)
  fabricTxId        String?  @map("fabric_tx_id") @db.VarChar(100)
  algorandAsaId     BigInt?  @map("algorand_asa_id")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  history       OwnershipHistory[]
  transfers     Transfer[]
  encumbrances  Encumbrance[]
  disputes      Dispute[]

  @@index([stateCode, districtCode])
  @@index([ownerAadhaarHash])
  @@index([status, disputeStatus])
  @@map("land_records")
}

model OwnershipHistory {
  id               String   @id @default(uuid())
  propertyId       String   @map("property_id") @db.VarChar(50)
  sequenceNumber   Int      @map("sequence_number")
  ownerAadhaarHash String   @map("owner_aadhaar_hash") @db.VarChar(64)
  ownerName        String   @map("owner_name") @db.VarChar(200)
  acquisitionType  String   @map("acquisition_type") @db.VarChar(20)
  acquisitionDate  DateTime @map("acquisition_date") @db.Date
  saleAmountPaisa  BigInt?  @map("sale_amount_paisa")
  fabricTxId       String   @map("fabric_tx_id") @db.VarChar(100)
  createdAt        DateTime @default(now()) @map("created_at")

  property LandRecord @relation(fields: [propertyId], references: [propertyId])

  @@unique([propertyId, sequenceNumber])
  @@map("ownership_history")
}

model Transfer {
  transferId         String    @id @map("transfer_id") @db.VarChar(30)
  propertyId         String    @map("property_id") @db.VarChar(50)
  sellerAadhaarHash  String    @map("seller_aadhaar_hash") @db.VarChar(64)
  buyerAadhaarHash   String    @map("buyer_aadhaar_hash") @db.VarChar(64)
  saleAmountPaisa    BigInt    @map("sale_amount_paisa")
  stampDutyPaisa     BigInt    @map("stamp_duty_paisa")
  status             String    @db.VarChar(40)
  fabricTxId         String?   @map("fabric_tx_id") @db.VarChar(100)
  coolingPeriodEnds  DateTime? @map("cooling_period_ends")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  property LandRecord @relation(fields: [propertyId], references: [propertyId])

  @@map("transfers")
}

model Encumbrance {
  encumbranceId   String    @id @map("encumbrance_id") @db.VarChar(30)
  propertyId      String    @map("property_id") @db.VarChar(50)
  type            String    @db.VarChar(20)
  status          String    @default("ACTIVE") @db.VarChar(20)
  institutionName String    @map("institution_name") @db.VarChar(200)
  amountPaisa     BigInt    @map("amount_paisa")
  startDate       DateTime  @map("start_date") @db.Date
  endDate         DateTime? @map("end_date") @db.Date
  createdAt       DateTime  @default(now()) @map("created_at")
  releasedAt      DateTime? @map("released_at")

  property LandRecord @relation(fields: [propertyId], references: [propertyId])

  @@map("encumbrances")
}

model Dispute {
  disputeId  String    @id @map("dispute_id") @db.VarChar(30)
  propertyId String    @map("property_id") @db.VarChar(50)
  type       String    @db.VarChar(30)
  status     String    @default("FILED") @db.VarChar(30)
  caseNumber String?   @map("case_number") @db.VarChar(50)
  filedDate  DateTime  @map("filed_date") @db.Date
  resolvedAt DateTime? @map("resolved_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  property LandRecord @relation(fields: [propertyId], references: [propertyId])

  @@map("disputes")
}

model AuditLog {
  id                String   @id @default(uuid())
  timestamp         DateTime @default(now())
  actorAadhaarHash  String   @map("actor_aadhaar_hash") @db.VarChar(64)
  actorRole         String   @map("actor_role") @db.VarChar(30)
  actorIp           String   @map("actor_ip") @db.VarChar(45)
  action            String   @db.VarChar(50)
  resourceType      String   @map("resource_type") @db.VarChar(30)
  resourceId        String   @map("resource_id") @db.VarChar(50)
  stateCode         String?  @map("state_code") @db.VarChar(5)
  previousState     Json?    @map("previous_state")
  newState          Json?    @map("new_state")
  fabricTxId        String?  @map("fabric_tx_id") @db.VarChar(100)
  entryHash         String   @map("entry_hash") @db.VarChar(64)
  previousEntryHash String   @map("previous_entry_hash") @db.VarChar(64)

  @@index([timestamp(sort: Desc)])
  @@index([actorAadhaarHash, timestamp(sort: Desc)])
  @@index([resourceId, timestamp(sort: Desc)])
  @@map("audit_log")
}
```

---

## 5. Status Enumerations

### LandRecord.status
`ACTIVE` → `TRANSFER_IN_PROGRESS` → `ACTIVE` (after transfer completes)
`ACTIVE` → `FROZEN` (court order) → `ACTIVE` (court releases)
`ACTIVE` → `GOVERNMENT_ACQUIRED` (acquisition proceedings)

### Transfer.status
`INITIATED` → `STAMP_DUTY_PENDING` → `STAMP_DUTY_PAID` → `SIGNATURES_PENDING` → `SIGNATURES_COMPLETE` → `REGISTERED_PENDING_FINALITY` → `REGISTERED_FINAL`
`REGISTERED_PENDING_FINALITY` → `OBJECTION_RAISED` → `UNDER_REVIEW` → `REGISTERED_FINAL` or `CANCELLED`

### Dispute.status
`FILED` → `UNDER_ADJUDICATION` → `RESOLVED_IN_FAVOR` or `RESOLVED_AGAINST` or `SETTLED`

### Encumbrance.status
`ACTIVE` → `RELEASED`

### Mutation.status
`AUTO_APPROVED` (for sale transfers — no manual step)
`PENDING_APPROVAL` → `APPROVED` or `REJECTED` (for inheritance, gift, etc.)