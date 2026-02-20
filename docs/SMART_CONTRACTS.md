# SMART_CONTRACTS.md — BhulekhChain Smart Contract Specifications

## 1. Hyperledger Fabric Chaincode (Go)

### land-registry chaincode

This is the core chaincode. All property record operations flow through here.

#### Contract Interface

```go
type LandRegistryContract interface {
    // ====== REGISTRATION ======
    RegisterProperty(ctx, propertyJSON string) error
    RegisterBulk(ctx, propertiesJSON string) error  // For data migration
    
    // ====== QUERIES ======
    GetProperty(ctx, propertyId string) (*LandRecord, error)
    GetPropertyHistory(ctx, propertyId string) ([]*HistoryEntry, error)
    QueryByOwner(ctx, ownerAadhaarHash string) ([]*LandRecord, error)
    QueryBySurvey(ctx, stateCode, districtCode, surveyNo string) (*LandRecord, error)
    QueryByLocation(ctx, stateCode, districtCode, tehsilCode, villageCode string) ([]*LandRecord, error)
    
    // ====== TRANSFERS ======
    InitiateTransfer(ctx, transferJSON string) (string, error)
    ExecuteTransfer(ctx, transferId string) error
    CancelTransfer(ctx, transferId, reason string) error
    FinalizeAfterCooling(ctx, transferId string) error
    
    // ====== MUTATIONS ======
    ApproveMutation(ctx, mutationId string) error
    RejectMutation(ctx, mutationId, reason string) error
    
    // ====== ENCUMBRANCES ======
    AddEncumbrance(ctx, encumbranceJSON string) error
    ReleaseEncumbrance(ctx, encumbranceId string) error
    GetEncumbrances(ctx, propertyId string) ([]*EncumbranceRecord, error)
    
    // ====== DISPUTES ======
    FlagDispute(ctx, disputeJSON string) error
    ResolveDispute(ctx, disputeId, resolution string) error
    FreezeProperty(ctx, propertyId, courtOrderRef string) error
    UnfreezeProperty(ctx, propertyId, courtOrderRef string) error
    
    // ====== PROPERTY OPERATIONS ======
    SplitProperty(ctx, propertyId string, splitsJSON string) error
    MergeProperties(ctx, propertyIdsJSON string, mergedPropertyJSON string) error
    ChangeLandUse(ctx, propertyId, newLandUse, approvalRef string) error
    
    // ====== ANCHORING ======
    GetStateRoot(ctx, blockRange string) (string, error)
    RecordAnchor(ctx, anchorJSON string) error
}
```

#### Key Chaincode Logic: TransferOwnership

```go
func (s *SmartContract) ExecuteTransfer(ctx contractapi.TransactionContextInterface, transferId string) error {
    // ========================================
    // STEP 1: IDENTITY & AUTHORIZATION
    // ========================================
    
    // Get caller identity from MSP
    clientIdentity := ctx.GetClientIdentity()
    role, found, _ := clientIdentity.GetAttributeValue("role")
    if !found || role != "registrar" {
        return fmt.Errorf("ACCESS_DENIED: only registrars can execute transfers")
    }
    
    // Verify registrar is from the correct state
    callerState, _, _ := clientIdentity.GetAttributeValue("stateCode")
    
    // ========================================
    // STEP 2: FETCH & VALIDATE TRANSFER REQUEST
    // ========================================
    
    transferBytes, err := ctx.GetStub().GetState("TRANSFER:" + transferId)
    if err != nil || transferBytes == nil {
        return fmt.Errorf("TRANSFER_NOT_FOUND: %s", transferId)
    }
    var transfer TransferRecord
    json.Unmarshal(transferBytes, &transfer)
    
    // Verify transfer is in correct state
    if transfer.Status != "SIGNATURES_COMPLETE" {
        return fmt.Errorf("TRANSFER_INVALID_STATE: expected SIGNATURES_COMPLETE, got %s", transfer.Status)
    }
    
    // ========================================
    // STEP 3: FETCH & VALIDATE PROPERTY
    // ========================================
    
    propertyBytes, _ := ctx.GetStub().GetState("LAND:" + transfer.PropertyId)
    var property LandRecord
    json.Unmarshal(propertyBytes, &property)
    
    // State boundary check
    if property.Location.StateCode != callerState {
        return fmt.Errorf("STATE_MISMATCH: registrar from %s cannot modify %s records",
            callerState, property.Location.StateCode)
    }
    
    // ========================================
    // STEP 4: BUSINESS RULE VALIDATION
    // ========================================
    
    // Rule 1: No transfer if disputed
    if property.DisputeStatus != "CLEAR" {
        return fmt.Errorf("LAND_DISPUTED: property %s has active dispute", transfer.PropertyId)
    }
    
    // Rule 2: No transfer if frozen by court
    if property.Status == "FROZEN" {
        return fmt.Errorf("LAND_FROZEN: property %s is frozen by court order", transfer.PropertyId)
    }
    
    // Rule 3: Check encumbrance — if mortgaged, bank must consent
    if property.EncumbranceStatus != "CLEAR" {
        encumbrances := s.getActiveEncumbrances(ctx, transfer.PropertyId)
        for _, enc := range encumbrances {
            if enc.Type == "MORTGAGE" && !transfer.BankConsent {
                return fmt.Errorf("LAND_ENCUMBERED: mortgage by %s requires bank consent",
                    enc.Institution.Name)
            }
        }
    }
    
    // Rule 4: Verify seller is current owner
    if property.CurrentOwner.Owners[0].AadhaarHash != transfer.Seller.AadhaarHash {
        return fmt.Errorf("TRANSFER_INVALID_OWNER: seller is not current owner")
    }
    
    // Rule 5: No active cooling period
    if property.CoolingPeriod.Active {
        return fmt.Errorf("LAND_COOLING_PERIOD: property in cooling period until %s",
            property.CoolingPeriod.ExpiresAt)
    }
    
    // Rule 6: Stamp duty must be paid
    if transfer.Status != "SIGNATURES_COMPLETE" || transfer.TransactionDetails.StampDutyAmount == 0 {
        return fmt.Errorf("TRANSFER_STAMP_DUTY_UNPAID")
    }
    
    // Rule 7: Check for minors
    for _, owner := range property.CurrentOwner.Owners {
        if owner.IsMinor && !transfer.CourtOrderRef != "" {
            return fmt.Errorf("TRANSFER_MINOR_PROPERTY: court order required")
        }
    }
    
    // Rule 8: Anti-benami — declared value must be >= circle rate
    if transfer.TransactionDetails.DeclaredValue < transfer.TransactionDetails.CircleRateValue {
        return fmt.Errorf("TRANSFER_UNDERVALUED: declared value below circle rate")
    }
    
    // ========================================
    // STEP 5: EXECUTE STATE CHANGES
    // ========================================
    
    timestamp, _ := ctx.GetStub().GetTxTimestamp()
    txId := ctx.GetStub().GetTxID()
    now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
    
    // 5a. Update property ownership
    previousOwner := property.CurrentOwner
    property.CurrentOwner = OwnerInfo{
        OwnerType: "INDIVIDUAL",
        Owners: []Owner{{
            AadhaarHash:     transfer.Buyer.AadhaarHash,
            Name:            transfer.Buyer.Name,
            SharePercentage: 100,
            IsMinor:         false,
        }},
        OwnershipType:         previousOwner.OwnershipType,
        AcquisitionType:       "SALE",
        AcquisitionDate:       now[:10],
        AcquisitionDocumentHash: transfer.Documents.SaleDeedHash,
    }
    property.CoolingPeriod = CoolingPeriod{
        Active:    true,
        ExpiresAt: time.Unix(timestamp.Seconds, 0).Add(72 * time.Hour).Format(time.RFC3339),
    }
    property.Status = "ACTIVE"
    property.UpdatedAt = now
    property.UpdatedBy = callerState + "_registrar"
    property.Provenance.Sequence++
    property.FabricTxId = txId
    
    // 5b. Save updated property
    propertyJSON, _ := json.Marshal(property)
    ctx.GetStub().PutState("LAND:"+transfer.PropertyId, propertyJSON)
    
    // 5c. Update transfer status
    transfer.Status = "REGISTERED_PENDING_FINALITY"
    transfer.FabricTxId = txId
    transfer.UpdatedAt = now
    transferJSON, _ := json.Marshal(transfer)
    ctx.GetStub().PutState("TRANSFER:"+transferId, transferJSON)
    
    // 5d. Create auto-mutation
    mutation := MutationRecord{
        DocType:       "mutationRecord",
        MutationId:    "mut_" + txId[:8],
        PropertyId:    transfer.PropertyId,
        Type:          "SALE",
        TransferId:    transferId,
        PreviousOwner: OwnerRef{AadhaarHash: previousOwner.Owners[0].AadhaarHash, Name: previousOwner.Owners[0].Name},
        NewOwner:      OwnerRef{AadhaarHash: transfer.Buyer.AadhaarHash, Name: transfer.Buyer.Name},
        Status:        "AUTO_APPROVED",
        ApprovedBy:    "system",
        ApprovedAt:    now,
        CreatedAt:     now,
    }
    mutationJSON, _ := json.Marshal(mutation)
    ctx.GetStub().PutState("MUTATION:"+mutation.MutationId, mutationJSON)
    
    // ========================================
    // STEP 6: EMIT EVENTS
    // ========================================
    
    // Event for middleware to sync PostgreSQL + trigger Algorand anchoring
    event := TransferEvent{
        Type:           "TRANSFER_COMPLETED",
        TransferId:     transferId,
        PropertyId:     transfer.PropertyId,
        NewOwnerHash:   transfer.Buyer.AadhaarHash,
        FabricTxId:     txId,
        Timestamp:      now,
        MutationId:     mutation.MutationId,
        DocumentHash:   transfer.Documents.SaleDeedHash,
    }
    eventJSON, _ := json.Marshal(event)
    ctx.GetStub().SetEvent("TRANSFER_COMPLETED", eventJSON)
    
    return nil
}
```

### stamp-duty chaincode

Separate chaincode because stamp duty rates vary by state and change frequently.

```go
type StampDutyContract interface {
    SetCircleRate(ctx, stateCode, districtCode, tehsilCode string, ratePerSqMeter int64) error
    GetCircleRate(ctx, stateCode, districtCode, tehsilCode string) (int64, error)
    CalculateStampDuty(ctx, stateCode string, areaSqMeters float64, declaredValue int64) (*StampDutyBreakdown, error)
}

type StampDutyBreakdown struct {
    CircleRateValue    int64  // In paisa
    ApplicableValue    int64  // Max of declared and circle rate
    StampDutyRate      int32  // Basis points (e.g., 500 = 5%)
    StampDutyAmount    int64  // In paisa
    RegistrationFee    int64  // In paisa
    Surcharge          int64  // In paisa
    TotalFees          int64  // In paisa
    State              string
}
```

---

## 2. Algorand Smart Contracts (Python)

### title_proof.py — State Proof Anchoring

```python
"""
Algorand smart contract for anchoring Fabric state roots.
Deployed as an Application (stateful smart contract).
"""
from algopy import ARC4Contract, GlobalState, Txn, op, arc4, UInt64, Bytes

class TitleProofAnchor(ARC4Contract):
    """
    Stores Fabric state roots on Algorand for independent verification.
    Only the authorized anchor account can write.
    """
    
    # Global state
    anchor_authority: GlobalState[Bytes]       # Authorized anchor account address
    total_anchors: GlobalState[UInt64]         # Total anchors submitted
    last_anchor_round: GlobalState[UInt64]     # Algorand round of last anchor
    
    def __init__(self) -> None:
        self.anchor_authority = GlobalState(Bytes)
        self.total_anchors = GlobalState(UInt64, default=UInt64(0))
        self.last_anchor_round = GlobalState(UInt64, default=UInt64(0))
    
    @arc4.abimethod
    def initialize(self, authority: arc4.Address) -> None:
        """Set the authorized anchor account. Can only be called once by creator."""
        assert Txn.sender == op.Global.creator_address, "Only creator can initialize"
        assert self.anchor_authority.get(default=Bytes(b"")) == Bytes(b""), "Already initialized"
        self.anchor_authority.value = authority.bytes
    
    @arc4.abimethod
    def anchor_state(
        self,
        state_code: arc4.String,
        channel_id: arc4.String,
        fabric_block_start: arc4.UInt64,
        fabric_block_end: arc4.UInt64,
        state_root: arc4.DynamicBytes,
        tx_count: arc4.UInt64,
    ) -> arc4.UInt64:
        """
        Anchor a Fabric state root to Algorand.
        Returns the anchor sequence number.
        """
        # Only authorized account can anchor
        assert Txn.sender == self.anchor_authority.value, "Unauthorized"
        
        # Increment counter
        self.total_anchors.value = self.total_anchors.value + UInt64(1)
        self.last_anchor_round.value = op.Global.round
        
        # State root is stored in the transaction's note field by the caller
        # The on-chain state just tracks metadata
        # Full verification: caller provides state_root, verifier recomputes from Fabric
        
        return arc4.UInt64(self.total_anchors.value)
    
    @arc4.abimethod(readonly=True)
    def get_anchor_count(self) -> arc4.UInt64:
        """Get total number of anchors."""
        return arc4.UInt64(self.total_anchors.value)
    
    @arc4.abimethod
    def rotate_authority(self, new_authority: arc4.Address) -> None:
        """Rotate the anchor authority. Only current authority can do this."""
        assert Txn.sender == self.anchor_authority.value, "Unauthorized"
        self.anchor_authority.value = new_authority.bytes
```

### title_asa.py — Title Certificate as ASA

```python
"""
Helper script to create Algorand Standard Assets (ASAs) representing title certificates.
These are NOT smart contracts — ASAs are native Algorand primitives.
"""
from algokit_utils import AlgorandClient, AssetCreateParams

def create_title_certificate_asa(
    algorand: AlgorandClient,
    anchor_account: str,
    property_id: str,
    owner_hash: str,
    fabric_tx_id: str,
    document_hash: str,
) -> int:
    """
    Create an ASA representing a title certificate.
    
    The ASA is:
    - Total supply: 1 (unique, like an NFT)
    - Decimals: 0
    - Clawback: anchor_account (can reclaim if ownership changes)
    - Freeze: anchor_account (can freeze if disputed)
    - Manager: anchor_account (can update metadata)
    
    Returns: ASA ID
    """
    
    # Metadata stored in ASA note (max 1024 bytes)
    note = {
        "standard": "bhulekhchain-v1",
        "property_id": property_id,
        "owner_hash": owner_hash,
        "fabric_tx_id": fabric_tx_id,
        "document_hash": document_hash,
        "type": "TITLE_CERTIFICATE"
    }
    
    result = algorand.send.asset_create(
        AssetCreateParams(
            sender=anchor_account,
            total=1,
            decimals=0,
            asset_name=f"TITLE-{property_id[:20]}",
            unit_name="BKTITLE",
            url=f"https://verify.bhulekhchain.gov.in/{property_id}",
            note=json.dumps(note).encode(),
            manager=anchor_account,
            reserve=anchor_account,
            freeze=anchor_account,
            clawback=anchor_account,
            default_frozen=False,
        )
    )
    
    return result.confirmation["asset-index"]


def transfer_title_asa(
    algorand: AlgorandClient,
    anchor_account: str,
    asa_id: int,
    old_owner_address: str,
    new_owner_address: str,
    transfer_fabric_tx_id: str,
) -> str:
    """
    Transfer title ASA to new owner using clawback.
    Clawback is used because citizens don't need Algorand wallets.
    The anchor_account holds all ASAs on behalf of citizens.
    
    In practice, the ASA stays in the anchor account.
    Ownership is tracked by the metadata/note, not the ASA holder.
    """
    # For citizen-facing verification, we update the ASA metadata
    # by destroying and re-creating with new owner_hash
    # (Algorand ASAs are immutable once created, so we use note field in transfer tx)
    
    note = {
        "standard": "bhulekhchain-v1",
        "action": "OWNERSHIP_TRANSFER",
        "asa_id": asa_id,
        "new_owner_hash": new_owner_address,
        "fabric_tx_id": transfer_fabric_tx_id,
    }
    
    # Send a 0-amount ASA transfer to self with updated note
    result = algorand.send.asset_transfer(
        AssetTransferParams(
            sender=anchor_account,
            receiver=anchor_account,
            asset_id=asa_id,
            amount=0,
            note=json.dumps(note).encode(),
        )
    )
    
    return result.tx_id
```

---

## 3. Polygon Smart Contracts (Solidity)

### TitleDeedNFT.sol (Phase 3)

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title BhulekhChain Title Deed NFT
 * @notice ERC-721 representing tokenized property title deeds
 * @dev Only government admin multisig can mint. Transfer requires govt approval.
 */
contract TitleDeedNFT is 
    ERC721Upgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant GOVT_ADMIN_ROLE = keccak256("GOVT_ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    struct TitleDeed {
        string propertyId;          // BhulekhChain property ID
        string fabricTxHash;        // Fabric transaction hash
        uint256 algorandAsaId;      // Algorand ASA ID
        string documentCID;         // IPFS CID of sale deed
        string ownerAadhaarHash;    // SHA-256 of owner's Aadhaar
        uint256 areaSqMeters;       // Area in square meters
        string stateCode;           // Indian state code
        uint256 registrationDate;   // Unix timestamp
        bool fractionalizable;      // Can be fractionalized?
        bool transferApproved;      // Govt approval for transfer
    }
    
    mapping(uint256 => TitleDeed) public titleDeeds;
    mapping(string => uint256) public propertyIdToTokenId;
    uint256 private _nextTokenId;
    
    event TitleMinted(uint256 indexed tokenId, string propertyId, string ownerAadhaarHash);
    event TransferApproved(uint256 indexed tokenId, address indexed newOwner);
    event FractionalizationEnabled(uint256 indexed tokenId);
    
    function initialize(address govAdmin) public initializer {
        __ERC721_init("BhulekhChain Title Deed", "BKTITLE");
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, govAdmin);
        _grantRole(GOVT_ADMIN_ROLE, govAdmin);
        _grantRole(UPGRADER_ROLE, govAdmin);
        _nextTokenId = 1;
    }
    
    /**
     * @notice Mint a new title deed NFT
     * @dev Only callable by GOVT_ADMIN_ROLE (multisig)
     */
    function mintTitle(
        address owner,
        string calldata propertyId,
        string calldata fabricTxHash,
        uint256 algorandAsaId,
        string calldata documentCID,
        string calldata ownerAadhaarHash,
        uint256 areaSqMeters,
        string calldata stateCode
    ) external onlyRole(GOVT_ADMIN_ROLE) whenNotPaused returns (uint256) {
        require(propertyIdToTokenId[propertyId] == 0, "Property already tokenized");
        
        uint256 tokenId = _nextTokenId++;
        _safeMint(owner, tokenId);
        
        titleDeeds[tokenId] = TitleDeed({
            propertyId: propertyId,
            fabricTxHash: fabricTxHash,
            algorandAsaId: algorandAsaId,
            documentCID: documentCID,
            ownerAadhaarHash: ownerAadhaarHash,
            areaSqMeters: areaSqMeters,
            stateCode: stateCode,
            registrationDate: block.timestamp,
            fractionalizable: false,
            transferApproved: false
        });
        
        propertyIdToTokenId[propertyId] = tokenId;
        
        emit TitleMinted(tokenId, propertyId, ownerAadhaarHash);
        return tokenId;
    }
    
    /**
     * @notice Government must approve before any transfer
     * @dev This ensures on-chain tokenization reflects off-chain legal transfer
     */
    function approveTransfer(uint256 tokenId, address newOwner) 
        external onlyRole(GOVT_ADMIN_ROLE) 
    {
        titleDeeds[tokenId].transferApproved = true;
        emit TransferApproved(tokenId, newOwner);
    }
    
    /**
     * @notice Override transfer to require government approval
     */
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        // Allow minting (from == address(0))
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            require(titleDeeds[tokenId].transferApproved, "Government approval required");
            titleDeeds[tokenId].transferApproved = false; // Reset after transfer
        }
        return super._update(to, tokenId, auth);
    }
    
    /**
     * @notice Enable fractionalization for a property
     */
    function enableFractionalization(uint256 tokenId) 
        external onlyRole(GOVT_ADMIN_ROLE) 
    {
        titleDeeds[tokenId].fractionalizable = true;
        emit FractionalizationEnabled(tokenId);
    }
    
    /**
     * @notice Get three-chain verification data
     */
    function getVerification(uint256 tokenId) external view returns (
        string memory propertyId,
        string memory fabricTxHash,
        uint256 algorandAsaId,
        string memory documentCID
    ) {
        TitleDeed storage deed = titleDeeds[tokenId];
        return (deed.propertyId, deed.fabricTxHash, deed.algorandAsaId, deed.documentCID);
    }
    
    // Emergency pause
    function pause() external onlyRole(GOVT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(GOVT_ADMIN_ROLE) { _unpause(); }
    
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

### FractionalOwnership.sol (Phase 3)

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BhulekhChain Fractional Ownership
 * @notice ERC-1155 for fractional property ownership
 * @dev Each property gets a unique token ID. Multiple holders per property.
 */
contract FractionalOwnership is ERC1155, AccessControl, ReentrancyGuard {
    bytes32 public constant GOVT_ADMIN_ROLE = keccak256("GOVT_ADMIN_ROLE");
    
    struct FractionalProperty {
        uint256 titleDeedTokenId;    // Reference to TitleDeedNFT
        uint256 totalFractions;      // Total fractions (e.g., 10000 = 100%)
        uint256 pricePerFraction;    // In wei (MATIC)
        uint256 minFractions;        // Minimum purchase (e.g., 100 = 1%)
        bool active;
        uint256 totalRentalPool;     // Accumulated rental income
        uint256 lastDistribution;    // Timestamp of last rental distribution
    }
    
    mapping(uint256 => FractionalProperty) public properties;
    mapping(uint256 => mapping(address => uint256)) public rentalClaimed;
    
    address public titleDeedContract;
    uint256 private _nextPropertyId;
    
    event Fractionalized(uint256 indexed propertyId, uint256 totalFractions);
    event FractionsPurchased(uint256 indexed propertyId, address buyer, uint256 amount);
    event RentalDeposited(uint256 indexed propertyId, uint256 amount);
    event RentalClaimed(uint256 indexed propertyId, address holder, uint256 amount);
    
    constructor(address _titleDeedContract, address govAdmin) ERC1155("") {
        titleDeedContract = _titleDeedContract;
        _grantRole(DEFAULT_ADMIN_ROLE, govAdmin);
        _grantRole(GOVT_ADMIN_ROLE, govAdmin);
        _nextPropertyId = 1;
    }
    
    function fractionalize(
        uint256 titleDeedTokenId,
        uint256 totalFractions,
        uint256 pricePerFraction,
        uint256 minFractions
    ) external onlyRole(GOVT_ADMIN_ROLE) returns (uint256) {
        uint256 propertyId = _nextPropertyId++;
        
        properties[propertyId] = FractionalProperty({
            titleDeedTokenId: titleDeedTokenId,
            totalFractions: totalFractions,
            pricePerFraction: pricePerFraction,
            minFractions: minFractions,
            active: true,
            totalRentalPool: 0,
            lastDistribution: block.timestamp
        });
        
        // Mint all fractions to contract (held for sale)
        _mint(address(this), propertyId, totalFractions, "");
        
        emit Fractionalized(propertyId, totalFractions);
        return propertyId;
    }
    
    function purchaseFractions(uint256 propertyId, uint256 amount) 
        external payable nonReentrant 
    {
        FractionalProperty storage prop = properties[propertyId];
        require(prop.active, "Property not active");
        require(amount >= prop.minFractions, "Below minimum");
        require(msg.value >= amount * prop.pricePerFraction, "Insufficient payment");
        
        // Transfer fractions from contract to buyer
        _safeTransferFrom(address(this), msg.sender, propertyId, amount, "");
        
        emit FractionsPurchased(propertyId, msg.sender, amount);
    }
    
    function depositRental(uint256 propertyId) external payable onlyRole(GOVT_ADMIN_ROLE) {
        properties[propertyId].totalRentalPool += msg.value;
        emit RentalDeposited(propertyId, msg.value);
    }
    
    function claimRental(uint256 propertyId) external nonReentrant {
        uint256 holderBalance = balanceOf(msg.sender, propertyId);
        require(holderBalance > 0, "No fractions held");
        
        FractionalProperty storage prop = properties[propertyId];
        uint256 totalShare = (prop.totalRentalPool * holderBalance) / prop.totalFractions;
        uint256 claimed = rentalClaimed[propertyId][msg.sender];
        uint256 claimable = totalShare - claimed;
        
        require(claimable > 0, "Nothing to claim");
        
        rentalClaimed[propertyId][msg.sender] = totalShare;
        
        (bool sent,) = payable(msg.sender).call{value: claimable}("");
        require(sent, "Transfer failed");
        
        emit RentalClaimed(propertyId, msg.sender, claimable);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

---

## 4. Event Schema (Cross-Chain Communication)

Events emitted by Fabric chaincode are consumed by the Node.js backend to trigger Algorand anchoring and PostgreSQL sync.

```typescript
// All chaincode events follow this envelope
interface ChaincodeEvent {
  type: string;
  timestamp: string;
  fabricTxId: string;
  channelId: string;
  stateCode: string;
}

interface TransferCompletedEvent extends ChaincodeEvent {
  type: "TRANSFER_COMPLETED";
  transferId: string;
  propertyId: string;
  newOwnerHash: string;
  previousOwnerHash: string;
  mutationId: string;
  documentHash: string;
}

interface EncumbranceAddedEvent extends ChaincodeEvent {
  type: "ENCUMBRANCE_ADDED";
  encumbranceId: string;
  propertyId: string;
  encumbranceType: string;
  institutionName: string;
}

interface DisputeFlaggedEvent extends ChaincodeEvent {
  type: "DISPUTE_FLAGGED";
  disputeId: string;
  propertyId: string;
  disputeType: string;
}

interface PropertyRegisteredEvent extends ChaincodeEvent {
  type: "PROPERTY_REGISTERED";
  propertyId: string;
  ownerHash: string;
  surveyNumber: string;
}
```