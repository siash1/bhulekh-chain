# ROADMAP.md -- BhulekhChain National Blockchain Property Register

## Vision

Transform India's land registry system into a tamper-proof, transparent, and citizen-friendly platform using blockchain technology. Eliminate land fraud, reduce registration time from weeks to hours, and provide independent title verification through public chain anchoring.

---

## Phase 1: Foundation (Months 1-12)

**Goal**: Prove the system works in 3 pilot districts across 3 states.

### Scope
- 3 pilot districts: Guntur (AP), Pune (MH), Gandhinagar (GJ)
- Core Fabric network with Revenue Org and Bank Org peers
- land-registry and stamp-duty chaincodes deployed
- Backend API with full land record CRUD, transfer, and mutation flows
- PostgreSQL read mirror with PostGIS for spatial queries
- Citizen web portal for property search and verification
- Algorand anchoring for public verification layer
- Aadhaar eKYC integration for citizen authentication
- Sub-registrar portal for property registration and transfers
- Basic encumbrance management (mortgage add/release)
- IPFS document storage for sale deeds and survey maps
- Hyperledger Explorer for Fabric network monitoring

### Milestones

| Month | Milestone | Deliverable |
|-------|-----------|-------------|
| 1-2 | Infrastructure & Dev Environment | Docker Compose dev setup, CI/CD pipeline, Fabric test network |
| 3-4 | Core Chaincode Development | land-registry chaincode with registration, transfer, mutation, encumbrance |
| 5-6 | Backend API & Database | REST API, Prisma schema, PostgreSQL mirror sync, Redis caching |
| 7-8 | Algorand Integration | State proof anchoring contract, ASA title certificates, verification API |
| 9-10 | Frontend & Auth | Next.js citizen portal, Keycloak setup, Aadhaar eKYC integration |
| 11 | Data Migration (Pilot Districts) | ETL pipeline for existing land records from state databases |
| 12 | Pilot Launch | Go-live in 3 districts, monitoring, feedback collection |

### Success Criteria
- 100,000+ land records migrated from existing state systems
- Average registration time under 2 hours (vs current 7-30 days)
- Zero data integrity incidents detected via Algorand anchoring
- Sub-registrar adoption rate above 80% in pilot districts
- Citizen satisfaction score above 4.0/5.0 in feedback surveys

### Key Risks
- Data migration quality: existing records have inconsistent formats, missing fields, duplicate entries
- Sub-registrar resistance to workflow change
- Aadhaar API reliability in rural areas
- Internet connectivity in tehsil offices

---

## Phase 2: State Expansion (Months 13-24)

**Goal**: Scale to 5 full states with 100+ districts, add bank and court integrations.

### Scope
- Expand to 5 states: Andhra Pradesh, Maharashtra, Gujarat, Telangana, Rajasthan
- 100+ districts with full data migration
- Bank integration (SBI, HDFC, ICICI) for mortgage verification via API
- Court integration for dispute flagging and freeze orders
- Mobile app (Flutter) with offline-first capability for rural citizens
- Advanced search with GIS/map-based property lookup
- Webhook system for bank and court real-time notifications
- Multi-language support (Hindi, Telugu, Marathi, Gujarati, English)
- Stamp duty calculator with state-specific circle rates
- Dispute management module with court order tracking
- Performance optimization for 10,000+ concurrent users
- Disaster recovery setup with NIC GovCloud secondary site

### Milestones

| Month | Milestone | Deliverable |
|-------|-----------|-------------|
| 13-14 | State Onboarding Framework | Automated state onboarding toolkit, configurable state-specific rules |
| 15-16 | Bank & Court Integration | mTLS API for banks, court order processing, webhook system |
| 17-18 | Mobile App Launch | Flutter app with offline sync, biometric auth, property verification |
| 19-20 | GIS Integration | GeoServer setup, cadastral map overlay, boundary visualization |
| 21-22 | Data Migration (5 States) | 10M+ records migrated, data quality verification, reconciliation |
| 23-24 | Production Hardening | Load testing, security audit, DR drills, CERT-In certification |

### Success Criteria
- 10 million+ land records on-chain across 5 states
- Bank mortgage verification time under 24 hours (vs current 15-30 days)
- Court dispute flagging reflected in real-time on property records
- Mobile app downloads exceeding 500,000
- System uptime of 99.9% (measured over rolling 30-day window)
- Zero successful tampering attempts (verified via Algorand cross-checks)

### Key Risks
- State-level political buy-in and legislative changes needed
- Scaling Fabric network across geographically distributed sites
- Integration with diverse state revenue department IT systems
- Rural mobile network coverage for offline sync

---

## Phase 3: National Rollout + Tokenization (Months 25-42)

**Goal**: Expand to 15+ states, introduce property tokenization on Polygon, and enable fractional ownership.

### Scope
- 15+ states with 500+ districts
- Polygon integration for ERC-721 title deed NFTs
- ERC-1155 fractional ownership tokens for commercial properties
- RERA integration for under-construction property tracking
- NRI property management with FEMA compliance checks
- Advanced analytics dashboard for government decision-making
- Inter-state property transfer support
- Property tax integration with municipal corporations
- Land consolidation and subdivision tracking
- Integration with DigiLocker for digital document access
- API marketplace for third-party property-tech applications

### Milestones

| Month | Milestone | Deliverable |
|-------|-----------|-------------|
| 25-27 | Polygon Tokenization | TitleDeedNFT contract deployment, government-approved minting flow |
| 28-30 | Fractional Ownership | FractionalOwnership contract, investor portal, rental distribution |
| 31-33 | National Scale Data Migration | 50M+ records across 15 states, automated migration pipeline |
| 34-36 | RERA & NRI Integration | Under-construction tracking, FEMA compliance API, NRI portal |
| 37-39 | Analytics & API Platform | Government dashboard, open API for property-tech ecosystem |
| 40-42 | Security Audit & Compliance | STQC certification, penetration testing, DPDPA compliance audit |

### Success Criteria
- 50 million+ land records on-chain
- 10,000+ tokenized property title deeds on Polygon
- Fractional ownership pilot for 100+ commercial properties
- Third-party API adoption by 50+ property-tech companies
- STQC and CERT-In certification obtained
- Stamp duty revenue increase of 15% due to reduced evasion (anti-benami)

### Key Risks
- Regulatory clarity on tokenized real estate
- Gas costs on Polygon for large-scale minting
- Coordination across 15+ state revenue departments
- DPDPA compliance for blockchain immutability (crypto-shredding approach)

---

## Phase 4: Full National Coverage (Months 43-60)

**Goal**: All 28 states and 8 union territories on a unified national land registry blockchain.

### Scope
- All 28 states and 8 UTs with 700+ districts
- Full national interoperability for property verification
- Integration with national infrastructure: GSTN (tax), CERSAI (central registry), SCORES
- AI/ML-powered fraud detection and anomaly identification
- Satellite imagery integration for boundary verification
- Smart contract-based automatic property tax collection
- Cross-border property verification for international transactions
- Complete replacement of physical sub-registrar office workflows
- National property index and valuation database
- Open data portal for researchers and policy makers

### Milestones

| Month | Milestone | Deliverable |
|-------|-----------|-------------|
| 43-46 | Remaining State Onboarding | All states migrated, state-specific customizations |
| 47-50 | National Integration | GSTN, CERSAI, DigiLocker full integration, unified search |
| 51-54 | AI/ML & Satellite | Fraud detection models, satellite boundary verification |
| 55-57 | Legacy System Sunset | Phase out paper-based processes in pilot states |
| 58-60 | National Go-Live | Full national coverage announcement, public launch |

### Success Criteria
- 200 million+ land records (covering all surveyed land in India)
- Average property registration time under 30 minutes nationally
- Land fraud reduction of 50% (measured against pre-BhulekhChain baseline)
- Property dispute resolution time reduced by 40%
- 100% digital workflow (zero paper) in Phase 1 pilot districts
- International recognition as model for blockchain land registry

### Key Risks
- Sustaining political will across multiple government terms
- Technology evolution (need to stay current with blockchain advancements)
- Legacy data quality in states with minimal digitization
- Ensuring equitable access for citizens without smartphones or internet

---

## Technology Evolution Plan

| Timeline | Technology Decision |
|----------|-------------------|
| Year 1 | Fabric 2.5, Algorand AVM, Polygon PoS |
| Year 2 | Evaluate Fabric 3.0, Algorand post-quantum features, Polygon zkEVM |
| Year 3 | Consider L2 solutions for Polygon, evaluate newer consensus mechanisms |
| Year 4 | Assess next-generation blockchain platforms, potential migration paths |
| Year 5 | Full technology review and modernization roadmap |

---

## Budget Estimates (High-Level)

| Phase | Duration | Estimated Cost (INR Cr) | Primary Spend |
|-------|----------|------------------------|---------------|
| Phase 1 | 12 months | 25-35 | Development, infrastructure, pilot operations |
| Phase 2 | 12 months | 60-80 | State expansion, integrations, mobile app |
| Phase 3 | 18 months | 100-150 | National scale, tokenization, compliance |
| Phase 4 | 18 months | 150-200 | Full coverage, AI/ML, legacy sunset |
| **Total** | **60 months** | **335-465** | |

These estimates include development, infrastructure, data migration, training, and operations. Actual costs depend on NIC/MeitY cloud pricing, state government contributions, and vendor negotiations.

---

## Governance

- **Steering Committee**: MeitY, Ministry of Rural Development, 5 pilot state IT secretaries
- **Technical Advisory Board**: NIC, IIT blockchain research labs, Hyperledger India Chapter, AlgoBharat
- **Open Source**: Core platform open-sourced under Apache 2.0 after Phase 1 security audit
- **Community**: Developer community engagement via GitHub, quarterly hackathons, annual BhulekhChain Summit
