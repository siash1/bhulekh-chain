package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// LandRegistryContract implements the BhulekhChain land registry
// smart contract on Hyperledger Fabric. It provides functions for
// property registration, ownership transfers, encumbrances, disputes,
// mutations, and cross-chain anchoring.
type LandRegistryContract struct {
	contractapi.Contract
}

// ============================================================
// REGISTRATION
// ============================================================

// RegisterProperty registers a new land record on the blockchain.
// Only users with the "registrar" role can call this function.
// The caller must belong to the same state as the property location.
// Emits a PROPERTY_REGISTERED event upon success.
func (s *LandRegistryContract) RegisterProperty(ctx contractapi.TransactionContextInterface, propertyJSON string) error {
	// ABAC: Only registrars can register property
	if err := requireRole(ctx, "registrar"); err != nil {
		return err
	}

	var property LandRecord
	if err := json.Unmarshal([]byte(propertyJSON), &property); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse property JSON: %v", err)
	}

	// Validate property ID format
	if err := validatePropertyID(property.PropertyID); err != nil {
		return err
	}

	// State boundary check
	if err := requireStateAccess(ctx, property.Location.StateCode); err != nil {
		return err
	}

	// Check Aadhaar mandatory (Rule 10)
	if len(property.CurrentOwner.Owners) == 0 {
		return fmt.Errorf("VALIDATION_ERROR: property must have at least one owner")
	}
	for _, owner := range property.CurrentOwner.Owners {
		if owner.AadhaarHash == "" {
			return fmt.Errorf("AADHAAR_REQUIRED: every owner must have an aadhaarHash")
		}
	}

	// Check if property already exists (Rule 9: never overwrite)
	landKey, err := createLandKey(ctx, property.PropertyID)
	if err != nil {
		return fmt.Errorf("failed to create land key: %v", err)
	}
	existing, err := ctx.GetStub().GetState(landKey)
	if err != nil {
		return fmt.Errorf("failed to read world state: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("PROPERTY_EXISTS: property %s already registered", property.PropertyID)
	}

	// Set metadata
	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	property.DocType = "landRecord"
	property.Status = "ACTIVE"
	property.DisputeStatus = "CLEAR"
	property.EncumbranceStatus = "CLEAR"
	property.CoolingPeriod = CoolingPeriod{Active: false, ExpiresAt: ""}
	property.FabricTxID = txID
	property.CreatedAt = now
	property.UpdatedAt = now
	property.CreatedBy = getCallerID(ctx)
	property.UpdatedBy = getCallerID(ctx)
	if property.Provenance.Sequence == 0 {
		property.Provenance.Sequence = 1
	}

	// Store property
	propertyBytes, err := json.Marshal(property)
	if err != nil {
		return fmt.Errorf("failed to marshal property: %v", err)
	}
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to put state: %v", err)
	}

	// Create indexes for efficient queries
	for _, owner := range property.CurrentOwner.Owners {
		if err := putOwnerIndex(ctx, owner.AadhaarHash, property.PropertyID); err != nil {
			return fmt.Errorf("failed to create owner index: %v", err)
		}
	}
	surveyKey := property.SurveyNumber
	if property.SubSurveyNumber != "" {
		surveyKey = property.SurveyNumber + "/" + property.SubSurveyNumber
	}
	if err := putSurveyIndex(ctx, property.Location.StateCode, property.Location.DistrictCode, surveyKey, property.PropertyID); err != nil {
		return fmt.Errorf("failed to create survey index: %v", err)
	}
	if err := putLocationIndex(ctx, property.Location, property.PropertyID); err != nil {
		return fmt.Errorf("failed to create location index: %v", err)
	}

	// Emit PROPERTY_REGISTERED event
	event := PropertyRegisteredEvent{
		Type:         "PROPERTY_REGISTERED",
		PropertyID:   property.PropertyID,
		OwnerHash:    property.CurrentOwner.Owners[0].AadhaarHash,
		SurveyNumber: property.SurveyNumber,
		FabricTxID:   txID,
		Timestamp:    now,
		StateCode:    property.Location.StateCode,
		ChannelID:    ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_REGISTERED", event)
}

// RegisterBulk registers multiple properties in a single transaction.
// This is primarily used during data migration from legacy state
// revenue systems. Only users with the "admin" role can call this.
func (s *LandRegistryContract) RegisterBulk(ctx contractapi.TransactionContextInterface, propertiesJSON string) error {
	// ABAC: Only admins can bulk register (migration use case)
	if err := requireRole(ctx, "admin"); err != nil {
		return err
	}

	var properties []LandRecord
	if err := json.Unmarshal([]byte(propertiesJSON), &properties); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse properties array: %v", err)
	}

	if len(properties) == 0 {
		return fmt.Errorf("VALIDATION_ERROR: empty properties array")
	}
	if len(properties) > 100 {
		return fmt.Errorf("VALIDATION_ERROR: bulk registration limited to 100 properties per transaction")
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()
	callerID := getCallerID(ctx)

	for i, property := range properties {
		if err := validatePropertyID(property.PropertyID); err != nil {
			return fmt.Errorf("property[%d]: %v", i, err)
		}

		// Validate Aadhaar (Rule 10)
		if len(property.CurrentOwner.Owners) == 0 {
			return fmt.Errorf("property[%d]: must have at least one owner", i)
		}
		for _, owner := range property.CurrentOwner.Owners {
			if owner.AadhaarHash == "" {
				return fmt.Errorf("property[%d]: AADHAAR_REQUIRED for all owners", i)
			}
		}

		landKey, err := createLandKey(ctx, property.PropertyID)
		if err != nil {
			return fmt.Errorf("property[%d]: failed to create key: %v", i, err)
		}
		existing, err := ctx.GetStub().GetState(landKey)
		if err != nil {
			return fmt.Errorf("property[%d]: failed to read state: %v", i, err)
		}
		if existing != nil {
			return fmt.Errorf("property[%d]: PROPERTY_EXISTS: %s already registered", i, property.PropertyID)
		}

		property.DocType = "landRecord"
		if property.Status == "" {
			property.Status = "ACTIVE"
		}
		if property.DisputeStatus == "" {
			property.DisputeStatus = "CLEAR"
		}
		if property.EncumbranceStatus == "" {
			property.EncumbranceStatus = "CLEAR"
		}
		property.CoolingPeriod = CoolingPeriod{Active: false, ExpiresAt: ""}
		property.FabricTxID = txID
		if property.CreatedAt == "" {
			property.CreatedAt = now
		}
		property.UpdatedAt = now
		property.CreatedBy = callerID
		property.UpdatedBy = callerID
		if property.Provenance.Sequence == 0 {
			property.Provenance.Sequence = 1
		}

		propertyBytes, err := json.Marshal(property)
		if err != nil {
			return fmt.Errorf("property[%d]: failed to marshal: %v", i, err)
		}
		if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
			return fmt.Errorf("property[%d]: failed to put state: %v", i, err)
		}

		// Create indexes
		for _, owner := range property.CurrentOwner.Owners {
			_ = putOwnerIndex(ctx, owner.AadhaarHash, property.PropertyID)
		}
		surveyKey := property.SurveyNumber
		if property.SubSurveyNumber != "" {
			surveyKey = property.SurveyNumber + "/" + property.SubSurveyNumber
		}
		_ = putSurveyIndex(ctx, property.Location.StateCode, property.Location.DistrictCode, surveyKey, property.PropertyID)
		_ = putLocationIndex(ctx, property.Location, property.PropertyID)
	}

	// Emit a single event for the bulk operation
	event := PropertyRegisteredEvent{
		Type:         "PROPERTY_REGISTERED",
		PropertyID:   fmt.Sprintf("BULK:%d_records", len(properties)),
		OwnerHash:    "bulk_migration",
		SurveyNumber: "",
		FabricTxID:   txID,
		Timestamp:    now,
		StateCode:    extractStateCode(properties[0].PropertyID),
		ChannelID:    ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_REGISTERED", event)
}

// ============================================================
// QUERIES
// ============================================================

// GetProperty retrieves a land record by its property ID.
// Accessible by registrar, tehsildar, bank, court, admin, and citizens
// (citizens can only view their own properties, enforced at middleware).
func (s *LandRegistryContract) GetProperty(ctx contractapi.TransactionContextInterface, propertyID string) (*LandRecord, error) {
	if err := validatePropertyID(propertyID); err != nil {
		return nil, err
	}

	landKey, err := createLandKey(ctx, propertyID)
	if err != nil {
		return nil, fmt.Errorf("failed to create land key: %v", err)
	}

	propertyBytes, err := ctx.GetStub().GetState(landKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read world state: %v", err)
	}
	if propertyBytes == nil {
		return nil, fmt.Errorf("PROPERTY_NOT_FOUND: %s does not exist", propertyID)
	}

	var property LandRecord
	if err := json.Unmarshal(propertyBytes, &property); err != nil {
		return nil, fmt.Errorf("failed to unmarshal property: %v", err)
	}
	return &property, nil
}

// GetPropertyHistory retrieves the full transaction history of a
// land record using Fabric's built-in history database. This provides
// the complete provenance chain for the property.
func (s *LandRegistryContract) GetPropertyHistory(ctx contractapi.TransactionContextInterface, propertyID string) ([]*HistoryEntry, error) {
	if err := validatePropertyID(propertyID); err != nil {
		return nil, err
	}

	landKey, err := createLandKey(ctx, propertyID)
	if err != nil {
		return nil, fmt.Errorf("failed to create land key: %v", err)
	}

	historyIterator, err := ctx.GetStub().GetHistoryForKey(landKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get history for %s: %v", propertyID, err)
	}
	defer historyIterator.Close()

	var history []*HistoryEntry
	for historyIterator.HasNext() {
		modification, err := historyIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate history: %v", err)
		}

		entry := &HistoryEntry{
			TxID:      modification.TxId,
			Timestamp: time.Unix(modification.Timestamp.Seconds, 0).Format(time.RFC3339),
			IsDelete:  modification.IsDelete,
		}

		if !modification.IsDelete && modification.Value != nil {
			var record LandRecord
			if err := json.Unmarshal(modification.Value, &record); err == nil {
				entry.Record = &record
			}
		}
		history = append(history, entry)
	}
	return history, nil
}

// QueryByOwner returns all properties owned by the specified Aadhaar hash.
// Uses the OWNER composite key index for efficient lookup.
func (s *LandRegistryContract) QueryByOwner(ctx contractapi.TransactionContextInterface, ownerAadhaarHash string) ([]*LandRecord, error) {
	if ownerAadhaarHash == "" {
		return nil, fmt.Errorf("VALIDATION_ERROR: ownerAadhaarHash cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixOwnerIndex, []string{ownerAadhaarHash})
	if err != nil {
		return nil, fmt.Errorf("failed to query owner index: %v", err)
	}
	defer iterator.Close()

	var properties []*LandRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate owner index: %v", err)
		}
		propertyID := string(kv.Value)
		property, err := s.GetProperty(ctx, propertyID)
		if err != nil {
			continue // Property may have been archived; skip
		}
		properties = append(properties, property)
	}
	return properties, nil
}

// QueryBySurvey returns the property matching the given state, district,
// and survey number. Uses the SURVEY composite key index.
func (s *LandRegistryContract) QueryBySurvey(ctx contractapi.TransactionContextInterface, stateCode, districtCode, surveyNo string) (*LandRecord, error) {
	if stateCode == "" || districtCode == "" || surveyNo == "" {
		return nil, fmt.Errorf("VALIDATION_ERROR: stateCode, districtCode, and surveyNo are all required")
	}

	surveyKey, err := createSurveyIndexKey(ctx, stateCode, districtCode, surveyNo)
	if err != nil {
		return nil, fmt.Errorf("failed to create survey index key: %v", err)
	}

	propertyIDBytes, err := ctx.GetStub().GetState(surveyKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read survey index: %v", err)
	}
	if propertyIDBytes == nil {
		return nil, fmt.Errorf("PROPERTY_NOT_FOUND: no property for survey %s/%s/%s", stateCode, districtCode, surveyNo)
	}

	return s.GetProperty(ctx, string(propertyIDBytes))
}

// QueryByLocation returns all properties in the specified administrative
// location. Uses the LOCATION composite key index for hierarchical queries.
func (s *LandRegistryContract) QueryByLocation(ctx contractapi.TransactionContextInterface, stateCode, districtCode, tehsilCode, villageCode string) ([]*LandRecord, error) {
	if stateCode == "" {
		return nil, fmt.Errorf("VALIDATION_ERROR: stateCode is required")
	}

	attrs := []string{stateCode}
	if districtCode != "" {
		attrs = append(attrs, districtCode)
	}
	if tehsilCode != "" {
		attrs = append(attrs, tehsilCode)
	}
	if villageCode != "" {
		attrs = append(attrs, villageCode)
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixLocationIndex, attrs)
	if err != nil {
		return nil, fmt.Errorf("failed to query location index: %v", err)
	}
	defer iterator.Close()

	var properties []*LandRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate location index: %v", err)
		}
		propertyID := string(kv.Value)
		property, err := s.GetProperty(ctx, propertyID)
		if err != nil {
			continue
		}
		properties = append(properties, property)
	}
	return properties, nil
}

// ============================================================
// TRANSFERS
// ============================================================

// InitiateTransfer creates a new transfer request. The transfer goes
// through multiple stages before finalization. Returns the transfer ID.
// Requires the "registrar" role.
func (s *LandRegistryContract) InitiateTransfer(ctx contractapi.TransactionContextInterface, transferJSON string) (string, error) {
	// ABAC: Only registrars can initiate transfers
	if err := requireRole(ctx, "registrar"); err != nil {
		return "", err
	}

	var transfer TransferRecord
	if err := json.Unmarshal([]byte(transferJSON), &transfer); err != nil {
		return "", fmt.Errorf("INVALID_INPUT: failed to parse transfer JSON: %v", err)
	}

	// Validate property exists
	if err := validatePropertyID(transfer.PropertyID); err != nil {
		return "", err
	}
	property, err := s.GetProperty(ctx, transfer.PropertyID)
	if err != nil {
		return "", err
	}

	// State boundary check
	if err := requireStateAccess(ctx, property.Location.StateCode); err != nil {
		return "", err
	}

	// Rule 10: Aadhaar mandatory for both parties
	if transfer.Seller.AadhaarHash == "" || transfer.Buyer.AadhaarHash == "" {
		return "", fmt.Errorf("AADHAAR_REQUIRED: both seller and buyer must have aadhaarHash")
	}

	// Rule 1: No transfer if dispute flag active
	if property.DisputeStatus != "CLEAR" {
		return "", fmt.Errorf("LAND_DISPUTED: property %s has active dispute, cannot initiate transfer", transfer.PropertyID)
	}

	// Check property is not frozen
	if property.Status == "FROZEN" {
		return "", fmt.Errorf("LAND_FROZEN: property %s is frozen by court order", transfer.PropertyID)
	}

	// Check property is not already in transfer
	if property.Status == "TRANSFER_IN_PROGRESS" {
		return "", fmt.Errorf("TRANSFER_IN_PROGRESS: property %s already has an active transfer", transfer.PropertyID)
	}

	// Rule 5: No active cooling period
	if property.CoolingPeriod.Active {
		return "", fmt.Errorf("LAND_COOLING_PERIOD: property %s in cooling period until %s", transfer.PropertyID, property.CoolingPeriod.ExpiresAt)
	}

	// Rule 4: Verify seller is current owner
	sellerIsOwner := false
	for _, owner := range property.CurrentOwner.Owners {
		if owner.AadhaarHash == transfer.Seller.AadhaarHash {
			sellerIsOwner = true
			break
		}
	}
	if !sellerIsOwner {
		return "", fmt.Errorf("TRANSFER_INVALID_OWNER: seller %s is not a current owner of %s", transfer.Seller.Name, transfer.PropertyID)
	}

	// Generate transfer ID
	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	if transfer.TransferID == "" {
		transfer.TransferID = "xfr_" + txID[:8]
	}

	// Set transfer metadata
	transfer.DocType = "transferRecord"
	transfer.Status = "INITIATED"
	transfer.StatusHistory = []StatusEntry{
		{Status: "INITIATED", At: now, By: getCallerID(ctx)},
	}
	transfer.RegisteredBy = getCallerID(ctx)
	transfer.FabricTxID = txID
	transfer.CreatedAt = now
	transfer.UpdatedAt = now

	// Store transfer
	transferKey, err := createTransferKey(ctx, transfer.TransferID)
	if err != nil {
		return "", fmt.Errorf("failed to create transfer key: %v", err)
	}
	transferBytes, err := json.Marshal(transfer)
	if err != nil {
		return "", fmt.Errorf("failed to marshal transfer: %v", err)
	}
	if err := ctx.GetStub().PutState(transferKey, transferBytes); err != nil {
		return "", fmt.Errorf("failed to put transfer state: %v", err)
	}

	// Update property status to TRANSFER_IN_PROGRESS
	property.Status = "TRANSFER_IN_PROGRESS"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	landKey, _ := createLandKey(ctx, property.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return "", fmt.Errorf("failed to update property status: %v", err)
	}

	// Emit event
	event := TransferEvent{
		Type:              "TRANSFER_INITIATED",
		TransferID:        transfer.TransferID,
		PropertyID:        transfer.PropertyID,
		PreviousOwnerHash: transfer.Seller.AadhaarHash,
		NewOwnerHash:      transfer.Buyer.AadhaarHash,
		FabricTxID:        txID,
		Timestamp:         now,
		StateCode:         property.Location.StateCode,
		ChannelID:         ctx.GetStub().GetChannelID(),
	}
	if err := emitEvent(ctx, "TRANSFER_INITIATED", event); err != nil {
		return "", err
	}

	return transfer.TransferID, nil
}

// ExecuteTransfer executes a property transfer after all prerequisites
// are met. This is the core function that enforces ALL 10 business rules
// from the CLAUDE.md specification:
//
//  1. No transfer if dispute flag active
//  2. Stamp duty calculated before transfer (circle rate vs declared value)
//  3. Mutation is automatic after registration
//  4. Minor's property requires court order
//  5. NRI transfers require FEMA compliance
//  6. Encumbrance check mandatory
//  7. Two-witness digital signatures required
//  8. 72-hour cooling period
//  9. Never overwrite; always append
//  10. Aadhaar mandatory
//
// Only users with the "registrar" role can execute transfers.
func (s *LandRegistryContract) ExecuteTransfer(ctx contractapi.TransactionContextInterface, transferID string) error {
	// ========================================
	// STEP 1: IDENTITY & AUTHORIZATION
	// ========================================
	if err := requireRole(ctx, "registrar"); err != nil {
		return err
	}

	// ========================================
	// STEP 2: FETCH & VALIDATE TRANSFER REQUEST
	// ========================================
	transferKey, err := createTransferKey(ctx, transferID)
	if err != nil {
		return fmt.Errorf("failed to create transfer key: %v", err)
	}
	transferBytes, err := ctx.GetStub().GetState(transferKey)
	if err != nil || transferBytes == nil {
		return fmt.Errorf("TRANSFER_NOT_FOUND: %s", transferID)
	}

	var transfer TransferRecord
	if err := json.Unmarshal(transferBytes, &transfer); err != nil {
		return fmt.Errorf("failed to unmarshal transfer: %v", err)
	}

	// Verify transfer is in correct state
	if transfer.Status != "SIGNATURES_COMPLETE" {
		return fmt.Errorf("TRANSFER_INVALID_STATE: expected SIGNATURES_COMPLETE, got %s", transfer.Status)
	}

	// ========================================
	// STEP 3: FETCH & VALIDATE PROPERTY
	// ========================================
	property, err := s.GetProperty(ctx, transfer.PropertyID)
	if err != nil {
		return err
	}

	// State boundary check
	if err := requireStateAccess(ctx, property.Location.StateCode); err != nil {
		return err
	}

	// ========================================
	// STEP 4: BUSINESS RULE VALIDATION (ALL 10)
	// ========================================

	// Rule 10: Aadhaar mandatory — verify both parties
	if transfer.Seller.AadhaarHash == "" || transfer.Buyer.AadhaarHash == "" {
		return fmt.Errorf("AADHAAR_REQUIRED: both seller and buyer must have aadhaarHash")
	}

	// Rule 1: No transfer if disputed
	if property.DisputeStatus != "CLEAR" {
		return fmt.Errorf("LAND_DISPUTED: property %s has active dispute", transfer.PropertyID)
	}

	// Rule 1 (continued): No transfer if frozen by court
	if property.Status == "FROZEN" {
		return fmt.Errorf("LAND_FROZEN: property %s is frozen by court order", transfer.PropertyID)
	}

	// Rule 6: Encumbrance check mandatory
	if property.EncumbranceStatus != "CLEAR" {
		activeEncumbrances, err := getActiveEncumbrances(ctx, transfer.PropertyID)
		if err != nil {
			return fmt.Errorf("failed to check encumbrances: %v", err)
		}
		for _, enc := range activeEncumbrances {
			if enc.Type == "MORTGAGE" && !transfer.BankConsent {
				return fmt.Errorf("LAND_ENCUMBERED: mortgage by %s requires bank consent before transfer", enc.Institution.Name)
			}
			if enc.Type == "COURT_ORDER" {
				return fmt.Errorf("LAND_ENCUMBERED: court order encumbrance %s must be released before transfer", enc.EncumbranceID)
			}
		}
	}

	// Rule 4: Verify seller is current owner
	sellerIsOwner := false
	for _, owner := range property.CurrentOwner.Owners {
		if owner.AadhaarHash == transfer.Seller.AadhaarHash {
			sellerIsOwner = true
			break
		}
	}
	if !sellerIsOwner {
		return fmt.Errorf("TRANSFER_INVALID_OWNER: seller is not current owner")
	}

	// Rule 5 (no active cooling period): Check cooling period
	if property.CoolingPeriod.Active {
		return fmt.Errorf("LAND_COOLING_PERIOD: property in cooling period until %s", property.CoolingPeriod.ExpiresAt)
	}

	// Rule 2: Stamp duty must be paid and calculated against circle rate
	if transfer.TransactionDetails.StampDutyAmount == 0 {
		return fmt.Errorf("TRANSFER_STAMP_DUTY_UNPAID: stamp duty amount cannot be zero")
	}

	// Rule 2 (anti-benami): Declared value must be >= circle rate value
	if transfer.TransactionDetails.DeclaredValue < transfer.TransactionDetails.CircleRateValue {
		return fmt.Errorf("TRANSFER_UNDERVALUED: declared value (%d paisa) is below circle rate (%d paisa)", transfer.TransactionDetails.DeclaredValue, transfer.TransactionDetails.CircleRateValue)
	}

	// Rule 4: Minor's property requires court order
	for _, owner := range property.CurrentOwner.Owners {
		if owner.IsMinor && transfer.CourtOrderRef == "" {
			return fmt.Errorf("TRANSFER_MINOR_PROPERTY: court order required for transfer of minor's property (owner: %s)", owner.Name)
		}
	}

	// Rule 5: NRI transfers require FEMA compliance check
	if transfer.IsNRI && !transfer.FEMACompliance {
		return fmt.Errorf("TRANSFER_FEMA_REQUIRED: NRI transfer requires FEMA compliance clearance")
	}

	// Rule 7: Two-witness digital signatures required
	signedWitnesses := 0
	for _, w := range transfer.Witnesses {
		if w.Signed && w.AadhaarHash != "" {
			signedWitnesses++
		}
	}
	if signedWitnesses < 2 {
		return fmt.Errorf("TRANSFER_WITNESS_REQUIRED: at least 2 witnesses must have signed, got %d", signedWitnesses)
	}

	// ========================================
	// STEP 5: EXECUTE STATE CHANGES
	// ========================================

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	txID := ctx.GetStub().GetTxID()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)

	// Save previous owner info before update (Rule 9: append provenance)
	previousOwner := property.CurrentOwner

	// 5a. Update property ownership
	property.CurrentOwner = OwnerInfo{
		OwnerType: "INDIVIDUAL",
		Owners: []Owner{{
			AadhaarHash:     transfer.Buyer.AadhaarHash,
			Name:            transfer.Buyer.Name,
			SharePercentage: 100,
			IsMinor:         false,
		}},
		OwnershipType:           previousOwner.OwnershipType,
		AcquisitionType:         "SALE",
		AcquisitionDate:         now[:10],
		AcquisitionDocumentHash: transfer.Documents.SaleDeedHash,
	}

	// Rule 8: 72-hour cooling period before finality
	coolingExpiry := time.Unix(timestamp.Seconds, 0).Add(72 * time.Hour).Format(time.RFC3339)
	property.CoolingPeriod = CoolingPeriod{
		Active:    true,
		ExpiresAt: coolingExpiry,
	}

	property.Status = "ACTIVE"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.Provenance.Sequence++
	property.FabricTxID = txID

	// 5b. Save updated property (Rule 9: Fabric history preserves all versions)
	landKey, _ := createLandKey(ctx, transfer.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property: %v", err)
	}

	// 5c. Update owner indexes
	for _, prevOwner := range previousOwner.Owners {
		_ = deleteOwnerIndex(ctx, prevOwner.AadhaarHash, property.PropertyID)
	}
	for _, newOwner := range property.CurrentOwner.Owners {
		_ = putOwnerIndex(ctx, newOwner.AadhaarHash, property.PropertyID)
	}

	// 5d. Update transfer status
	transfer.Status = "REGISTERED_PENDING_FINALITY"
	transfer.StatusHistory = append(transfer.StatusHistory, StatusEntry{
		Status: "REGISTERED_PENDING_FINALITY",
		At:     now,
		By:     getCallerID(ctx),
	})
	transfer.FabricTxID = txID
	transfer.UpdatedAt = now
	transferUpdatedBytes, _ := json.Marshal(transfer)
	if err := ctx.GetStub().PutState(transferKey, transferUpdatedBytes); err != nil {
		return fmt.Errorf("failed to update transfer: %v", err)
	}

	// Rule 3: Mutation is automatic after registration
	mutationID := "mut_" + txID[:8]
	mutation := MutationRecord{
		DocType:    "mutationRecord",
		MutationID: mutationID,
		PropertyID: transfer.PropertyID,
		Type:       "SALE",
		TransferID: transferID,
		PreviousOwner: OwnerRef{
			AadhaarHash: previousOwner.Owners[0].AadhaarHash,
			Name:        previousOwner.Owners[0].Name,
		},
		NewOwner: OwnerRef{
			AadhaarHash: transfer.Buyer.AadhaarHash,
			Name:        transfer.Buyer.Name,
		},
		Status:               "AUTO_APPROVED",
		ApprovedBy:           "system",
		ApprovedAt:           now,
		RevenueRecordUpdated: true,
		CreatedAt:            now,
	}
	mutationKey, _ := createMutationKey(ctx, mutationID)
	mutationBytes, _ := json.Marshal(mutation)
	if err := ctx.GetStub().PutState(mutationKey, mutationBytes); err != nil {
		return fmt.Errorf("failed to create mutation record: %v", err)
	}

	// ========================================
	// STEP 6: EMIT EVENTS
	// ========================================

	// Transfer event for middleware (PostgreSQL sync + Algorand anchoring)
	transferEvent := TransferEvent{
		Type:              "TRANSFER_COMPLETED",
		TransferID:        transferID,
		PropertyID:        transfer.PropertyID,
		PreviousOwnerHash: previousOwner.Owners[0].AadhaarHash,
		NewOwnerHash:      transfer.Buyer.AadhaarHash,
		FabricTxID:        txID,
		Timestamp:         now,
		MutationID:        mutationID,
		DocumentHash:      transfer.Documents.SaleDeedHash,
		StateCode:         property.Location.StateCode,
		ChannelID:         ctx.GetStub().GetChannelID(),
	}
	if err := emitEvent(ctx, "TRANSFER_COMPLETED", transferEvent); err != nil {
		return err
	}

	return nil
}

// CancelTransfer cancels a pending transfer and resets the property
// status back to ACTIVE. Only registrars can cancel transfers.
func (s *LandRegistryContract) CancelTransfer(ctx contractapi.TransactionContextInterface, transferID, reason string) error {
	if err := requireRole(ctx, "registrar"); err != nil {
		return err
	}

	transferKey, err := createTransferKey(ctx, transferID)
	if err != nil {
		return fmt.Errorf("failed to create transfer key: %v", err)
	}
	transferBytes, err := ctx.GetStub().GetState(transferKey)
	if err != nil || transferBytes == nil {
		return fmt.Errorf("TRANSFER_NOT_FOUND: %s", transferID)
	}

	var transfer TransferRecord
	if err := json.Unmarshal(transferBytes, &transfer); err != nil {
		return fmt.Errorf("failed to unmarshal transfer: %v", err)
	}

	// Cannot cancel an already finalized transfer
	if transfer.Status == "REGISTERED_FINAL" {
		return fmt.Errorf("TRANSFER_ALREADY_FINAL: cannot cancel a finalized transfer")
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	// Update transfer status
	transfer.Status = "CANCELLED"
	transfer.StatusHistory = append(transfer.StatusHistory, StatusEntry{
		Status: "CANCELLED",
		At:     now,
		By:     getCallerID(ctx) + ": " + reason,
	})
	transfer.FabricTxID = txID
	transfer.UpdatedAt = now

	transferUpdatedBytes, _ := json.Marshal(transfer)
	if err := ctx.GetStub().PutState(transferKey, transferUpdatedBytes); err != nil {
		return fmt.Errorf("failed to update transfer: %v", err)
	}

	// Reset property status to ACTIVE
	property, err := s.GetProperty(ctx, transfer.PropertyID)
	if err != nil {
		return err
	}
	property.Status = "ACTIVE"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)

	landKey, _ := createLandKey(ctx, transfer.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to reset property status: %v", err)
	}

	event := TransferEvent{
		Type:              "TRANSFER_CANCELLED",
		TransferID:        transferID,
		PropertyID:        transfer.PropertyID,
		PreviousOwnerHash: transfer.Seller.AadhaarHash,
		NewOwnerHash:      transfer.Buyer.AadhaarHash,
		FabricTxID:        txID,
		Timestamp:         now,
		StateCode:         property.Location.StateCode,
		ChannelID:         ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "TRANSFER_CANCELLED", event)
}

// FinalizeAfterCooling finalizes a transfer after the 72-hour cooling
// period has expired. This sets the transfer status to REGISTERED_FINAL
// and deactivates the cooling period on the property.
func (s *LandRegistryContract) FinalizeAfterCooling(ctx contractapi.TransactionContextInterface, transferID string) error {
	// Either registrar or admin can finalize (system-triggered via BullMQ job)
	if _, err := requireAnyRole(ctx, "registrar", "admin"); err != nil {
		return err
	}

	transferKey, err := createTransferKey(ctx, transferID)
	if err != nil {
		return fmt.Errorf("failed to create transfer key: %v", err)
	}
	transferBytes, err := ctx.GetStub().GetState(transferKey)
	if err != nil || transferBytes == nil {
		return fmt.Errorf("TRANSFER_NOT_FOUND: %s", transferID)
	}

	var transfer TransferRecord
	if err := json.Unmarshal(transferBytes, &transfer); err != nil {
		return fmt.Errorf("failed to unmarshal transfer: %v", err)
	}

	if transfer.Status != "REGISTERED_PENDING_FINALITY" {
		return fmt.Errorf("TRANSFER_INVALID_STATE: expected REGISTERED_PENDING_FINALITY, got %s", transfer.Status)
	}

	// Verify cooling period has expired
	property, err := s.GetProperty(ctx, transfer.PropertyID)
	if err != nil {
		return err
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	nowTime := time.Unix(timestamp.Seconds, 0)
	now := nowTime.Format(time.RFC3339)

	if property.CoolingPeriod.Active && property.CoolingPeriod.ExpiresAt != "" {
		expiresAt, err := time.Parse(time.RFC3339, property.CoolingPeriod.ExpiresAt)
		if err == nil && nowTime.Before(expiresAt) {
			return fmt.Errorf("COOLING_PERIOD_ACTIVE: cooling period expires at %s, current time is %s", property.CoolingPeriod.ExpiresAt, now)
		}
	}

	txID := ctx.GetStub().GetTxID()

	// Finalize transfer
	transfer.Status = "REGISTERED_FINAL"
	transfer.StatusHistory = append(transfer.StatusHistory, StatusEntry{
		Status: "REGISTERED_FINAL",
		At:     now,
		By:     "system",
	})
	transfer.FabricTxID = txID
	transfer.UpdatedAt = now

	transferUpdatedBytes, _ := json.Marshal(transfer)
	if err := ctx.GetStub().PutState(transferKey, transferUpdatedBytes); err != nil {
		return fmt.Errorf("failed to finalize transfer: %v", err)
	}

	// Deactivate cooling period on property
	property.CoolingPeriod = CoolingPeriod{Active: false, ExpiresAt: ""}
	property.UpdatedAt = now
	property.UpdatedBy = "system"

	landKey, _ := createLandKey(ctx, transfer.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property cooling period: %v", err)
	}

	event := TransferEvent{
		Type:              "TRANSFER_FINALIZED",
		TransferID:        transferID,
		PropertyID:        transfer.PropertyID,
		PreviousOwnerHash: transfer.Seller.AadhaarHash,
		NewOwnerHash:      transfer.Buyer.AadhaarHash,
		FabricTxID:        txID,
		Timestamp:         now,
		StateCode:         property.Location.StateCode,
		ChannelID:         ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "TRANSFER_FINALIZED", event)
}

// ============================================================
// MUTATIONS
// ============================================================

// ApproveMutation approves a pending mutation (dakhil-kharij).
// Only Tehsildars can approve non-sale mutations (sale mutations
// are auto-approved by ExecuteTransfer).
func (s *LandRegistryContract) ApproveMutation(ctx contractapi.TransactionContextInterface, mutationID string) error {
	if err := requireRole(ctx, "tehsildar"); err != nil {
		return err
	}

	mutationKey, err := createMutationKey(ctx, mutationID)
	if err != nil {
		return fmt.Errorf("failed to create mutation key: %v", err)
	}
	mutationBytes, err := ctx.GetStub().GetState(mutationKey)
	if err != nil || mutationBytes == nil {
		return fmt.Errorf("MUTATION_NOT_FOUND: %s", mutationID)
	}

	var mutation MutationRecord
	if err := json.Unmarshal(mutationBytes, &mutation); err != nil {
		return fmt.Errorf("failed to unmarshal mutation: %v", err)
	}

	if mutation.Status != "PENDING_APPROVAL" {
		return fmt.Errorf("MUTATION_INVALID_STATE: expected PENDING_APPROVAL, got %s", mutation.Status)
	}

	// State boundary check
	propertyStateCode := extractStateCode(mutation.PropertyID)
	if err := requireStateAccess(ctx, propertyStateCode); err != nil {
		return err
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	mutation.Status = "APPROVED"
	mutation.ApprovedBy = getCallerID(ctx)
	mutation.ApprovedAt = now
	mutation.RevenueRecordUpdated = true

	mutationUpdatedBytes, _ := json.Marshal(mutation)
	if err := ctx.GetStub().PutState(mutationKey, mutationUpdatedBytes); err != nil {
		return fmt.Errorf("failed to update mutation: %v", err)
	}

	// Update property ownership based on mutation
	property, err := s.GetProperty(ctx, mutation.PropertyID)
	if err != nil {
		return err
	}

	// Update owner indexes
	for _, oldOwner := range property.CurrentOwner.Owners {
		_ = deleteOwnerIndex(ctx, oldOwner.AadhaarHash, property.PropertyID)
	}

	property.CurrentOwner.Owners = []Owner{{
		AadhaarHash:     mutation.NewOwner.AadhaarHash,
		Name:            mutation.NewOwner.Name,
		SharePercentage: 100,
		IsMinor:         false,
	}}
	property.CurrentOwner.AcquisitionType = mutation.Type
	property.CurrentOwner.AcquisitionDate = now[:10]
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.Provenance.Sequence++
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, property.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property after mutation: %v", err)
	}

	// Create new owner index
	_ = putOwnerIndex(ctx, mutation.NewOwner.AadhaarHash, property.PropertyID)

	event := MutationEvent{
		Type:         "MUTATION_APPROVED",
		MutationID:   mutationID,
		PropertyID:   mutation.PropertyID,
		MutationType: mutation.Type,
		FabricTxID:   txID,
		Timestamp:    now,
		StateCode:    propertyStateCode,
		ChannelID:    ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "MUTATION_APPROVED", event)
}

// RejectMutation rejects a pending mutation with a reason.
// Only Tehsildars can reject mutations.
func (s *LandRegistryContract) RejectMutation(ctx contractapi.TransactionContextInterface, mutationID, reason string) error {
	if err := requireRole(ctx, "tehsildar"); err != nil {
		return err
	}

	mutationKey, err := createMutationKey(ctx, mutationID)
	if err != nil {
		return fmt.Errorf("failed to create mutation key: %v", err)
	}
	mutationBytes, err := ctx.GetStub().GetState(mutationKey)
	if err != nil || mutationBytes == nil {
		return fmt.Errorf("MUTATION_NOT_FOUND: %s", mutationID)
	}

	var mutation MutationRecord
	if err := json.Unmarshal(mutationBytes, &mutation); err != nil {
		return fmt.Errorf("failed to unmarshal mutation: %v", err)
	}

	if mutation.Status != "PENDING_APPROVAL" {
		return fmt.Errorf("MUTATION_INVALID_STATE: expected PENDING_APPROVAL, got %s", mutation.Status)
	}

	propertyStateCode := extractStateCode(mutation.PropertyID)
	if err := requireStateAccess(ctx, propertyStateCode); err != nil {
		return err
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	mutation.Status = "REJECTED"
	mutation.ApprovedBy = getCallerID(ctx)
	mutation.ApprovedAt = now
	mutation.RejectedReason = reason
	mutation.RevenueRecordUpdated = false

	mutationUpdatedBytes, _ := json.Marshal(mutation)
	if err := ctx.GetStub().PutState(mutationKey, mutationUpdatedBytes); err != nil {
		return fmt.Errorf("failed to update mutation: %v", err)
	}

	event := MutationEvent{
		Type:         "MUTATION_REJECTED",
		MutationID:   mutationID,
		PropertyID:   mutation.PropertyID,
		MutationType: mutation.Type,
		FabricTxID:   txID,
		Timestamp:    now,
		StateCode:    propertyStateCode,
		ChannelID:    ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "MUTATION_REJECTED", event)
}

// ============================================================
// ENCUMBRANCES
// ============================================================

// AddEncumbrance adds a new encumbrance (mortgage, lien, court order)
// to a property. Only banks and courts can add encumbrances.
func (s *LandRegistryContract) AddEncumbrance(ctx contractapi.TransactionContextInterface, encumbranceJSON string) error {
	if _, err := requireAnyRole(ctx, "bank", "court", "admin"); err != nil {
		return err
	}

	var enc EncumbranceRecord
	if err := json.Unmarshal([]byte(encumbranceJSON), &enc); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse encumbrance JSON: %v", err)
	}

	// Validate property exists
	property, err := s.GetProperty(ctx, enc.PropertyID)
	if err != nil {
		return err
	}

	// Cannot add encumbrance to frozen property
	if property.Status == "FROZEN" {
		return fmt.Errorf("LAND_FROZEN: cannot add encumbrance to frozen property %s", enc.PropertyID)
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	if enc.EncumbranceID == "" {
		enc.EncumbranceID = "enc_" + txID[:8]
	}

	enc.DocType = "encumbranceRecord"
	enc.Status = "ACTIVE"
	enc.CreatedAt = now
	enc.CreatedBy = getCallerID(ctx)

	// Store encumbrance with composite key
	encKey, err := createEncumbranceKey(ctx, enc.PropertyID, enc.EncumbranceID)
	if err != nil {
		return fmt.Errorf("failed to create encumbrance key: %v", err)
	}
	encBytes, err := json.Marshal(enc)
	if err != nil {
		return fmt.Errorf("failed to marshal encumbrance: %v", err)
	}
	if err := ctx.GetStub().PutState(encKey, encBytes); err != nil {
		return fmt.Errorf("failed to put encumbrance state: %v", err)
	}

	// Update property encumbrance status
	property.EncumbranceStatus = "ENCUMBERED"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, enc.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property encumbrance status: %v", err)
	}

	event := EncumbranceEvent{
		Type:            "ENCUMBRANCE_ADDED",
		EncumbranceID:   enc.EncumbranceID,
		PropertyID:      enc.PropertyID,
		EncumbranceType: enc.Type,
		InstitutionName: enc.Institution.Name,
		FabricTxID:      txID,
		Timestamp:       now,
		StateCode:       property.Location.StateCode,
		ChannelID:       ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "ENCUMBRANCE_ADDED", event)
}

// ReleaseEncumbrance releases an active encumbrance. Only the
// institution that created it (or an admin) can release it.
func (s *LandRegistryContract) ReleaseEncumbrance(ctx contractapi.TransactionContextInterface, encumbranceID string) error {
	if _, err := requireAnyRole(ctx, "bank", "court", "admin"); err != nil {
		return err
	}

	// We need to find the encumbrance across all properties
	// Use a rich query on CouchDB (docType + encumbranceId)
	queryString := fmt.Sprintf(`{"selector":{"docType":"encumbranceRecord","encumbranceId":"%s"}}`, encumbranceID)
	iterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return fmt.Errorf("failed to query encumbrance: %v", err)
	}
	defer iterator.Close()

	if !iterator.HasNext() {
		return fmt.Errorf("ENCUMBRANCE_NOT_FOUND: %s", encumbranceID)
	}

	kv, err := iterator.Next()
	if err != nil {
		return fmt.Errorf("failed to read encumbrance: %v", err)
	}

	var enc EncumbranceRecord
	if err := json.Unmarshal(kv.Value, &enc); err != nil {
		return fmt.Errorf("failed to unmarshal encumbrance: %v", err)
	}

	if enc.Status != "ACTIVE" {
		return fmt.Errorf("ENCUMBRANCE_NOT_ACTIVE: encumbrance %s has status %s", encumbranceID, enc.Status)
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	enc.Status = "RELEASED"

	// Store updated encumbrance
	encKey, _ := createEncumbranceKey(ctx, enc.PropertyID, enc.EncumbranceID)
	encBytes, _ := json.Marshal(enc)
	if err := ctx.GetStub().PutState(encKey, encBytes); err != nil {
		return fmt.Errorf("failed to update encumbrance: %v", err)
	}

	// Check if any other active encumbrances remain
	remaining, err := getActiveEncumbrances(ctx, enc.PropertyID)
	if err != nil {
		return fmt.Errorf("failed to check remaining encumbrances: %v", err)
	}

	property, err := s.GetProperty(ctx, enc.PropertyID)
	if err != nil {
		return err
	}

	if len(remaining) == 0 {
		property.EncumbranceStatus = "CLEAR"
	}
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, enc.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property encumbrance status: %v", err)
	}

	event := EncumbranceEvent{
		Type:            "ENCUMBRANCE_RELEASED",
		EncumbranceID:   enc.EncumbranceID,
		PropertyID:      enc.PropertyID,
		EncumbranceType: enc.Type,
		InstitutionName: enc.Institution.Name,
		FabricTxID:      txID,
		Timestamp:       now,
		StateCode:       property.Location.StateCode,
		ChannelID:       ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "ENCUMBRANCE_RELEASED", event)
}

// GetEncumbrances returns all encumbrances (active and released)
// for the specified property.
func (s *LandRegistryContract) GetEncumbrances(ctx contractapi.TransactionContextInterface, propertyID string) ([]*EncumbranceRecord, error) {
	if err := validatePropertyID(propertyID); err != nil {
		return nil, err
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixEncumbrance, []string{propertyID})
	if err != nil {
		return nil, fmt.Errorf("failed to query encumbrances: %v", err)
	}
	defer iterator.Close()

	var encumbrances []*EncumbranceRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate encumbrances: %v", err)
		}
		var enc EncumbranceRecord
		if err := json.Unmarshal(kv.Value, &enc); err != nil {
			continue
		}
		encumbrances = append(encumbrances, &enc)
	}
	return encumbrances, nil
}

// ============================================================
// DISPUTES
// ============================================================

// FlagDispute flags a legal dispute against a property. Only courts
// and admins can flag disputes. This changes the property's dispute
// status to prevent transfers.
func (s *LandRegistryContract) FlagDispute(ctx contractapi.TransactionContextInterface, disputeJSON string) error {
	if _, err := requireAnyRole(ctx, "court", "admin"); err != nil {
		return err
	}

	var dispute DisputeRecord
	if err := json.Unmarshal([]byte(disputeJSON), &dispute); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse dispute JSON: %v", err)
	}

	// Validate property exists
	property, err := s.GetProperty(ctx, dispute.PropertyID)
	if err != nil {
		return err
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	if dispute.DisputeID == "" {
		dispute.DisputeID = "dsp_" + txID[:8]
	}

	dispute.DocType = "disputeRecord"
	if dispute.Status == "" {
		dispute.Status = "FILED"
	}
	dispute.CreatedAt = now

	// Store dispute
	disputeKey, err := createDisputeKey(ctx, dispute.PropertyID, dispute.DisputeID)
	if err != nil {
		return fmt.Errorf("failed to create dispute key: %v", err)
	}
	disputeBytes, err := json.Marshal(dispute)
	if err != nil {
		return fmt.Errorf("failed to marshal dispute: %v", err)
	}
	if err := ctx.GetStub().PutState(disputeKey, disputeBytes); err != nil {
		return fmt.Errorf("failed to put dispute state: %v", err)
	}

	// Update property dispute status (Rule 1: blocks all transfers)
	property.DisputeStatus = "DISPUTED"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, dispute.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property dispute status: %v", err)
	}

	event := DisputeEvent{
		Type:        "DISPUTE_FLAGGED",
		DisputeID:   dispute.DisputeID,
		PropertyID:  dispute.PropertyID,
		DisputeType: dispute.Type,
		FabricTxID:  txID,
		Timestamp:   now,
		StateCode:   property.Location.StateCode,
		ChannelID:   ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "DISPUTE_FLAGGED", event)
}

// ResolveDispute resolves a dispute with the given resolution.
// Only courts and admins can resolve disputes.
func (s *LandRegistryContract) ResolveDispute(ctx contractapi.TransactionContextInterface, disputeID, resolution string) error {
	if _, err := requireAnyRole(ctx, "court", "admin"); err != nil {
		return err
	}

	// Find the dispute via rich query
	queryString := fmt.Sprintf(`{"selector":{"docType":"disputeRecord","disputeId":"%s"}}`, disputeID)
	iterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return fmt.Errorf("failed to query dispute: %v", err)
	}
	defer iterator.Close()

	if !iterator.HasNext() {
		return fmt.Errorf("DISPUTE_NOT_FOUND: %s", disputeID)
	}

	kv, err := iterator.Next()
	if err != nil {
		return fmt.Errorf("failed to read dispute: %v", err)
	}

	var dispute DisputeRecord
	if err := json.Unmarshal(kv.Value, &dispute); err != nil {
		return fmt.Errorf("failed to unmarshal dispute: %v", err)
	}

	if dispute.Status == "RESOLVED_IN_FAVOR" || dispute.Status == "RESOLVED_AGAINST" || dispute.Status == "SETTLED" {
		return fmt.Errorf("DISPUTE_ALREADY_RESOLVED: %s has status %s", disputeID, dispute.Status)
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	dispute.Status = resolution
	dispute.ResolvedAt = now
	dispute.Resolution = resolution

	disputeKey, _ := createDisputeKey(ctx, dispute.PropertyID, dispute.DisputeID)
	disputeBytes, _ := json.Marshal(dispute)
	if err := ctx.GetStub().PutState(disputeKey, disputeBytes); err != nil {
		return fmt.Errorf("failed to update dispute: %v", err)
	}

	// Check if any other active disputes remain for this property
	activeDisputes, err := getActiveDisputes(ctx, dispute.PropertyID)
	if err != nil {
		return fmt.Errorf("failed to check remaining disputes: %v", err)
	}

	property, err := s.GetProperty(ctx, dispute.PropertyID)
	if err != nil {
		return err
	}

	if len(activeDisputes) == 0 {
		property.DisputeStatus = "CLEAR"
	}
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, dispute.PropertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update property dispute status: %v", err)
	}

	event := DisputeEvent{
		Type:        "DISPUTE_RESOLVED",
		DisputeID:   dispute.DisputeID,
		PropertyID:  dispute.PropertyID,
		DisputeType: dispute.Type,
		FabricTxID:  txID,
		Timestamp:   now,
		StateCode:   property.Location.StateCode,
		ChannelID:   ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "DISPUTE_RESOLVED", event)
}

// FreezeProperty freezes a property by court order. A frozen property
// cannot be transferred, encumbered, or modified until unfrozen.
func (s *LandRegistryContract) FreezeProperty(ctx contractapi.TransactionContextInterface, propertyID, courtOrderRef string) error {
	if _, err := requireAnyRole(ctx, "court", "admin"); err != nil {
		return err
	}

	property, err := s.GetProperty(ctx, propertyID)
	if err != nil {
		return err
	}

	if property.Status == "FROZEN" {
		return fmt.Errorf("PROPERTY_ALREADY_FROZEN: %s is already frozen", propertyID)
	}

	if courtOrderRef == "" {
		return fmt.Errorf("VALIDATION_ERROR: courtOrderRef is required to freeze a property")
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	property.Status = "FROZEN"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, propertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to freeze property: %v", err)
	}

	event := PropertyFrozenEvent{
		Type:          "PROPERTY_FROZEN",
		PropertyID:    propertyID,
		CourtOrderRef: courtOrderRef,
		FabricTxID:    txID,
		Timestamp:     now,
		StateCode:     property.Location.StateCode,
		ChannelID:     ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_FROZEN", event)
}

// UnfreezeProperty removes the freeze on a property by court order.
func (s *LandRegistryContract) UnfreezeProperty(ctx contractapi.TransactionContextInterface, propertyID, courtOrderRef string) error {
	if _, err := requireAnyRole(ctx, "court", "admin"); err != nil {
		return err
	}

	property, err := s.GetProperty(ctx, propertyID)
	if err != nil {
		return err
	}

	if property.Status != "FROZEN" {
		return fmt.Errorf("PROPERTY_NOT_FROZEN: %s has status %s", propertyID, property.Status)
	}

	if courtOrderRef == "" {
		return fmt.Errorf("VALIDATION_ERROR: courtOrderRef is required to unfreeze a property")
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	property.Status = "ACTIVE"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, propertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to unfreeze property: %v", err)
	}

	event := PropertyFrozenEvent{
		Type:          "PROPERTY_UNFROZEN",
		PropertyID:    propertyID,
		CourtOrderRef: courtOrderRef,
		FabricTxID:    txID,
		Timestamp:     now,
		StateCode:     property.Location.StateCode,
		ChannelID:     ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_UNFROZEN", event)
}

// ============================================================
// PROPERTY OPERATIONS
// ============================================================

// SplitProperty subdivides a property into multiple smaller plots.
// The original property is marked as SPLIT and new properties are
// created with provenance linking back to the original.
// Only registrars can split properties.
func (s *LandRegistryContract) SplitProperty(ctx contractapi.TransactionContextInterface, propertyID string, splitsJSON string) error {
	if err := requireRole(ctx, "registrar"); err != nil {
		return err
	}

	if err := validatePropertyID(propertyID); err != nil {
		return err
	}

	property, err := s.GetProperty(ctx, propertyID)
	if err != nil {
		return err
	}

	if err := requireStateAccess(ctx, property.Location.StateCode); err != nil {
		return err
	}

	if property.Status != "ACTIVE" {
		return fmt.Errorf("PROPERTY_NOT_ACTIVE: cannot split property with status %s", property.Status)
	}
	if property.DisputeStatus != "CLEAR" {
		return fmt.Errorf("LAND_DISPUTED: cannot split disputed property %s", propertyID)
	}

	var splits []SplitRequest
	if err := json.Unmarshal([]byte(splitsJSON), &splits); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse splits JSON: %v", err)
	}

	if len(splits) < 2 {
		return fmt.Errorf("VALIDATION_ERROR: split requires at least 2 sub-plots")
	}

	// Validate total area of splits matches original (with 1% tolerance)
	var totalSplitArea float64
	for _, split := range splits {
		totalSplitArea += split.Area.Value
	}
	areaRatio := totalSplitArea / property.Area.Value
	if areaRatio < 0.99 || areaRatio > 1.01 {
		return fmt.Errorf("AREA_MISMATCH: total split area (%.2f) does not match original (%.2f)", totalSplitArea, property.Area.Value)
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	var newPropertyIDs []string

	for i, split := range splits {
		if err := validatePropertyID(split.NewPropertyID); err != nil {
			return fmt.Errorf("split[%d]: %v", i, err)
		}

		// Validate Aadhaar (Rule 10)
		for _, owner := range split.OwnerInfo.Owners {
			if owner.AadhaarHash == "" {
				return fmt.Errorf("split[%d]: AADHAAR_REQUIRED", i)
			}
		}

		newLandKey, err := createLandKey(ctx, split.NewPropertyID)
		if err != nil {
			return fmt.Errorf("split[%d]: failed to create key: %v", i, err)
		}

		existing, _ := ctx.GetStub().GetState(newLandKey)
		if existing != nil {
			return fmt.Errorf("split[%d]: PROPERTY_EXISTS: %s", i, split.NewPropertyID)
		}

		newProperty := LandRecord{
			DocType:            "landRecord",
			PropertyID:         split.NewPropertyID,
			SurveyNumber:       split.SurveyNumber,
			SubSurveyNumber:    split.SubSurveyNumber,
			Location:           property.Location,
			Area:               split.Area,
			Boundaries:         split.Boundaries,
			CurrentOwner:       split.OwnerInfo,
			LandUse:            property.LandUse,
			LandClassification: property.LandClassification,
			Status:             "ACTIVE",
			DisputeStatus:      "CLEAR",
			EncumbranceStatus:  "CLEAR",
			CoolingPeriod:      CoolingPeriod{Active: false, ExpiresAt: ""},
			TaxInfo:            property.TaxInfo,
			RegistrationInfo:   property.RegistrationInfo,
			AlgorandInfo:       AlgorandInfo{},
			PolygonInfo:        PolygonInfo{Tokenized: false},
			Provenance: Provenance{
				PreviousPropertyID: propertyID,
				SplitFrom:          propertyID,
				MergedFrom:         nil,
				Sequence:           1,
			},
			FabricTxID: txID,
			CreatedAt:  now,
			UpdatedAt:  now,
			CreatedBy:  getCallerID(ctx),
			UpdatedBy:  getCallerID(ctx),
		}

		newPropertyBytes, _ := json.Marshal(newProperty)
		if err := ctx.GetStub().PutState(newLandKey, newPropertyBytes); err != nil {
			return fmt.Errorf("split[%d]: failed to put state: %v", i, err)
		}

		// Create indexes for new property
		for _, owner := range split.OwnerInfo.Owners {
			_ = putOwnerIndex(ctx, owner.AadhaarHash, split.NewPropertyID)
		}
		surveyKey := split.SurveyNumber
		if split.SubSurveyNumber != "" {
			surveyKey = split.SurveyNumber + "/" + split.SubSurveyNumber
		}
		_ = putSurveyIndex(ctx, property.Location.StateCode, property.Location.DistrictCode, surveyKey, split.NewPropertyID)
		_ = putLocationIndex(ctx, property.Location, split.NewPropertyID)

		newPropertyIDs = append(newPropertyIDs, split.NewPropertyID)
	}

	// Mark original property as SPLIT (do NOT delete — Rule 9: never overwrite)
	property.Status = "SPLIT"
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, propertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update original property: %v", err)
	}

	event := PropertySplitEvent{
		Type:             "PROPERTY_SPLIT",
		OriginalProperty: propertyID,
		NewPropertyIDs:   newPropertyIDs,
		FabricTxID:       txID,
		Timestamp:        now,
		StateCode:        property.Location.StateCode,
		ChannelID:        ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_SPLIT", event)
}

// MergeProperties merges multiple properties into a single new property.
// All source properties must have the same owner, be in ACTIVE status,
// and not have disputes or encumbrances.
func (s *LandRegistryContract) MergeProperties(ctx contractapi.TransactionContextInterface, propertyIDsJSON string, mergedPropertyJSON string) error {
	if err := requireRole(ctx, "registrar"); err != nil {
		return err
	}

	var propertyIDs []string
	if err := json.Unmarshal([]byte(propertyIDsJSON), &propertyIDs); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse property IDs: %v", err)
	}

	if len(propertyIDs) < 2 {
		return fmt.Errorf("VALIDATION_ERROR: merge requires at least 2 properties")
	}

	var mergedProperty LandRecord
	if err := json.Unmarshal([]byte(mergedPropertyJSON), &mergedProperty); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse merged property JSON: %v", err)
	}

	if err := validatePropertyID(mergedProperty.PropertyID); err != nil {
		return err
	}

	// Validate all source properties
	var totalArea float64
	var ownerHash string
	for i, propID := range propertyIDs {
		if err := validatePropertyID(propID); err != nil {
			return fmt.Errorf("property[%d]: %v", i, err)
		}

		prop, err := s.GetProperty(ctx, propID)
		if err != nil {
			return fmt.Errorf("property[%d]: %v", i, err)
		}

		if prop.Status != "ACTIVE" {
			return fmt.Errorf("property[%d]: status must be ACTIVE, got %s", i, prop.Status)
		}
		if prop.DisputeStatus != "CLEAR" {
			return fmt.Errorf("property[%d]: cannot merge disputed property", i)
		}
		if prop.EncumbranceStatus != "CLEAR" {
			return fmt.Errorf("property[%d]: cannot merge encumbered property", i)
		}

		// All properties must have the same primary owner
		if len(prop.CurrentOwner.Owners) > 0 {
			if ownerHash == "" {
				ownerHash = prop.CurrentOwner.Owners[0].AadhaarHash
			} else if prop.CurrentOwner.Owners[0].AadhaarHash != ownerHash {
				return fmt.Errorf("property[%d]: all merged properties must have the same owner", i)
			}
		}

		totalArea += prop.Area.Value
	}

	// State boundary check on the first property
	firstProp, _ := s.GetProperty(ctx, propertyIDs[0])
	if err := requireStateAccess(ctx, firstProp.Location.StateCode); err != nil {
		return err
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	// Create the merged property
	mergedProperty.DocType = "landRecord"
	mergedProperty.Status = "ACTIVE"
	mergedProperty.DisputeStatus = "CLEAR"
	mergedProperty.EncumbranceStatus = "CLEAR"
	mergedProperty.CoolingPeriod = CoolingPeriod{Active: false, ExpiresAt: ""}
	mergedProperty.Provenance = Provenance{
		MergedFrom: propertyIDs,
		Sequence:   1,
	}
	mergedProperty.FabricTxID = txID
	mergedProperty.CreatedAt = now
	mergedProperty.UpdatedAt = now
	mergedProperty.CreatedBy = getCallerID(ctx)
	mergedProperty.UpdatedBy = getCallerID(ctx)

	// Validate Aadhaar (Rule 10)
	for _, owner := range mergedProperty.CurrentOwner.Owners {
		if owner.AadhaarHash == "" {
			return fmt.Errorf("AADHAAR_REQUIRED: all owners must have aadhaarHash")
		}
	}

	// Check merged property does not exist
	mergedKey, _ := createLandKey(ctx, mergedProperty.PropertyID)
	existing, _ := ctx.GetStub().GetState(mergedKey)
	if existing != nil {
		return fmt.Errorf("PROPERTY_EXISTS: %s already exists", mergedProperty.PropertyID)
	}

	// Store merged property
	mergedBytes, _ := json.Marshal(mergedProperty)
	if err := ctx.GetStub().PutState(mergedKey, mergedBytes); err != nil {
		return fmt.Errorf("failed to put merged property: %v", err)
	}

	// Create indexes for merged property
	for _, owner := range mergedProperty.CurrentOwner.Owners {
		_ = putOwnerIndex(ctx, owner.AadhaarHash, mergedProperty.PropertyID)
	}
	surveyKey := mergedProperty.SurveyNumber
	if mergedProperty.SubSurveyNumber != "" {
		surveyKey = mergedProperty.SurveyNumber + "/" + mergedProperty.SubSurveyNumber
	}
	_ = putSurveyIndex(ctx, mergedProperty.Location.StateCode, mergedProperty.Location.DistrictCode, surveyKey, mergedProperty.PropertyID)
	_ = putLocationIndex(ctx, mergedProperty.Location, mergedProperty.PropertyID)

	// Mark source properties as MERGED (Rule 9: never overwrite)
	for _, propID := range propertyIDs {
		prop, _ := s.GetProperty(ctx, propID)
		prop.Status = "MERGED"
		prop.UpdatedAt = now
		prop.UpdatedBy = getCallerID(ctx)
		prop.FabricTxID = txID

		propKey, _ := createLandKey(ctx, propID)
		propBytes, _ := json.Marshal(prop)
		_ = ctx.GetStub().PutState(propKey, propBytes)
	}

	event := PropertyMergeEvent{
		Type:              "PROPERTY_MERGED",
		SourcePropertyIDs: propertyIDs,
		MergedPropertyID:  mergedProperty.PropertyID,
		FabricTxID:        txID,
		Timestamp:         now,
		StateCode:         mergedProperty.Location.StateCode,
		ChannelID:         ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "PROPERTY_MERGED", event)
}

// ChangeLandUse changes the land use classification of a property.
// Requires registrar or admin role and a valid approval reference
// from the relevant authority.
func (s *LandRegistryContract) ChangeLandUse(ctx contractapi.TransactionContextInterface, propertyID, newLandUse, approvalRef string) error {
	if _, err := requireAnyRole(ctx, "registrar", "admin"); err != nil {
		return err
	}

	if err := validatePropertyID(propertyID); err != nil {
		return err
	}

	property, err := s.GetProperty(ctx, propertyID)
	if err != nil {
		return err
	}

	if err := requireStateAccess(ctx, property.Location.StateCode); err != nil {
		return err
	}

	if property.Status != "ACTIVE" {
		return fmt.Errorf("PROPERTY_NOT_ACTIVE: cannot change land use for property with status %s", property.Status)
	}

	if newLandUse == "" {
		return fmt.Errorf("VALIDATION_ERROR: newLandUse cannot be empty")
	}
	if approvalRef == "" {
		return fmt.Errorf("VALIDATION_ERROR: approvalRef is required for land use change")
	}

	// Validate land use values
	validLandUses := map[string]bool{
		"AGRICULTURAL": true, "RESIDENTIAL": true, "COMMERCIAL": true,
		"INDUSTRIAL": true, "MIXED_USE": true, "FOREST": true,
		"GOVERNMENT": true, "BARREN": true, "WATER_BODY": true,
	}
	if !validLandUses[newLandUse] {
		return fmt.Errorf("VALIDATION_ERROR: invalid land use '%s'", newLandUse)
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	oldLandUse := property.LandUse
	property.LandUse = newLandUse
	property.UpdatedAt = now
	property.UpdatedBy = getCallerID(ctx)
	property.FabricTxID = txID

	landKey, _ := createLandKey(ctx, propertyID)
	propertyBytes, _ := json.Marshal(property)
	if err := ctx.GetStub().PutState(landKey, propertyBytes); err != nil {
		return fmt.Errorf("failed to update land use: %v", err)
	}

	event := LandUseChangedEvent{
		Type:        "LAND_USE_CHANGED",
		PropertyID:  propertyID,
		OldLandUse:  oldLandUse,
		NewLandUse:  newLandUse,
		ApprovalRef: approvalRef,
		FabricTxID:  txID,
		Timestamp:   now,
		StateCode:   property.Location.StateCode,
		ChannelID:   ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "LAND_USE_CHANGED", event)
}

// ============================================================
// ANCHORING
// ============================================================

// GetStateRoot computes a deterministic Merkle root hash over the
// land records in the given block range. This root is used for
// anchoring to the Algorand public chain.
func (s *LandRegistryContract) GetStateRoot(ctx contractapi.TransactionContextInterface, blockRange string) (string, error) {
	if _, err := requireAnyRole(ctx, "admin", "registrar"); err != nil {
		return "", err
	}

	var br BlockRange
	if err := json.Unmarshal([]byte(blockRange), &br); err != nil {
		return "", fmt.Errorf("INVALID_INPUT: failed to parse block range: %v", err)
	}

	if br.Start < 0 || br.End < br.Start {
		return "", fmt.Errorf("VALIDATION_ERROR: invalid block range [%d, %d]", br.Start, br.End)
	}

	// Query all land records (in production, this would use block event data)
	// For now, compute hash over all current land records
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixLand, []string{})
	if err != nil {
		return "", fmt.Errorf("failed to iterate land records: %v", err)
	}
	defer iterator.Close()

	hasher := sha256.New()
	// Write the block range to the hash to make it deterministic
	hasher.Write([]byte(fmt.Sprintf("BLOCK_RANGE:%d:%d", br.Start, br.End)))

	var keys []string
	keyValueMap := make(map[string][]byte)

	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return "", fmt.Errorf("failed to iterate: %v", err)
		}
		keys = append(keys, kv.Key)
		keyValueMap[kv.Key] = kv.Value
	}

	// Sort keys for deterministic ordering
	sort.Strings(keys)

	for _, key := range keys {
		hasher.Write([]byte(key))
		hasher.Write(keyValueMap[key])
	}

	stateRoot := "sha256:" + hex.EncodeToString(hasher.Sum(nil))
	return stateRoot, nil
}

// RecordAnchor records the result of an Algorand anchoring operation
// back in Fabric for cross-reference. Only admins can record anchors.
func (s *LandRegistryContract) RecordAnchor(ctx contractapi.TransactionContextInterface, anchorJSON string) error {
	if err := requireRole(ctx, "admin"); err != nil {
		return err
	}

	var anchor AnchorRecord
	if err := json.Unmarshal([]byte(anchorJSON), &anchor); err != nil {
		return fmt.Errorf("INVALID_INPUT: failed to parse anchor JSON: %v", err)
	}

	if anchor.StateCode == "" {
		return fmt.Errorf("VALIDATION_ERROR: stateCode is required")
	}
	if anchor.StateRoot == "" {
		return fmt.Errorf("VALIDATION_ERROR: stateRoot is required")
	}
	if anchor.AlgorandTxID == "" {
		return fmt.Errorf("VALIDATION_ERROR: algorandTxId is required")
	}

	timestamp, _ := ctx.GetStub().GetTxTimestamp()
	now := time.Unix(timestamp.Seconds, 0).Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	if anchor.AnchorID == "" {
		anchor.AnchorID = "anc_" + txID[:8]
	}

	anchor.DocType = "anchorRecord"
	anchor.AnchoredAt = now
	anchor.ChannelID = ctx.GetStub().GetChannelID()

	anchorKey, err := createAnchorKey(ctx, anchor.StateCode, anchor.AnchorID)
	if err != nil {
		return fmt.Errorf("failed to create anchor key: %v", err)
	}
	anchorBytes, err := json.Marshal(anchor)
	if err != nil {
		return fmt.Errorf("failed to marshal anchor: %v", err)
	}
	if err := ctx.GetStub().PutState(anchorKey, anchorBytes); err != nil {
		return fmt.Errorf("failed to put anchor state: %v", err)
	}

	event := AnchorRecordedEvent{
		Type:         "ANCHOR_RECORDED",
		AnchorID:     anchor.AnchorID,
		StateCode:    anchor.StateCode,
		StateRoot:    anchor.StateRoot,
		AlgorandTxID: anchor.AlgorandTxID,
		FabricTxID:   txID,
		Timestamp:    now,
		ChannelID:    ctx.GetStub().GetChannelID(),
	}
	return emitEvent(ctx, "ANCHOR_RECORDED", event)
}
