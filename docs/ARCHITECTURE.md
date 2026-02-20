# ARCHITECTURE.md — BhulekhChain System Architecture

## 1. Architecture Principles

1. **Government sovereignty first** — Core data never leaves permissioned infrastructure
2. **Citizen trust through transparency** — Public chain provides independent verification
3. **Offline resilience** — Rural India operates with intermittent connectivity
4. **State-level federation** — Each state operates semi-autonomously, national layer aggregates
5. **Append-only provenance** — Complete ownership history, no overwrites
6. **Privacy by design** — PII stays on Fabric; only hashes reach public chains
7. **Incremental adoption** — System must coexist with legacy (Oracle/Java) state systems

---

## 2. Layered Architecture

### Layer 0: Identity Foundation
```
┌──────────────────────────────────────────┐
│              IDENTITY LAYER              │
│                                          │
│  Aadhaar eKYC ──► Fabric MSP Enrollment  │
│  eSign (DSC)  ──► Transaction Signing    │
│  Keycloak     ──► Portal/API Auth        │
│                                          │
│  Identity Flow:                          │
│  Citizen ─► Aadhaar OTP ─► eKYC ─►      │
│  Generate X.509 cert ─► Enroll in MSP ─► │
│  Issue JWT with RBAC claims              │
└──────────────────────────────────────────┘
```

Every user (citizen, registrar, bank officer) is first authenticated via Aadhaar eKYC. Upon successful eKYC, the system:
- Generates an X.509 certificate tied to their Aadhaar hash (not raw Aadhaar)
- Enrolls this certificate in the appropriate Fabric MSP (Membership Service Provider)
- Issues a JWT with role claims for API access
- Stores identity metadata in Keycloak for session management

### Layer 1: Core Ledger (Hyperledger Fabric)
```
┌─────────────────────────────────────────────────────────────┐
│                 HYPERLEDGER FABRIC NETWORK                    │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Org: AP      │  │ Org: TG      │  │ Org: GJ      │  ...  │
│  │ Revenue Dept │  │ Revenue Dept │  │ Revenue Dept │         │
│  │              │  │              │  │              │         │
│  │ peer0  peer1 │  │ peer0  peer1 │  │ peer0  peer1 │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                               │
│  ┌──────────────────────────────────────────────────┐        │
│  │              ORDERER CLUSTER (Raft)               │        │
│  │     orderer0 (NIC) │ orderer1 (NIC) │ orderer2   │        │
│  └──────────────────────────────────────────────────┘        │
│                                                               │
│  CHANNELS:                                                    │
│  ├── national-registry    (all orgs — cross-state queries)    │
│  ├── ap-land-channel      (AP Revenue + AP Banks + AP Courts) │
│  ├── tg-land-channel      (TG Revenue + TG Banks + TG Courts) │
│  ├── bank-verification    (All Banks + National Registry)     │
│  └── court-disputes       (All Courts + National Registry)    │
│                                                               │
│  CHAINCODE:                                                   │
│  ├── land-registry v1.0   (installed on all state channels)   │
│  ├── stamp-duty v1.0      (installed per state — rates differ)│
│  └── cross-state v1.0     (national-registry channel only)    │
│                                                               │
│  STATE DB: CouchDB (enables rich JSON queries)                │
│  BLOCK SIZE: 100 txs or 2 seconds (whichever first)          │
│  ENDORSEMENT: Majority of org peers must endorse              │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- **One Fabric org per state** — Maps to India's federal structure. Each state controls its own peers and MSP
- **Raft ordering** — Not PBFT. Raft is simpler, battle-tested, sufficient for govt consortium (nodes are trusted)
- **CouchDB** — Not LevelDB. Rich JSON queries needed for complex land record searches (owner name, survey number, area, district)
- **Separate channels per state** — Privacy: AP records invisible to TG peers. National channel for cross-state verification only
- **Bank channel** — Banks verify titles without seeing full transaction details. They get: ownership status, encumbrance status, dispute status

### Layer 2: Backend Services (Node.js)
```
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND SERVICES                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    API GATEWAY (Kong)                  │    │
│  │  Rate Limit: 100/min citizen, 1000/min bank           │    │
│  │  Auth: JWT verification, API key for external          │    │
│  │  SSL Termination: TLS 1.3                              │    │
│  └───────────────────────┬──────────────────────────────┘    │
│                          │                                    │
│  ┌───────────┐ ┌─────────▼────────┐ ┌────────────────────┐  │
│  │ Auth      │ │ Land Service     │ │ Anchoring Service   │  │
│  │ Service   │ │                  │ │                     │  │
│  │           │ │ • registerLand() │ │ • anchorToAlgorand()│  │
│  │ • login() │ │ • transferOwner()│ │ • batchAnchor()     │  │
│  │ • eKYC()  │ │ • addEncumbrance │ │ • verifyProof()     │  │
│  │ • refresh()│ │ • flagDispute() │ │                     │  │
│  │ • logout()│ │ • searchRecords()│ │ Runs as BullMQ      │  │
│  └───────────┘ │ • getHistory()   │ │ worker — async      │  │
│                └──────────────────┘ └────────────────────┘  │
│                                                               │
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ Document Service   │ │ Notification Svc   │               │
│  │                    │ │                    │               │
│  │ • uploadToIPFS()   │ │ • sendSMS()        │               │
│  │ • getDocument()    │ │ • sendEmail()      │               │
│  │ • verifyHash()     │ │ • pushDigiLocker() │               │
│  └────────────────────┘ └────────────────────┘               │
│                                                               │
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ GIS Service        │ │ Tokenization Svc   │               │
│  │                    │ │ (Phase 3)          │               │
│  │ • getCadastralMap()│ │ • mintTitleNFT()   │               │
│  │ • validateBoundary │ │ • fractionalize()  │               │
│  │ • overlapCheck()   │ │ • distributeRent() │               │
│  └────────────────────┘ └────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**Service Communication:**
- Services communicate via in-process function calls (monolith-first, NOT microservices)
- Later can extract to microservices when scale demands it
- BullMQ handles async jobs: anchoring to Algorand, notifications, data sync
- Redis pub/sub for real-time updates to connected frontend clients

### Layer 3: Public Chain Anchoring (Algorand)
```
┌─────────────────────────────────────────────────────────────┐
│                 ALGORAND ANCHORING LAYER                     │
│                                                               │
│  WHAT GETS ANCHORED (every N minutes or M transactions):     │
│  ┌────────────────────────────────────────────────┐          │
│  │  AnchorPayload {                                │          │
│  │    fabricBlockRange: "1042-1089",               │          │
│  │    stateRoot: "sha256:a1b2c3...",               │          │
│  │    transactionCount: 47,                        │          │
│  │    timestamp: "2027-03-15T10:30:00Z",           │          │
│  │    stateCode: "AP",                             │          │
│  │    channelId: "ap-land-channel"                 │          │
│  │  }                                              │          │
│  └────────────────────────────────────────────────┘          │
│                                                               │
│  HOW IT'S ANCHORED:                                          │
│  1. Backend worker computes Merkle root of Fabric blocks     │
│  2. Creates Algorand transaction with AnchorPayload in note  │
│  3. Optionally mints an ASA (Algorand Standard Asset)        │
│     per title transfer for citizen-facing verification        │
│                                                               │
│  CITIZEN VERIFICATION FLOW:                                  │
│  Citizen ─► Mobile App ─► Queries Algorand Indexer ─►        │
│  Finds ASA for their property ─► Verifies hash matches ─►    │
│  Independent proof of ownership timestamp                     │
│                                                               │
│  BANK VERIFICATION FLOW:                                     │
│  Bank API ─► Algorand Indexer ─► Get title ASA ─►            │
│  Verify ownership + encumbrance status ─► Approve loan       │
│                                                               │
│  COST: ~₹0.08 per anchor tx (0.001 ALGO × ₹80/ALGO)        │
│  FREQUENCY: Every 5 minutes or every 50 transactions         │
└─────────────────────────────────────────────────────────────┘
```

### Layer 4: Tokenization (Polygon) — Phase 3

```
┌─────────────────────────────────────────────────────────────┐
│               POLYGON TOKENIZATION LAYER                     │
│                                                               │
│  ACTIVATED: Only after Asset Tokenization Bill passes        │
│                                                               │
│  TitleDeedNFT.sol (ERC-721)                                  │
│  ├── Minted by: Government admin multisig only               │
│  ├── Linked to: Fabric record hash + Algorand ASA ID         │
│  ├── Metadata: IPFS URI with property details                │
│  ├── Non-transferable by default (soulbound)                 │
│  └── Transfer requires: Fabric transfer tx + govt approval   │
│                                                               │
│  FractionalOwnership.sol (ERC-1155)                          │
│  ├── Created from: TitleDeedNFT (only eligible properties)   │
│  ├── Min investment: ₹5,000 per fraction                     │
│  ├── Rental distribution: Automatic via smart contract        │
│  ├── Trading: On approved DEXs only (KYC-gated)              │
│  └── Redemption: Full buyout possible at market price         │
│                                                               │
│  BRIDGE: Fabric ←→ Algorand ←→ Polygon                      │
│  Fabric tx hash → Algorand ASA → Polygon NFT metadata        │
│  Three-chain proof: Any party can verify across all layers    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow: Complete Transfer Scenario

```
STEP 1: INITIATION
Seller (Ramesh) + Buyer (Priya) visit sub-registrar
Sub-registrar opens web portal
    │
    ▼
STEP 2: IDENTITY VERIFICATION
Portal calls Auth Service → Aadhaar eKYC API
Both parties verified via OTP/biometric
System checks: Are both enrolled in Fabric MSP?
If not → Generate X.509 cert → Enroll in MSP
    │
    ▼
STEP 3: PRE-TRANSFER CHECKS (Land Service → Fabric)
Chaincode executes:
├── getPropertyByID(surveyNo) → Fetch current record
├── checkDisputeStatus() → Must be CLEAR
├── checkEncumbranceStatus() → Must be CLEAR or bank consent
├── validateOwnership(sellerAadhaarHash) → Must match current owner
├── calculateStampDuty(area, circleRate, state) → Return amount
└── checkCoolingPeriod() → No pending cooling period
    │
    ▼
STEP 4: DOCUMENT UPLOAD
Sale deed (PDF) uploaded → Document Service → IPFS
Returns: CID (content hash)
Survey map attached if available
    │
    ▼
STEP 5: STAMP DUTY PAYMENT
System integrates with SHCIL/state e-stamping
Stamp duty paid online → Receipt stored on IPFS
    │
    ▼
STEP 6: REGISTRATION (Fabric Chaincode)
transferOwnership() executes:
├── Creates new LandRecord with buyer as owner
├── Previous record marked status: "TRANSFERRED"
├── Mutation auto-triggered (dakhil-kharij created)
├── Encumbrance record updated (if mortgage transfer)
├── Witnesses' digital signatures verified
├── Transaction event emitted: "TRANSFER_COMPLETED"
├── Document hash (IPFS CID) stored in record
└── Endorsement: Majority of org peers sign
    │
    ▼
STEP 7: POST-REGISTRATION (Async via BullMQ)
├── Anchoring Job: Compute Merkle root → Publish to Algorand
│   ├── Create/update ASA for this property
│   └── Store: Fabric tx hash, new owner hash, timestamp
├── Notification Job:
│   ├── SMS to buyer + seller: "Registration complete"
│   ├── DigiLocker push: Sale deed available
│   └── Email to buyer with QR code verification link
└── Sync Job: Update PostgreSQL read replica for search
    │
    ▼
STEP 8: COOLING PERIOD (72 hours)
Status: "REGISTERED_PENDING_FINALITY"
Any party can raise objection via portal/app
If no objection → Status: "FINAL"
If objection → Status: "DISPUTED" → Routed to dispute resolution
    │
    ▼
STEP 9: VERIFICATION (Anytime after)
Citizen opens mobile app → Two verification modes:
├── Mode 1 (Govt): API → Backend → Fabric query → Official record
└── Mode 2 (Independent): App → Algorand Indexer → ASA lookup → Hash match
    │
    ▼
STEP 10: TOKENIZATION (Phase 3, if applicable)
If property eligible + owner opts in:
├── Government admin mints ERC-721 on Polygon
├── NFT metadata links to Fabric hash + Algorand ASA ID
└── Optional: Fractionalize into ERC-1155 tokens
```

---

## 4. Fabric Network Topology

### Development (Docker Compose)
```
2 Organizations:
  - RevenueOrg (State Revenue Department)
    - peer0.revenue.bhulekhchain.dev
    - peer1.revenue.bhulekhchain.dev
    - ca.revenue.bhulekhchain.dev
  - BankOrg (Banking consortium)
    - peer0.bank.bhulekhchain.dev
    - ca.bank.bhulekhchain.dev

1 Orderer Cluster (Raft, single node for dev):
  - orderer0.bhulekhchain.dev

2 Channels:
  - land-registry-channel (both orgs)
  - bank-verification-channel (BankOrg read-only)

State DB: CouchDB (1 per peer)
```

### Production (Kubernetes)
```
N Organizations (1 per participating state + national orgs):
  - RevenueOrg-AP, RevenueOrg-TG, RevenueOrg-GJ, ...
  - BankOrg-National (SBI, HDFC, ICICI consortium)
  - CourtOrg-National (High Courts)
  - NIC-Admin (Network administration)

3+ Orderer Nodes (Raft):
  - Hosted at NIC data centers in different regions
  - Raft leader election for fault tolerance

Channel per state + national channels:
  - ap-land-channel, tg-land-channel, gj-land-channel, ...
  - national-registry-channel (cross-state)
  - bank-verification-channel
  - court-disputes-channel

HSM Integration: Hardware Security Modules for orderer + peer signing keys
```

---

## 5. Database Strategy (PostgreSQL + PostGIS)

PostgreSQL serves as the **read-optimized mirror** of Fabric state. It is NOT the source of truth — Fabric is. PostgreSQL enables:
- Full-text search across millions of records
- GIS/spatial queries (find all properties within 5km of GPS coordinate)
- Analytics and reporting dashboards
- Faster reads than querying CouchDB through Fabric

**Sync mechanism:**
1. Fabric chaincode emits event on every state change
2. Backend event listener catches the event
3. Backend writes/updates the corresponding PostgreSQL row
4. If sync fails → Job goes to dead-letter queue → Manual reconciliation

**Conflict resolution:** Fabric is always authoritative. If PostgreSQL differs from Fabric state, PostgreSQL is resynced.

---

## 6. Offline Architecture (Flutter Mobile)

```
┌─────────────────────────────────────────┐
│           FLUTTER MOBILE APP             │
│                                          │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ SQLite      │  │ Sync Engine      │  │
│  │ Local Cache │  │                  │  │
│  │             │◄─┤ • Queue offline  │  │
│  │ • My props  │  │   actions        │  │
│  │ • Recent    │  │ • Sync when      │  │
│  │   searches  │  │   online         │  │
│  │ • Cached    │  │ • Conflict       │  │
│  │   maps      │  │   resolution     │  │
│  └─────────────┘  └──────────────────┘  │
│                                          │
│  OFFLINE CAPABLE:                        │
│  ✓ View own properties                   │
│  ✓ View cached search results            │
│  ✓ View downloaded cadastral maps        │
│  ✓ Prepare transfer documents            │
│  ✓ Verify via cached Algorand proofs     │
│                                          │
│  REQUIRES CONNECTIVITY:                  │
│  ✗ Submit new registrations              │
│  ✗ Execute ownership transfers           │
│  ✗ Real-time verification                │
│  ✗ Pay stamp duty                        │
└─────────────────────────────────────────┘
```

---

## 7. Integration Points

| External System | Integration Method | Purpose |
|----------------|-------------------|---------|
| Aadhaar (UIDAI) | REST API (eKYC) | Identity verification |
| DigiLocker | REST API (push) | Document delivery to citizens |
| SHCIL e-Stamping | REST API | Stamp duty payment |
| State Revenue DBs | DB adapter (JDBC/ODBC) | Legacy data migration |
| Court MIS (eCourts) | REST API / file exchange | Dispute status, court orders |
| Bank CBS | REST API (ISO 20022) | Mortgage/encumbrance updates |
| GeoServer | WMS/WFS | Cadastral map serving |
| Income Tax (Form 26AS) | REST API | Capital gains reporting |
| NIC SMS Gateway | HTTP API | SMS notifications |
| Pinata/Infura | REST API | IPFS pinning service |

---

## 8. Scalability Considerations

| Metric | Pilot (3 Districts) | State Scale | National Scale |
|--------|---------------------|-------------|----------------|
| Total Properties | ~500K | ~5M | ~320M |
| Daily Transactions | ~200 | ~5,000 | ~100,000 |
| Concurrent Users | ~100 | ~5,000 | ~500,000 |
| Fabric Peers | 4 | 8-12 | 50-100+ |
| Orderer Nodes | 1 | 3 | 5-7 |
| PostgreSQL | Single | Primary + 2 replicas | Sharded + Citus |
| Redis | Single | Sentinel (3 nodes) | Cluster (6+ nodes) |
| IPFS | Single Kubo | Cluster (3 nodes) | Pinata managed |
| Algorand Anchoring | Every 10 min | Every 5 min | Every 1 min |

**Fabric scaling strategy:** Add peers within orgs for read throughput. Add orderer nodes for write throughput. Use private data collections for large documents instead of putting them in world state.

---

## 9. Disaster Recovery

```
PRIMARY: NIC/MeitY GovCloud (Mumbai region)
  └── Fabric peers, orderers, PostgreSQL primary, Redis primary

DR: NIC GovCloud (Hyderabad region) OR AWS GovCloud India
  └── Fabric peer replicas, PostgreSQL streaming replica, Redis replica

BACKUP STRATEGY:
  ├── Fabric: Peer snapshots every 6 hours + orderer backup
  ├── PostgreSQL: WAL archiving + daily pg_dump to S3-compatible storage
  ├── IPFS: Pinata pinning (geographically distributed)
  ├── Redis: AOF persistence + RDB snapshots every 15 min
  └── Algorand/Polygon: Self-healing (public chains — data is always available)

RPO (Recovery Point Objective): 1 hour
RTO (Recovery Time Objective): 4 hours

Note: Public chain data (Algorand, Polygon) is inherently disaster-proof.
The Fabric ledger is the critical DR target.
```