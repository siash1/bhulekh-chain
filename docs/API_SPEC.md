# API_SPEC.md — BhulekhChain REST API Specification

## Base URL
```
Production:  https://api.bhulekhchain.gov.in/v1
Staging:     https://api-staging.bhulekhchain.gov.in/v1
Development: http://localhost:3001/v1
```

## Authentication

All endpoints (except `/auth/*` and `/verify/public/*`) require Bearer token:
```
Authorization: Bearer <jwt_access_token>
```

Bank/Court integrations use API Key + mTLS:
```
X-API-Key: <api_key>
+ Client certificate via mTLS
```

---

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "LAND_NOT_FOUND",
    "message": "Property with survey number AP/GNT/142/3 not found",
    "details": {},
    "requestId": "req_7f3a8b2c",
    "timestamp": "2027-03-15T10:30:00Z"
  }
}
```

### Error Code Registry

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_OTP` | 401 | Aadhaar OTP verification failed |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT access token expired |
| `AUTH_INSUFFICIENT_ROLE` | 403 | User lacks required RBAC role |
| `AUTH_STATE_MISMATCH` | 403 | Registrar trying to access other state's data |
| `LAND_NOT_FOUND` | 404 | Property not found for given ID |
| `LAND_DISPUTED` | 409 | Property has active dispute flag |
| `LAND_ENCUMBERED` | 409 | Property has active encumbrance |
| `LAND_COOLING_PERIOD` | 409 | Property in 72-hour cooling period |
| `TRANSFER_INVALID_OWNER` | 400 | Seller is not current owner |
| `TRANSFER_STAMP_DUTY_UNPAID` | 402 | Stamp duty payment required |
| `TRANSFER_MINOR_PROPERTY` | 400 | Court order required for minor's property |
| `TRANSFER_NRI_FEMA` | 400 | FEMA compliance check failed |
| `FABRIC_ENDORSEMENT_FAILED` | 500 | Chaincode endorsement policy not met |
| `FABRIC_TIMEOUT` | 504 | Fabric network timeout |
| `ALGORAND_ANCHOR_FAILED` | 500 | Algorand anchoring failed (non-blocking) |
| `DOCUMENT_TOO_LARGE` | 413 | Document exceeds 25MB limit |
| `DOCUMENT_INVALID_TYPE` | 400 | Only PDF, JPEG, PNG, TIFF allowed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Request body failed Zod validation |

---

## Endpoints

### 1. Authentication

#### POST `/auth/aadhaar/init`
Initiate Aadhaar OTP authentication.
```json
// Request
{ "aadhaarNumber": "XXXX-XXXX-1234" }
// Note: Last 4 digits only shown in UI, full number sent encrypted

// Response 200
{
  "success": true,
  "data": {
    "transactionId": "txn_a1b2c3d4",
    "message": "OTP sent to registered mobile"
  }
}
```

#### POST `/auth/aadhaar/verify`
Verify OTP and get JWT tokens.
```json
// Request
{
  "transactionId": "txn_a1b2c3d4",
  "otp": "123456"
}

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900,
    "user": {
      "id": "usr_x1y2z3",
      "aadhaarHash": "sha256:a1b2c3...",
      "name": "Ramesh Kumar",
      "role": "citizen",
      "stateCode": "AP"
    }
  }
}
```

#### POST `/auth/refresh`
Refresh access token.

#### POST `/auth/logout`
Invalidate refresh token.

### 2. Land Records

#### GET `/land/search`
Search land records (requires auth).
```
Query Parameters:
  ?surveyNo=142/3          # Survey number
  &district=Guntur          # District name
  &tehsil=Tenali            # Tehsil/taluka
  &village=Sakhamuru         # Village name
  &ownerName=Ramesh          # Owner name (partial match)
  &stateCode=AP              # State code (mandatory)
  &page=1&limit=20           # Pagination
```

```json
// Response 200
{
  "success": true,
  "data": {
    "records": [
      {
        "propertyId": "AP-GNT-TNL-SKM-142-3",
        "surveyNumber": "142/3",
        "district": "Guntur",
        "tehsil": "Tenali",
        "village": "Sakhamuru",
        "area": { "value": 2.0, "unit": "acres" },
        "currentOwner": {
          "name": "Ramesh Kumar",
          "aadhaarHash": "sha256:a1b2c3...",
          "ownershipType": "FREEHOLD",
          "since": "2019-06-15"
        },
        "status": "ACTIVE",
        "disputeStatus": "CLEAR",
        "encumbranceStatus": "CLEAR",
        "landUse": "AGRICULTURAL",
        "lastTransferDate": "2019-06-15",
        "fabricTxId": "tx_f1a2b3...",
        "algorandAsaId": 123456789,
        "createdAt": "2015-03-20T00:00:00Z",
        "updatedAt": "2019-06-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

#### GET `/land/:propertyId`
Get full property details including ownership chain.

#### GET `/land/:propertyId/history`
Get complete ownership history (provenance chain).
```json
// Response 200
{
  "success": true,
  "data": {
    "propertyId": "AP-GNT-TNL-SKM-142-3",
    "chain": [
      {
        "sequence": 1,
        "owner": { "name": "Original Survey Settlement", "aadhaarHash": null },
        "acquisitionType": "GOVERNMENT_GRANT",
        "date": "1965-01-01",
        "fabricTxId": "tx_genesis..."
      },
      {
        "sequence": 2,
        "owner": { "name": "Suresh Kumar", "aadhaarHash": "sha256:d4e5f6..." },
        "acquisitionType": "INHERITANCE",
        "date": "1992-08-12",
        "fabricTxId": "tx_inh_001..."
      },
      {
        "sequence": 3,
        "owner": { "name": "Ramesh Kumar", "aadhaarHash": "sha256:a1b2c3..." },
        "acquisitionType": "SALE",
        "date": "2019-06-15",
        "stampDutyPaid": 150000,
        "saleAmount": 2500000,
        "fabricTxId": "tx_sale_042...",
        "algorandTxId": "ALGO_TX_789...",
        "documentHash": "QmX7b3..."
      }
    ]
  }
}
```

#### GET `/land/:propertyId/encumbrances`
Get all encumbrances (mortgages, liens, court orders).

#### GET `/land/:propertyId/map`
Get cadastral map data (GeoJSON) for property boundaries.

### 3. Transfers

#### POST `/transfer/initiate`
Initiate ownership transfer (Registrar only).
```json
// Request
{
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "seller": {
    "aadhaarHash": "sha256:a1b2c3..."
  },
  "buyer": {
    "aadhaarHash": "sha256:g7h8i9...",
    "name": "Priya Sharma"
  },
  "saleAmount": 3500000,
  "witnesses": [
    { "aadhaarHash": "sha256:j1k2l3...", "name": "Witness 1" },
    { "aadhaarHash": "sha256:m4n5o6...", "name": "Witness 2" }
  ],
  "saleDeedDocument": "<base64_pdf>"
}

// Response 202 (Accepted — async processing)
{
  "success": true,
  "data": {
    "transferId": "xfr_t1u2v3",
    "status": "STAMP_DUTY_PENDING",
    "stampDutyAmount": 210000,
    "stampDutyBreakdown": {
      "registrationFee": 35000,
      "stampDuty": 175000,
      "surcharge": 0
    },
    "paymentLink": "https://shcil.bhulekhchain.gov.in/pay/xfr_t1u2v3"
  }
}
```

#### POST `/transfer/:transferId/stamp-duty`
Confirm stamp duty payment.

#### POST `/transfer/:transferId/sign`
Submit digital signatures (eSign) from all parties.
```json
// Request
{
  "signatory": "seller",
  "eSignToken": "<esign_token_from_cca>"
}
```

#### POST `/transfer/:transferId/execute`
Execute the transfer after all prerequisites met (Registrar only).
```json
// Response 200
{
  "success": true,
  "data": {
    "transferId": "xfr_t1u2v3",
    "status": "REGISTERED_PENDING_FINALITY",
    "fabricTxId": "tx_xfr_099...",
    "mutationId": "mut_m1n2o3",
    "coolingPeriodEnds": "2027-03-18T10:30:00Z",
    "documentCID": "QmY8c4...",
    "message": "Transfer registered. 72-hour cooling period active."
  }
}
```

#### GET `/transfer/:transferId/status`
Check transfer status.

#### POST `/transfer/:transferId/object`
File objection during cooling period.

### 4. Mutations

#### GET `/mutation/pending`
List pending mutations (Tehsildar only).

#### POST `/mutation/:mutationId/approve`
Approve automatic mutation (Tehsildar only).

### 5. Encumbrances

#### POST `/encumbrance/add`
Add mortgage/lien (Bank/Court only).
```json
{
  "propertyId": "AP-GNT-TNL-SKM-142-3",
  "type": "MORTGAGE",
  "institution": "SBI",
  "loanAccountNo": "SBI-HL-123456",
  "amount": 2000000,
  "startDate": "2027-04-01",
  "endDate": "2047-04-01"
}
```

#### POST `/encumbrance/:encumbranceId/release`
Release encumbrance (Bank/Court only).

### 6. Public Verification (No Auth Required)

#### GET `/verify/public/:propertyId`
Basic property verification (public access).
```json
// Response 200
{
  "success": true,
  "data": {
    "exists": true,
    "currentOwnerHash": "sha256:a1b2c3...",
    "status": "ACTIVE",
    "disputeStatus": "CLEAR",
    "encumbranceStatus": "CLEAR",
    "lastVerifiedOnAlgorand": "2027-03-15T10:25:00Z",
    "algorandAsaId": 123456789,
    "algorandVerificationUrl": "https://explorer.perawallet.app/asset/123456789"
  }
}
// Note: No PII in public verification response
```

#### GET `/verify/algorand/:propertyId`
Independent Algorand-based verification.
```json
// Response 200
{
  "success": true,
  "data": {
    "verified": true,
    "fabricStateRoot": "sha256:x1y2z3...",
    "algorandTxId": "ALGO_TX_789...",
    "algorandBlockRound": 34567890,
    "anchoredAt": "2027-03-15T10:25:00Z",
    "proofValid": true,
    "message": "Property ownership independently verified on Algorand public chain"
  }
}
```

#### POST `/verify/document`
Verify document authenticity via hash.
```json
// Request
{ "documentHash": "QmX7b3..." }

// Response 200
{
  "success": true,
  "data": {
    "verified": true,
    "registeredAt": "2019-06-15T10:30:00Z",
    "documentType": "SALE_DEED",
    "propertyId": "AP-GNT-TNL-SKM-142-3"
  }
}
```

### 7. Tokenization (Phase 3)

#### POST `/token/mint`
Mint title deed NFT (Admin only).

#### POST `/token/:tokenId/fractionalize`
Create fractional ownership tokens (Admin only).

#### GET `/token/:propertyId`
Get tokenization status for a property.

### 8. Admin

#### GET `/admin/stats`
System statistics dashboard.

#### GET `/admin/audit`
Query audit trail (Admin only).
```
?actor=sha256:a1b2c3...    # Filter by actor
&action=TRANSFER_COMPLETED  # Filter by action type
&from=2027-03-01            # Date range
&to=2027-03-15
&stateCode=AP               # State filter
```

#### POST `/admin/anchoring/trigger`
Manually trigger Algorand anchoring (Admin only).

#### GET `/admin/health`
System health check.
```json
{
  "status": "healthy",
  "components": {
    "fabric": { "status": "up", "latency": "45ms" },
    "postgresql": { "status": "up", "latency": "3ms" },
    "redis": { "status": "up", "latency": "1ms" },
    "ipfs": { "status": "up", "latency": "120ms" },
    "algorand": { "status": "up", "latency": "200ms" },
    "keycloak": { "status": "up", "latency": "15ms" }
  }
}
```

---

## Rate Limits

| Client Type | Limit | Window |
|------------|-------|--------|
| Citizen (authenticated) | 100 requests | Per minute |
| Bank API | 1,000 requests | Per minute |
| Court API | 500 requests | Per minute |
| Registrar (authenticated) | 500 requests | Per minute |
| Public verification | 30 requests | Per minute per IP |
| Admin | 2,000 requests | Per minute |

---

## Webhooks (For Bank/Court Integration)

Banks and courts can register webhook URLs to receive real-time notifications:

```json
// Webhook payload
{
  "event": "TRANSFER_COMPLETED",
  "timestamp": "2027-03-15T10:30:00Z",
  "data": {
    "propertyId": "AP-GNT-TNL-SKM-142-3",
    "transferId": "xfr_t1u2v3",
    "newOwnerHash": "sha256:g7h8i9...",
    "fabricTxId": "tx_xfr_099..."
  },
  "signature": "sha256-hmac:..."
}
```

Events: `TRANSFER_COMPLETED`, `ENCUMBRANCE_ADDED`, `ENCUMBRANCE_RELEASED`, `DISPUTE_FLAGGED`, `DISPUTE_RESOLVED`, `MUTATION_APPROVED`

Webhook signatures use HMAC-SHA256 with shared secret for verification.