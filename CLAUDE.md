# CLAUDE.md — BhulekhChain: National Blockchain Property Register (India)

## Project Identity

- **Name**: BhulekhChain (भूलेख + Chain — "Land Record Chain")
- **Type**: Hybrid multi-chain national land registry platform
- **Architecture**: Option B — Fabric (core) + Algorand (verification) + Polygon (tokenization)
- **Target**: Government of India, State Revenue Departments, Citizens, Banks, Courts
- **Origin**: MP Raghav Chadha's Feb 10, 2026 parliamentary proposal for National Blockchain Property Register

---

## Architecture Overview (Option B: Balanced)

```
┌─────────────────────────────────────────────────────────────┐
│                    CITIZEN / BANK LAYER                      │
│  React Portal │ Flutter Mobile App │ Bank API │ DigiLocker   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     API GATEWAY (Kong)                        │
│            Rate Limiting · Auth · Load Balancing              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  MIDDLEWARE / BACKEND                         │
│  Node.js + Express │ Fabric SDK │ AlgoKit │ Ethers.js        │
│  ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Auth    │ │ Land     │ │ Anchoring  │ │ Tokenization │  │
│  │ Service │ │ Service  │ │ Service    │ │ Service      │  │
│  └─────────┘ └──────────┘ └────────────┘ └──────────────┘  │
└──────────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
    ┌──────▼───┐ ┌────▼────┐ ┌──▼───┐ ┌───▼────┐
    │ Fabric   │ │PostgreSQL│ │ IPFS │ │ Redis  │
    │ Network  │ │+ PostGIS │ │      │ │ Cache  │
    └──────────┘ └─────────┘ └──────┘ └────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │         PUBLIC CHAIN ANCHORING           │
    │  Algorand (State Proofs + ASAs)          │
    │  Polygon (ERC-721/1155 Tokenization)     │
    └─────────────────────────────────────────┘
```

### Three-Chain Responsibilities

| Chain | Role | Why |
|-------|------|-----|
| **Hyperledger Fabric 2.5+** | Core government registry. All land records, ownership transfers, mutations, encumbrances | Permissioned, no crypto dependency, data privacy via channels, government retains full control, NIC/MeitY already has expertise |
| **Algorand** | Public verification & citizen trust layer. State Proofs, title verification ASAs, bank API access | 10K+ TPS, instant finality, Python smart contracts, AlgoBharat India program, post-quantum roadmap, zero forks since 2019 |
| **Polygon PoS** | Tokenization & fractional ownership (Phase 3). ERC-721 title deed NFTs, ERC-1155 fractions | Largest EVM ecosystem, Indian-founded, LandBitt already doing Indian RE tokenization, massive Solidity dev pool |

---

## Tech Stack

### Blockchain Layer
- **Hyperledger Fabric 2.5+** — Core ledger (Go chaincode)
- **Algorand (AVM)** — Public anchoring (Python via PyTeal/Beaker or ARC-4)
- **Polygon PoS** — Tokenization (Solidity 0.8.x)

### Backend
- **Runtime**: Node.js 20 LTS + TypeScript
- **Framework**: Express.js (REST API) + Socket.io (real-time events)
- **Fabric SDK**: `@hyperledger/fabric-gateway` (new Gateway API, not legacy SDK)
- **Algorand SDK**: `algosdk` + `algokit-utils`
- **Polygon SDK**: `ethers.js` v6 (NOT web3.js — ethers is lighter, better typed)
- **Queue**: BullMQ (Redis-backed job queue for async anchoring)
- **Validation**: Zod (runtime schema validation)

### Frontend
- **Web Portal**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Mobile App**: Flutter 3.x (Dart) — offline-first with SQLite local cache
- **State Management**: Zustand (web) / Riverpod (Flutter)
- **Maps/GIS**: Mapbox GL JS (web) + flutter_map (mobile)

### Data Layer
- **Primary DB**: PostgreSQL 16 + PostGIS extension (spatial queries)
- **Cache**: Redis 7 (session, rate limiting, pub/sub)
- **Document Storage**: IPFS (Kubo node) for sale deeds, survey maps
- **Search**: OpenSearch (full-text search across land records)
- **GIS Server**: GeoServer (WMS/WFS for cadastral maps)

### Infrastructure
- **Containers**: Docker + Docker Compose (dev), Kubernetes (prod)
- **Cloud**: NIC/MeitY GovCloud (primary) + AWS GovCloud India (DR)
- **CI/CD**: GitHub Actions → ArgoCD (GitOps deployment)
- **Monitoring**: Prometheus + Grafana + Loki (logs)
- **Blockchain Explorer**: Hyperledger Explorer
- **Secret Management**: HashiCorp Vault

### Identity & Auth
- **Aadhaar eKYC**: UIDAI API (demographic + biometric)
- **DSC**: eSign API (CCA-approved digital signatures)
- **Auth**: Keycloak (OIDC/SAML) for internal users
- **JWT**: RS256 signed tokens with short-lived access + refresh pattern
- **RBAC**: Role-based access (Registrar, Tehsildar, Citizen, Bank, Court, Admin)

---

## Directory Structure

```
bhulekh-chain/
├── CLAUDE.md                          # THIS FILE — project brain
├── README.md                          # Project overview & quickstart
├── LICENSE                            # Apache 2.0
├── docs/                              # All documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── API_SPEC.md
│   ├── DATA_MODELS.md
│   ├── SMART_CONTRACTS.md
│   ├── INFRASTRUCTURE.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── ROADMAP.md
├── blockchain/
│   ├── fabric/
│   │   ├── network/
│   │   └── chaincode/
│   │       ├── land-registry/
│   │       └── stamp-duty/
│   ├── algorand/
│   │   ├── contracts/
│   │   ├── scripts/
│   │   └── tests/
│   └── polygon/
│       ├── contracts/
│       ├── scripts/
│       └── test/
├── backend/
│   └── src/
│       ├── config/
│       ├── services/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── jobs/
│       ├── utils/
│       ├── types/
│       └── schemas/
├── frontend/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── stores/
├── mobile/
│   └── lib/
│       ├── features/
│       ├── services/
│       └── models/
├── infrastructure/
│   ├── docker/
│   ├── k8s/
│   ├── terraform/
│   └── scripts/
├── scripts/
│   ├── data-migration/
│   └── analytics/
└── tests/
    ├── integration/
    └── e2e/
```

---

## Key Commands

```bash
# Start full dev environment
cd infrastructure && docker compose -f docker/docker-compose.dev.yaml up -d

# Deploy chaincode to dev Fabric network
cd blockchain/fabric && ./network/scripts/deploy-chaincode.sh land-registry

# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev

# Algorand localnet
cd blockchain/algorand && algokit localnet start && python scripts/deploy.py --network localnet

# Polygon compile & test
cd blockchain/polygon && npx hardhat compile && npx hardhat test

# Run all tests
npm run test:all
```

---

## Critical Business Rules (Encode in ALL Smart Contracts)

1. **No transfer if dispute flag active** — chaincode MUST check dispute status
2. **Stamp duty calculated before transfer** — use circle rate, not declared value (anti-benami)
3. **Mutation is automatic after registration** — NO separate application
4. **Minor's property requires court order** — additional validation
5. **NRI transfers require FEMA compliance check** — external API call
6. **Encumbrance check mandatory** — query all liens, mortgages, court orders before transfer
7. **Two-witness digital signatures required** — beyond buyer/seller
8. **72-hour cooling period** — window for objection before finality
9. **Never overwrite; always append** — full provenance trail
10. **Aadhaar mandatory** — no anonymous ownership

---

## Coding Standards

- **TypeScript strict mode** everywhere (backend + frontend)
- **Go** for Fabric chaincode — Effective Go + `golangci-lint`
- **Python 3.11+** for Algorand — type hints mandatory, `ruff` linting
- **Solidity 0.8.20+** for Polygon — `slither` static analysis, OpenZeppelin bases
- **All blockchain writes** must emit events
- **Every API endpoint**: Zod validation, RBAC check, audit log
- **No raw SQL** — Prisma ORM only
- **Financials in paisa** (BigInt) to avoid floating point
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- **PR requirements**: 1 approval, tests pass, lint clean, coverage ≥ 80%

---

## Environment Variables

```env
# Fabric
FABRIC_MSP_ID=RevenueOrgMSP
FABRIC_CHANNEL_NAME=land-registry-channel
FABRIC_CHAINCODE_NAME=land-registry
FABRIC_GATEWAY_PEER=peer0.revenue.bhulekhchain.gov.in:7051
FABRIC_CERT_PATH=/crypto/users/admin/msp
FABRIC_TLS_CERT_PATH=/crypto/peers/peer0/tls/ca.crt

# Algorand
ALGORAND_NETWORK=testnet
ALGORAND_ALGOD_URL=https://testnet-api.algonode.cloud
ALGORAND_INDEXER_URL=https://testnet-idx.algonode.cloud
ALGORAND_APP_ID=<deployed_app_id>
ALGORAND_ANCHOR_ACCOUNT_MNEMONIC=<25-word-mnemonic>

# Polygon
POLYGON_RPC_URL=https://polygon-amoy.drpc.org
POLYGON_TITLE_DEED_CONTRACT=0x...
POLYGON_DEPLOYER_PRIVATE_KEY=<key>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/bhulekhchain
REDIS_URL=redis://localhost:6379

# IPFS
IPFS_API_URL=http://localhost:5001
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs/

# Auth
AADHAAR_API_URL=https://stage1.uidai.gov.in/
AADHAAR_LICENSE_KEY=<key>
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=bhulekhchain
JWT_SECRET=<rsa-private-key-path>

# General
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
```

---

## AI Assistant Instructions

When working on this project, Claude should:

1. **Always check which layer** a feature belongs to — Fabric (core govt), Algorand (public verification), or Polygon (tokenization)
2. **Never store PII on public chains** — only hashed identifiers go to Algorand/Polygon
3. **Always emit chaincode events** for every state change
4. **Use Indian property law terminology**: mutation, encumbrance, circle rate, sub-registrar
5. **Think offline-first** for citizen-facing features — rural India has unreliable internet
6. **Every smart contract function must validate caller identity** via MSP (Fabric) or address (Algorand/Polygon)
7. **Data migration is the hardest problem** — expect dirty data, multiple formats, missing fields
8. **Test with realistic Indian data** — Indian names, Aadhaar format (12 digits), state-specific survey numbers
9. **All financial calculations in paisa** (BigInt)
10. **Consult docs/ folder** before implementing any major feature

---

## Quick Reference: Indian Land Record Terms

| English | Hindi | Usage in System |
|---------|-------|-----------------|
| Land record | भूलेख (Bhulekh) | Core entity |
| Record of Rights | खतौनी (Khatoni/RoR) | Ownership document |
| Plot map | खसरा (Khasra) | Survey/plot number |
| Mutation | दाखिल-खारिज (Dakhil-Kharij) | Ownership change entry |
| Circle rate | सर्किल रेट | Minimum valuation for stamp duty |
| Encumbrance | बोझ/भार (Bojh) | Mortgage/lien on property |
| Sub-registrar | उप-पंजीयक | Official who registers deeds |
| Tehsildar | तहसीलदार | Revenue officer for area |
| Survey number | सर्वे नंबर | Unique plot identifier |
| Sale deed | बिक्री पत्र (Bikri Patra) | Transfer document |
| Stamp duty | स्टांप ड्यूटी | State tax on transfer |