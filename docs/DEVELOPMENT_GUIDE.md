# DEVELOPMENT_GUIDE.md — BhulekhChain Developer Handbook

## 1. Getting Started

### init & Setup
```bash
https://github.com/siash1/bhulekh-chain
```

### Verify Setup
```bash
# Check Fabric network
docker ps | grep hyperledger          # Should see peers, orderer, CAs, CouchDB
curl http://localhost:8080            # Fabric Explorer

# Check backend
curl http://localhost:3001/v1/admin/health

# Check frontend
curl http://localhost:3000

# Check Algorand
algokit localnet status

# Check PostgreSQL
psql -h localhost -U bhulekh -d bhulekhchain -c "SELECT COUNT(*) FROM land_records;"
```

---

## 2. Git Workflow

### Branch Strategy
```
main          ← Production releases (protected, requires 2 approvals)
├── develop   ← Integration branch (requires 1 approval)
│   ├── feat/BK-123-add-transfer-api
│   ├── fix/BK-456-stamp-duty-calculation
│   ├── refactor/BK-789-optimize-query
│   └── docs/BK-012-update-api-spec
└── hotfix/BK-999-critical-fix  ← Direct to main for emergencies
```

### Commit Convention
```
feat(chaincode): add encumbrance validation to transfer flow
fix(backend): correct stamp duty calculation for Maharashtra
docs(api): update transfer endpoint response schema
refactor(frontend): extract property card into reusable component
test(integration): add algorand anchoring flow tests
chore(deps): upgrade @hyperledger/fabric-gateway to 1.5.0
perf(query): add composite index for owner+district search

# Format: type(scope): description
# Types: feat, fix, docs, refactor, test, chore, perf, ci
# Scope: chaincode, backend, frontend, mobile, algorand, polygon, infra, docs
```

### PR Template
```markdown
## What
Brief description of what this PR does.

## Why
Link to ticket: BK-123

## How
Technical approach taken.

## Checklist
- [ ] Tests added/updated
- [ ] Docs updated if needed
- [ ] No PII in logs or test data
- [ ] Chaincode events emitted for state changes
- [ ] Zod schema added for new API endpoints
- [ ] RBAC enforced on new endpoints
- [ ] Audit log entry created for write operations
- [ ] Works offline (if citizen-facing feature)

## Screenshots (if UI changes)
```

---

## 3. Coding Standards

### TypeScript (Backend + Frontend)

```typescript
// ✅ DO: Use strict TypeScript
// tsconfig.json: "strict": true, "noUncheckedIndexedAccess": true

// ✅ DO: Use Zod for runtime validation
import { z } from 'zod';

export const TransferInitSchema = z.object({
  propertyId: z.string().regex(/^[A-Z]{2}-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}-\d+(-\w+)?$/),
  seller: z.object({
    aadhaarHash: z.string().length(64),
  }),
  buyer: z.object({
    aadhaarHash: z.string().length(64),
    name: z.string().min(1).max(200),
  }),
  saleAmount: z.number().int().positive(), // Always paisa (BigInt in DB)
  witnesses: z.array(z.object({
    aadhaarHash: z.string().length(64),
    name: z.string().min(1).max(200),
  })).length(2),
});

// ✅ DO: Type function returns explicitly
async function getProperty(propertyId: string): Promise<LandRecord | null> { ... }

// ✅ DO: Use early returns for validation
async function transferOwnership(req: Request, res: Response): Promise<void> {
  const parsed = TransferInitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
    return;
  }
  // ... proceed with valid data
}

// ❌ DON'T: Use `any`
// ❌ DON'T: Use string concatenation for SQL (use Prisma)
// ❌ DON'T: Store raw Aadhaar numbers anywhere
// ❌ DON'T: Use console.log (use the pino logger)
// ❌ DON'T: Catch errors silently
```

### Go (Fabric Chaincode)

```go
// ✅ DO: Always check errors
bytes, err := ctx.GetStub().GetState(key)
if err != nil {
    return fmt.Errorf("failed to read state for %s: %w", key, err)
}
if bytes == nil {
    return fmt.Errorf("LAND_NOT_FOUND: property %s does not exist", key)
}

// ✅ DO: Validate caller identity in every write function
func (s *SmartContract) anyWriteFunction(ctx contractapi.TransactionContextInterface, ...) error {
    clientIdentity := ctx.GetClientIdentity()
    mspID, _ := clientIdentity.GetMSPID()
    role, found, _ := clientIdentity.GetAttributeValue("role")
    if !found {
        return fmt.Errorf("ACCESS_DENIED: missing role attribute")
    }
    // ... validate role is appropriate for this function
}

// ✅ DO: Always emit events on state changes
event := map[string]string{
    "type":       "TRANSFER_COMPLETED",
    "propertyId": propertyId,
    "txId":       ctx.GetStub().GetTxID(),
}
eventJSON, _ := json.Marshal(event)
ctx.GetStub().SetEvent("TRANSFER_COMPLETED", eventJSON)

// ✅ DO: Use composite keys for efficient range queries
key, _ := ctx.GetStub().CreateCompositeKey("LAND", []string{stateCode, districtCode, surveyNo})

// ❌ DON'T: Use global variables (chaincode is stateless between invocations)
// ❌ DON'T: Make external API calls from chaincode (non-deterministic)
// ❌ DON'T: Use random numbers or system time (use ctx.GetStub().GetTxTimestamp())
// ❌ DON'T: Store large documents in world state (use IPFS, store hash)
```

### Python (Algorand Contracts)

```python
# ✅ DO: Use type hints everywhere
def anchor_state(
    state_code: str,
    state_root: bytes,
    block_range: tuple[int, int],
) -> int:
    ...

# ✅ DO: Use AlgoKit for testing
from algokit_utils.beta.algorand_client import AlgorandClient

# ✅ DO: Validate inputs in contracts
assert len(state_root) == 32, "State root must be 32 bytes (SHA-256)"

# ❌ DON'T: Store PII in Algorand transaction notes
# ❌ DON'T: Use raw py-algorand-sdk when AlgoKit wrappers exist
```

### Solidity (Polygon)

```solidity
// ✅ DO: Use OpenZeppelin base contracts
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// ✅ DO: Use custom errors (gas efficient)
error Unauthorized(address caller, bytes32 requiredRole);
error PropertyAlreadyTokenized(string propertyId);

// ✅ DO: Use NatSpec documentation
/// @notice Mint a new title deed NFT
/// @param owner The address of the property owner
/// @param propertyId BhulekhChain property identifier
/// @return tokenId The newly minted token ID

// ✅ DO: Use ReentrancyGuard on functions that transfer value
function claimRental(uint256 propertyId) external nonReentrant { ... }

// ✅ DO: Add events for every state change
event TitleMinted(uint256 indexed tokenId, string propertyId);

// ❌ DON'T: Use tx.origin for auth (use msg.sender)
// ❌ DON'T: Use transfer() for sending ETH/MATIC (use call)
// ❌ DON'T: Hardcode gas limits
// ❌ DON'T: Store PII on-chain
```

---

## 4. Testing Strategy

### Test Pyramid
```
         ╱╲
        ╱  ╲        E2E Tests (Cypress/Playwright)
       ╱    ╲       • Full transfer flow
      ╱──────╲      • Citizen verification journey
     ╱        ╲
    ╱ Integr.  ╲    Integration Tests (Jest + Testcontainers)
   ╱            ╲   • Fabric chaincode invoke via SDK
  ╱──────────────╲  • Algorand anchoring flow
 ╱                ╲ • API endpoint tests with real DB
╱   Unit Tests     ╲ Unit Tests (Jest / Go test / pytest)
╱                    ╲ • Business logic functions
╱────────────────────╲ • Validation schemas
                       • Utility functions
```

### Coverage Requirements
| Layer | Minimum Coverage | Tool |
|-------|-----------------|------|
| Fabric Chaincode | 90% | `go test -cover` |
| Backend Services | 80% | Jest + istanbul |
| Backend Controllers | 70% | Jest + supertest |
| Algorand Contracts | 85% | pytest |
| Polygon Contracts | 95% | Hardhat coverage |
| Frontend Components | 60% | Jest + React Testing Library |
| Integration | N/A (scenario-based) | Custom |
| E2E | N/A (flow-based) | Playwright |

### Test Data

```typescript
// tests/fixtures/indian-test-data.ts

export const TEST_PROPERTIES = {
  active: {
    propertyId: 'AP-GNT-TNL-SKM-142-3',
    surveyNumber: '142/3',
    stateCode: 'AP',
    districtCode: 'GNT',
    ownerAadhaarHash: 'a'.repeat(64), // SHA-256 placeholder
    ownerName: 'Ramesh Kumar',
    areaSqMeters: 80937,
    status: 'ACTIVE',
    disputeStatus: 'CLEAR',
    encumbranceStatus: 'CLEAR',
  },
  disputed: {
    propertyId: 'TG-HYD-SEC-AMR-567-0',
    surveyNumber: '567',
    stateCode: 'TG',
    districtCode: 'HYD',
    ownerAadhaarHash: 'b'.repeat(64),
    ownerName: 'Lakshmi Devi',
    status: 'ACTIVE',
    disputeStatus: 'UNDER_ADJUDICATION',
  },
  encumbered: {
    propertyId: 'MH-PUN-HVL-KTJ-1234-0',
    surveyNumber: '1234',
    stateCode: 'MH',
    districtCode: 'PUN',
    ownerAadhaarHash: 'c'.repeat(64),
    ownerName: 'Amit Patil',
    status: 'ACTIVE',
    encumbranceStatus: 'MORTGAGED',
  },
};

// NEVER use real Aadhaar numbers in tests
// ALWAYS use deterministic hashes (repeated chars) for predictable testing
```

---

## 5. Logging Standards

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      '*.aadhaarNumber',     // NEVER log raw Aadhaar
      '*.password',
      '*.otp',
      '*.mnemonic',
      '*.privateKey',
    ],
    censor: '[REDACTED]',
  },
});

// ✅ Structured logging with context
logger.info({
  action: 'TRANSFER_INITIATED',
  propertyId: 'AP-GNT-TNL-SKM-142-3',
  actorRole: 'registrar',
  stateCode: 'AP',
  transferId: 'xfr_t1u2v3',
}, 'Transfer initiated for property');

// ✅ Error logging with stack trace
logger.error({
  err: error,
  action: 'FABRIC_INVOKE_FAILED',
  chaincode: 'land-registry',
  function: 'ExecuteTransfer',
}, 'Chaincode invocation failed');

// ❌ NEVER log: Aadhaar numbers, OTPs, private keys, mnemonics, tokens
// ❌ NEVER use console.log in production code
```

---

## 6. Database Migrations

```bash
# Create new migration
cd backend
npx prisma migrate dev --name add_polygon_token_fields

# Apply migrations in production
npx prisma migrate deploy

# Generate Prisma client after schema changes
npx prisma generate

# Seed test data
npx prisma db seed
```

### Migration Rules
- Every migration MUST be backwards compatible (no column drops in same release)
- Drop columns only in the NEXT release after code stops using them
- Always add new columns as nullable or with defaults
- Index creation: use `CREATE INDEX CONCURRENTLY` for large tables
- Test migration on staging with production-sized data before deploying

---

## 7. Feature Implementation Checklist

When implementing any new feature, follow this checklist:

```
□ 1. Read relevant docs/ files (ARCHITECTURE.md, API_SPEC.md, SECURITY.md)
□ 2. Identify which chain(s) are involved (Fabric / Algorand / Polygon)
□ 3. Design the data model changes (Fabric world state + PostgreSQL + Prisma)
□ 4. Write chaincode function (if blockchain state changes)
□ 5. Write chaincode unit tests (Go)
□ 6. Add event emission in chaincode
□ 7. Write backend service function
□ 8. Write backend controller
□ 9. Add Zod validation schema
□ 10. Add RBAC middleware for the endpoint
□ 11. Add audit logging
□ 12. Write backend tests (unit + integration)
□ 13. Write Prisma migration (if PostgreSQL schema changes)
□ 14. Update API_SPEC.md
□ 15. Update frontend (if user-facing)
□ 16. Test end-to-end on local dev environment
□ 17. Update CLAUDE.md if new patterns introduced
□ 18. Submit PR with checklist completed
```

---

## 8. Common Development Tasks

### Add a New Chaincode Function
```bash
# 1. Edit the chaincode
cd blockchain/fabric/chaincode/land-registry
# Add function to the contract

# 2. Write tests
cd ../../test
# Add test cases

# 3. Rebuild and redeploy to dev network
cd ../network/scripts
./upgrade-chaincode.sh land-registry 1.1

# 4. Test via backend
cd ../../../../backend
npm run test:integration -- --grep "new function name"
```

### Add a New API Endpoint
```bash
# 1. Add Zod schema in backend/src/schemas/
# 2. Add service function in backend/src/services/
# 3. Add controller in backend/src/controllers/
# 4. Add route in backend/src/app.ts
# 5. Add middleware (auth, rbac, validation)
# 6. Write tests
# 7. Update docs/API_SPEC.md
```

### Debug Fabric Chaincode
```bash
# View peer logs
docker logs -f peer0.revenue.bhulekhchain.dev

# Query chaincode directly
docker exec -it peer0.revenue.bhulekhchain.dev peer chaincode query \
  -C land-registry-channel \
  -n land-registry \
  -c '{"Args":["GetProperty","AP-GNT-TNL-SKM-142-3"]}'

# Invoke chaincode
docker exec -it peer0.revenue.bhulekhchain.dev peer chaincode invoke \
  -o orderer.bhulekhchain.dev:7050 \
  -C land-registry-channel \
  -n land-registry \
  -c '{"Args":["RegisterProperty","{...json...}"]}' \
  --tls --cafile /etc/hyperledger/fabric/tls/ca.crt
```