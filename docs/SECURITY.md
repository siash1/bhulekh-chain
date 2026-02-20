# SECURITY.md — BhulekhChain Security Architecture

## 1. Threat Model

### Adversary Profiles

| Adversary | Motivation | Capability | Primary Attack Vectors |
|-----------|-----------|------------|----------------------|
| **Corrupt Registrar** | Bribery (₹700M annual market) | Insider access, valid credentials | Forge entries, backdate records, approve fraudulent transfers |
| **Land Mafia** | Property seizure, benami transactions | Hired hackers, forged documents, political connections | Identity fraud, document forgery, social engineering |
| **Rogue State Admin** | Political gain, data manipulation | Infrastructure access, database admin | Tamper Fabric state, alter PostgreSQL, disable anchoring |
| **External Hacker** | Data theft, ransomware | Network penetration, zero-day exploits | API exploitation, key theft, DDoS |
| **Insider (NIC/IT Staff)** | Bribery, blackmail | Server access, backup access | Direct DB manipulation, key extraction, log deletion |
| **Identity Thief** | Sell/mortgage someone else's property | Stolen Aadhaar, SIM swap | Impersonate owner, initiate fraudulent transfer |

### Crown Jewels (What We Protect)

1. **Land ownership records** — Source of truth for property rights
2. **Private keys** — MSP identities, orderer signing keys
3. **Aadhaar data** — Cannot be stored; only hashes retained
4. **Transaction history** — Provenance chain must be tamper-proof
5. **Document store** — Sale deeds, court orders on IPFS

---

## 2. Security Architecture Layers

### Layer 1: Identity & Access Security

```
AADHAAR eKYC FLOW (No Aadhaar Storage):
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Citizen  │────►│  BhulekhChain │────►│  UIDAI API  │
│  (OTP)    │     │  Auth Service │     │  (eKYC)     │
└──────────┘     └──────┬───────┘     └──────┬──────┘
                        │                      │
                        │◄─────────────────────┘
                        │  Returns: Name, DOB,
                        │  Photo, Address (encrypted)
                        │
                        ▼
              ┌──────────────────┐
              │  PROCESSING      │
              │                  │
              │  1. Generate     │
              │     aadhaarHash  │
              │     = SHA-256(   │
              │       aadhaar_no │
              │       + salt)    │
              │                  │
              │  2. DISCARD raw  │
              │     Aadhaar num  │
              │     IMMEDIATELY  │
              │                  │
              │  3. Store only:  │
              │     - aadhaarHash│
              │     - name       │
              │     - photo hash │
              └──────────────────┘
```

**CRITICAL RULE: Raw 12-digit Aadhaar numbers are NEVER stored anywhere in the system. Not in PostgreSQL, not in Fabric state, not in logs. Only the salted SHA-256 hash is retained. The salt is stored in HashiCorp Vault, separate from the application database.**

**Authentication Matrix:**

| Actor | Method | Session Duration | MFA |
|-------|--------|-----------------|-----|
| Citizen | Aadhaar OTP | 30 min | Aadhaar OTP itself |
| Sub-Registrar | Keycloak + DSC | 8 hours (shift) | Hardware DSC token |
| Tehsildar | Keycloak + DSC | 8 hours | Hardware DSC token |
| Bank Officer | API Key + mTLS | Per-request | Client certificate |
| Court System | API Key + mTLS | Per-request | Client certificate |
| System Admin | Keycloak + TOTP | 1 hour | TOTP (Google Auth) |

**RBAC Permission Matrix:**

| Operation | Citizen | Registrar | Tehsildar | Bank | Court | Admin |
|-----------|---------|-----------|-----------|------|-------|-------|
| View own property | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Search all properties | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Register new property | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve mutation | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Add encumbrance | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Flag dispute | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Verify title (public) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Verify via Algorand | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mint title NFT | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Layer 2: Fabric Network Security

```
TRANSPORT SECURITY:
┌────────────────────────────────────────────────┐
│  All Fabric communication uses mutual TLS      │
│                                                 │
│  Peer ←──mTLS──► Peer                          │
│  Peer ←──mTLS──► Orderer                       │
│  Client ←──TLS──► Peer (Gateway)               │
│                                                 │
│  TLS Version: 1.3 only                          │
│  Cipher: TLS_AES_256_GCM_SHA384                │
│  Certificate rotation: Every 90 days            │
└────────────────────────────────────────────────┘

MSP (Membership Service Provider):
┌────────────────────────────────────────────────┐
│  Each org has its own CA (Fabric CA)            │
│                                                 │
│  CA issues X.509 certificates to:               │
│  ├── Peers (node identity)                      │
│  ├── Orderers (node identity)                   │
│  ├── Admin users (enrollment cert)              │
│  └── Client apps (transaction signing)          │
│                                                 │
│  Certificate Attributes:                        │
│  ├── role: "registrar" | "tehsildar" | etc.     │
│  ├── stateCode: "AP" | "TG" | "GJ" | etc.      │
│  ├── districtCode: "522" | "500" | etc.         │
│  └── aadhaarHash: "sha256:..."                  │
│                                                 │
│  ABAC (Attribute-Based Access Control):         │
│  Chaincode reads cert attributes to enforce     │
│  that only AP registrars modify AP records      │
└────────────────────────────────────────────────┘
```

**Endorsement Policy (Anti-Corruption):**
```
# No single org can approve a transfer alone
# Requires: Revenue Dept peer + at least one independent peer
AND(
  'RevenueOrg.member',
  OR(
    'BankOrg.member',
    'CourtOrg.member',
    'NICOrg.member'
  )
)
```
This means a corrupt registrar CANNOT unilaterally forge a transfer — at least one bank, court, or NIC peer must also endorse it.

### Layer 3: Data Security

**Encryption at Rest:**
| Data Store | Encryption | Key Management |
|-----------|-----------|----------------|
| Fabric CouchDB | AES-256 (dm-crypt) | LUKS keys in Vault |
| PostgreSQL | TDE (pgcrypto) | Keys in Vault |
| Redis | No encryption (volatile cache) | N/A |
| IPFS Documents | AES-256-GCM before upload | Per-document keys in Vault |
| Backups | AES-256 (encrypted at rest) | Backup-specific keys in Vault |

**Encryption in Transit:**
| Path | Protocol | Min Version |
|------|----------|------------|
| Client → API Gateway | HTTPS (TLS) | TLS 1.3 |
| API Gateway → Backend | HTTP (internal, mTLS in prod) | TLS 1.2+ |
| Backend → Fabric | gRPC + mTLS | TLS 1.3 |
| Backend → PostgreSQL | SSL | TLS 1.2+ |
| Backend → Redis | TLS | TLS 1.2+ |
| Backend → Algorand | HTTPS | TLS 1.2+ |
| Backend → Polygon | HTTPS | TLS 1.2+ |

**PII Handling Rules:**

| Data Element | Fabric (Private) | PostgreSQL | Algorand (Public) | Polygon (Public) | IPFS |
|-------------|-----------------|-----------|-------------------|-----------------|------|
| Full Name | ✅ Stored | ✅ Stored | ❌ Never | ❌ Never | ❌ Never |
| Aadhaar Number | ❌ NEVER | ❌ NEVER | ❌ Never | ❌ Never | ❌ NEVER |
| Aadhaar Hash | ✅ Stored | ✅ Stored | ✅ As identifier | ❌ Never | ❌ Never |
| Property Details | ✅ Full | ✅ Full | ✅ Hash only | ✅ Hash only | ✅ Encrypted deed |
| Transaction Amount | ✅ Stored | ✅ Stored | ❌ Never | ❌ Never | ❌ Never |
| GPS Coordinates | ✅ Stored | ✅ Stored | ❌ Never | ❌ Never | ❌ Never |
| Document Content | ❌ Hash only | ❌ Hash only | ❌ Never | ❌ Hash only | ✅ Encrypted |

### Layer 4: Application Security

```
API SECURITY CHECKLIST:
┌─────────────────────────────────────────────────┐
│  ✅ Input validation (Zod schemas on ALL routes) │
│  ✅ SQL injection prevention (Prisma ORM only)   │
│  ✅ Rate limiting (100/min citizen, 1000/min API) │
│  ✅ CORS whitelist (govt domains only)            │
│  ✅ Content Security Policy (strict)              │
│  ✅ CSRF protection (SameSite cookies + token)    │
│  ✅ Request size limits (10MB max)                │
│  ✅ JWT with RS256 (not HS256)                    │
│  ✅ Short-lived tokens (15 min access, 7 day ref) │
│  ✅ Audit logging on EVERY write operation        │
│  ✅ File upload validation (type + size + scan)   │
│  ✅ No sensitive data in URLs or query params     │
│  ✅ Response headers: X-Frame-Options, HSTS, etc  │
│  ✅ Dependency scanning (npm audit, Snyk)         │
│  ✅ No secrets in code (Vault for all secrets)    │
└─────────────────────────────────────────────────┘
```

### Layer 5: Smart Contract Security

**Fabric Chaincode Security:**
```go
// EVERY chaincode function MUST:
func (s *LandContract) TransferOwnership(ctx contractapi.TransactionContextInterface, ...) error {
    // 1. Verify caller identity from MSP
    clientID, err := ctx.GetClientIdentity().GetID()
    
    // 2. Check ABAC: caller must be registrar for THIS state
    stateCode, _, _ := ctx.GetClientIdentity().GetAttributeValue("stateCode")
    if stateCode != property.StateCode {
        return fmt.Errorf("registrar from %s cannot modify %s records", stateCode, property.StateCode)
    }
    
    // 3. Check role
    role, _, _ := ctx.GetClientIdentity().GetAttributeValue("role")
    if role != "registrar" {
        return fmt.Errorf("only registrars can transfer ownership")
    }
    
    // 4. Business rule validation (disputes, encumbrances, etc.)
    // 5. State transition
    // 6. Emit event
}
```

**Solidity Security (Polygon):**
- Base contracts: OpenZeppelin Ownable, Pausable, ReentrancyGuard
- Access control: OpenZeppelin AccessControl with roles
- Upgradeability: UUPS proxy pattern (for bug fixes)
- Pre-deployment: Slither static analysis + manual review
- Post-deployment: Forta monitoring agents
- Emergency: Pausable circuit breaker (multisig only)

**Algorand Contract Security:**
- Stateless validation: Verify Fabric state root signatures
- No admin backdoors: Anchor contract is simple append-only
- Rate limiting: Max 1 anchor per minute per state
- Immutable after audit: No update capability once deployed

---

## 3. Audit Trail

Every action in the system generates an immutable audit record:

```typescript
interface AuditEntry {
  id: string;                    // UUID v7 (time-sortable)
  timestamp: string;             // ISO 8601
  actor: {
    aadhaarHash: string;         // WHO
    role: string;                // What role
    ipAddress: string;           // From where
    userAgent: string;           // What device
  };
  action: string;                // WHAT (e.g., "TRANSFER_INITIATED")
  resource: {
    type: string;                // Land record, encumbrance, etc.
    id: string;                  // Property ID / Survey No
    stateCode: string;           // Which state
  };
  details: {
    previousState: object;       // State before action
    newState: object;            // State after action
    fabricTxId: string;          // Fabric transaction ID
    algorandTxId?: string;       // Algorand tx ID (if anchored)
  };
  integrity: {
    hash: string;                // SHA-256 of entire entry
    previousHash: string;        // Hash of previous audit entry (chain)
  };
}
```

**Audit storage:** Dual-write to PostgreSQL (searchable) + append-only file on WORM storage (tamper-proof).

**Audit entries are NEVER deletable.** Not even by system admins. The audit chain's integrity is independently verifiable.

---

## 4. Key Management

```
┌─────────────────────────────────────────────────────┐
│                 HASHICORP VAULT                      │
│                                                      │
│  Secret Engines:                                     │
│  ├── kv/v2: Static secrets                           │
│  │   ├── aadhaar-salt                                │
│  │   ├── jwt-rsa-private-key                         │
│  │   ├── ipfs-encryption-master-key                  │
│  │   └── algorand-anchor-mnemonic (encrypted)        │
│  │                                                   │
│  ├── pki: X.509 certificate management               │
│  │   ├── Fabric CA intermediate certs                │
│  │   ├── mTLS client certificates                    │
│  │   └── Auto-rotation policies                      │
│  │                                                   │
│  └── transit: Encryption-as-a-service                │
│      ├── document-encryption-key                     │
│      ├── pii-encryption-key                          │
│      └── backup-encryption-key                       │
│                                                      │
│  Access Policies:                                    │
│  ├── backend-service: read kv/, use transit/         │
│  ├── fabric-admin: read pki/, manage fabric certs    │
│  ├── anchoring-worker: read algorand mnemonic only   │
│  └── backup-service: read backup key only            │
│                                                      │
│  Auth Methods:                                       │
│  ├── Kubernetes (service account auth)               │
│  ├── AppRole (for CI/CD)                             │
│  └── OIDC (for human admins via Keycloak)            │
│                                                      │
│  HA: 3-node Raft cluster                             │
│  Seal: Auto-unseal via AWS KMS (or NIC HSM)          │
└─────────────────────────────────────────────────────┘
```

**Key Rotation Schedule:**
| Key Type | Rotation Period | Method |
|----------|----------------|--------|
| JWT signing key (RSA) | 30 days | Vault auto-rotation, old key valid for 24h grace |
| Fabric MSP user certs | 1 year | Re-enrollment via Fabric CA |
| Fabric TLS certs | 90 days | Auto-rotation via cert-manager |
| Aadhaar salt | Never (changing breaks all hashes) | Stored in Vault with break-glass only |
| IPFS encryption key | Per-document (unique DEK) | KEK in Vault, DEK per document |
| Algorand account | Rekey annually | Algorand native rekey feature |
| Polygon deployer key | After each deployment | New key per contract version |
| Database encryption key | 1 year | pgcrypto key rotation |

---

## 5. Network Security

```
NETWORK ZONES:
┌───────────────────────────────────────────────────────┐
│  ZONE 1: DMZ (Public-facing)                          │
│  ├── Kong API Gateway                                 │
│  ├── Next.js Frontend (CDN-served)                    │
│  └── WAF (Web Application Firewall)                   │
│      Rules: OWASP Top 10, rate limiting, geo-blocking │
├───────────────────────────────────────────────────────┤
│  ZONE 2: Application (Private subnet)                 │
│  ├── Node.js Backend pods                             │
│  ├── BullMQ Workers                                   │
│  ├── Redis                                            │
│  └── Keycloak                                         │
├───────────────────────────────────────────────────────┤
│  ZONE 3: Blockchain (Restricted subnet)               │
│  ├── Fabric Peers                                     │
│  ├── Fabric Orderers                                  │
│  ├── Fabric CAs                                       │
│  ├── CouchDB (state database)                         │
│  └── Hyperledger Explorer                             │
├───────────────────────────────────────────────────────┤
│  ZONE 4: Data (Most restricted subnet)                │
│  ├── PostgreSQL + PostGIS                             │
│  ├── IPFS Node                                        │
│  ├── HashiCorp Vault                                  │
│  └── Backup Storage (WORM)                            │
├───────────────────────────────────────────────────────┤
│  ZONE 5: External (Outbound only)                     │
│  ├── Algorand API (outbound HTTPS only)               │
│  ├── Polygon RPC (outbound HTTPS only)                │
│  ├── UIDAI Aadhaar API (outbound HTTPS only)          │
│  └── SHCIL e-Stamping (outbound HTTPS only)           │
└───────────────────────────────────────────────────────┘

FIREWALL RULES:
- Zone 1 → Zone 2: Only via Kong (port 8000/8443)
- Zone 2 → Zone 3: Only gRPC (port 7051) + CouchDB (port 5984)
- Zone 2 → Zone 4: Only PostgreSQL (5432) + Redis (6379) + IPFS (5001)
- Zone 3 → Zone 3: Peer gossip (7051) + orderer (7050) only between known IPs
- Zone 4: No inbound from Zone 1. No internet access.
- Zone 5: Outbound HTTPS only. No inbound.
```

---

## 6. Incident Response

### Severity Classification

| Level | Description | Example | Response Time |
|-------|------------|---------|---------------|
| **P0 — Critical** | Data integrity compromised | Unauthorized ownership change detected | Immediate (15 min) |
| **P1 — High** | Service unavailable | Fabric network down, API unresponsive | 30 minutes |
| **P2 — Medium** | Partial degradation | Algorand anchoring delayed, slow queries | 4 hours |
| **P3 — Low** | Minor issue | UI bug, non-critical log errors | 24 hours |

### P0 Response: Suspected Ledger Tampering

```
STEP 1: DETECT (Automated)
├── Monitoring compares Fabric state root vs Algorand anchor
├── If mismatch detected → P0 alert fires
└── Alert → PagerDuty → On-call SRE + Security Lead + Legal

STEP 2: CONTAIN (Within 15 min)
├── Pause all write operations (Kong rate limit to 0)
├── Freeze affected state's Fabric channel
├── Snapshot current Fabric state + CouchDB
├── Preserve all logs (prevent rotation/deletion)
└── Revoke suspected compromised credentials

STEP 3: INVESTIGATE (Within 2 hours)
├── Compare Fabric ledger vs Algorand anchors block-by-block
├── Identify exact block range where divergence began
├── Trace transaction to specific MSP identity (who signed it?)
├── Correlate with audit logs (IP, timestamp, user agent)
├── Check if PostgreSQL mirror matches Fabric or diverges
└── Determine: Was it Fabric tampered or Algorand?

STEP 4: REMEDIATE
├── If Fabric was tampered:
│   ├── Restore from last known-good Algorand-verified state
│   ├── Replay legitimate transactions since restore point
│   └── File FIR with cybercrime cell
├── If anchoring service bug:
│   ├── Fix anchoring service
│   ├── Re-anchor correct state roots
│   └── No ledger restoration needed
└── Post-incident: Mandatory security review + report

STEP 5: RECOVER
├── Re-enable writes after verification
├── Full re-anchor to Algorand
├── Notify affected parties
└── File incident report with CERT-In (mandatory for govt systems)
```

---

## 7. Compliance & Regulatory

| Regulation | Requirement | BhulekhChain Compliance |
|-----------|------------|------------------------|
| **DPDPA 2023** (Data Protection) | Right to erasure, data minimization | PII on Fabric only (can be removed from world state; blockchain history immutable but encrypted) |
| **IT Act 2000 s.65B** | Electronic records as evidence | Fabric chaincode event + Algorand anchor = dual evidence chain |
| **Registration Act 1908** | Physical presence for registration | Maintained: digital system augments, doesn't replace sub-registrar |
| **Indian Evidence Act s.85B** | Secure electronic records presumption | Blockchain provides secure system per s.85B requirements |
| **RBI Digital Lending Guidelines** | Bank access to property verification | Bank channel with read-only access, audit trail |
| **CERT-In Directions 2022** | 6-hour incident reporting | Automated CERT-In notification on P0/P1 incidents |
| **GIGW 3.0** | Government website standards | Frontend follows GIGW accessibility + design guidelines |
| **STQC** | Quality standards for govt software | Testing as per STQC guidelines, penetration testing |

### DPDPA Right-to-Erasure vs Blockchain Immutability

This is the hardest compliance challenge. Our approach:

1. **Fabric world state** (current state): PII CAN be deleted from CouchDB world state
2. **Fabric block history**: Cannot be deleted. But PII in historical blocks is encrypted with a per-user key
3. **To "erase"**: Delete from world state + destroy the per-user encryption key → historical blocks become unreadable
4. **Algorand**: Only hashes stored → no PII to erase
5. **PostgreSQL**: Standard DELETE/GDPR process
6. **IPFS**: Encrypted documents → destroy encryption key → document becomes unreadable (IPFS pins can be removed)

This "crypto-shredding" approach is the industry-accepted method for GDPR/DPDPA compliance with blockchain systems.

---

## 8. Security Testing Requirements

| Test Type | Frequency | Tool/Method | Scope |
|-----------|-----------|-------------|-------|
| Static Analysis (SAST) | Every PR | Snyk, ESLint security rules | All code |
| Dependency Scanning | Daily | npm audit, Snyk, Dependabot | All packages |
| Chaincode Review | Every version | Manual + `golangci-lint` security rules | Go chaincode |
| Solidity Audit | Before deployment | Slither + manual (external auditor) | Polygon contracts |
| Penetration Testing | Quarterly | CERT-In empanelled auditor | Full stack |
| Fabric Network Pentest | Bi-annually | Specialized blockchain security firm | Fabric infra |
| Load Testing | Before each release | k6 / Artillery | API + Fabric |
| Chaos Engineering | Monthly | Chaos Mesh (K8s) | Infra resilience |
| Key Rotation Drill | Quarterly | Manual procedure | All key types |
| DR Failover Test | Bi-annually | Full failover to DR site | Entire system |
| Social Engineering Test | Annually | Red team exercise | Staff awareness |