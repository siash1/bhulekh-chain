package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ============================================================
// Composite Key Prefixes
// ============================================================
// These prefixes are used to create composite keys in the Fabric
// world state, enabling efficient range queries and lookups.

const (
	// KeyPrefixLand is the prefix for land record keys: LAND~{propertyId}
	KeyPrefixLand = "LAND"
	// KeyPrefixTransfer is the prefix for transfer record keys: TRANSFER~{transferId}
	KeyPrefixTransfer = "TRANSFER"
	// KeyPrefixEncumbrance is the prefix for encumbrance keys: ENCUMBRANCE~{propertyId}~{encumbranceId}
	KeyPrefixEncumbrance = "ENCUMBRANCE"
	// KeyPrefixDispute is the prefix for dispute keys: DISPUTE~{propertyId}~{disputeId}
	KeyPrefixDispute = "DISPUTE"
	// KeyPrefixMutation is the prefix for mutation keys: MUTATION~{mutationId}
	KeyPrefixMutation = "MUTATION"
	// KeyPrefixAnchor is the prefix for anchor keys: ANCHOR~{stateCode}~{anchorId}
	KeyPrefixAnchor = "ANCHOR"
	// KeyPrefixOwnerIndex is the prefix for the owner lookup index: OWNER~{aadhaarHash}~{propertyId}
	KeyPrefixOwnerIndex = "OWNER"
	// KeyPrefixSurveyIndex is the prefix for survey number lookups: SURVEY~{stateCode}~{districtCode}~{surveyNo}
	KeyPrefixSurveyIndex = "SURVEY"
	// KeyPrefixLocationIndex is the prefix for location-based lookups: LOCATION~{stateCode}~{districtCode}~{tehsilCode}~{villageCode}~{propertyId}
	KeyPrefixLocationIndex = "LOCATION"
)

// ============================================================
// Composite Key Helpers
// ============================================================

// createLandKey creates a composite key for a land record.
func createLandKey(ctx contractapi.TransactionContextInterface, propertyID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixLand, []string{propertyID})
}

// createTransferKey creates a composite key for a transfer record.
func createTransferKey(ctx contractapi.TransactionContextInterface, transferID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixTransfer, []string{transferID})
}

// createEncumbranceKey creates a composite key for an encumbrance record,
// indexed by both propertyId and encumbranceId for range queries.
func createEncumbranceKey(ctx contractapi.TransactionContextInterface, propertyID, encumbranceID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixEncumbrance, []string{propertyID, encumbranceID})
}

// createDisputeKey creates a composite key for a dispute record,
// indexed by both propertyId and disputeId for range queries.
func createDisputeKey(ctx contractapi.TransactionContextInterface, propertyID, disputeID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixDispute, []string{propertyID, disputeID})
}

// createMutationKey creates a composite key for a mutation record.
func createMutationKey(ctx contractapi.TransactionContextInterface, mutationID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixMutation, []string{mutationID})
}

// createAnchorKey creates a composite key for an anchor record,
// indexed by stateCode and anchorId for state-level queries.
func createAnchorKey(ctx contractapi.TransactionContextInterface, stateCode, anchorID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixAnchor, []string{stateCode, anchorID})
}

// createOwnerIndexKey creates a composite key for the owner-to-property index.
func createOwnerIndexKey(ctx contractapi.TransactionContextInterface, aadhaarHash, propertyID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixOwnerIndex, []string{aadhaarHash, propertyID})
}

// createSurveyIndexKey creates a composite key for the survey number index.
func createSurveyIndexKey(ctx contractapi.TransactionContextInterface, stateCode, districtCode, surveyNo string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixSurveyIndex, []string{stateCode, districtCode, surveyNo})
}

// createLocationIndexKey creates a composite key for the location index.
func createLocationIndexKey(ctx contractapi.TransactionContextInterface, stateCode, districtCode, tehsilCode, villageCode, propertyID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(KeyPrefixLocationIndex, []string{stateCode, districtCode, tehsilCode, villageCode, propertyID})
}

// ============================================================
// Property ID Validation
// ============================================================

// propertyIDPattern enforces the format:
// {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}-{SubSurveyNo}
// Example: AP-GNT-TNL-SKM-142-3  or  MH-PUN-HVL-KTJ-1234-0
var propertyIDPattern = regexp.MustCompile(`^[A-Z]{2}-[A-Z]{2,5}-[A-Z]{2,5}-[A-Z]{2,5}-[0-9A-Za-z]+-[0-9A-Za-z]+$`)

// validatePropertyID checks that the propertyId matches the expected
// Indian land record format: {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}-{SubSurveyNo}
func validatePropertyID(propertyID string) error {
	if propertyID == "" {
		return fmt.Errorf("VALIDATION_ERROR: propertyId cannot be empty")
	}
	if !propertyIDPattern.MatchString(propertyID) {
		return fmt.Errorf("VALIDATION_ERROR: propertyId '%s' does not match format {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}-{SubSurveyNo}", propertyID)
	}
	parts := strings.Split(propertyID, "-")
	if len(parts) != 6 {
		return fmt.Errorf("VALIDATION_ERROR: propertyId must have exactly 6 segments separated by '-', got %d", len(parts))
	}
	return nil
}

// extractStateCode pulls the state code from a property ID.
// For example, "AP-GNT-TNL-SKM-142-3" returns "AP".
func extractStateCode(propertyID string) string {
	parts := strings.Split(propertyID, "-")
	if len(parts) >= 1 {
		return parts[0]
	}
	return ""
}

// ============================================================
// Encumbrance Helpers
// ============================================================

// getActiveEncumbrances retrieves all encumbrances with status "ACTIVE"
// for the given property. Uses composite key range query on the
// ENCUMBRANCE~{propertyId} prefix.
func getActiveEncumbrances(ctx contractapi.TransactionContextInterface, propertyID string) ([]*EncumbranceRecord, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixEncumbrance, []string{propertyID})
	if err != nil {
		return nil, fmt.Errorf("failed to query encumbrances for property %s: %v", propertyID, err)
	}
	defer iterator.Close()

	var activeEncumbrances []*EncumbranceRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate encumbrances: %v", err)
		}
		var enc EncumbranceRecord
		if err := json.Unmarshal(kv.Value, &enc); err != nil {
			return nil, fmt.Errorf("failed to unmarshal encumbrance: %v", err)
		}
		if enc.Status == "ACTIVE" {
			activeEncumbrances = append(activeEncumbrances, &enc)
		}
	}
	return activeEncumbrances, nil
}

// hasActiveEncumbrances is a convenience function that returns true
// if the property has any active encumbrances.
func hasActiveEncumbrances(ctx contractapi.TransactionContextInterface, propertyID string) (bool, error) {
	encs, err := getActiveEncumbrances(ctx, propertyID)
	if err != nil {
		return false, err
	}
	return len(encs) > 0, nil
}

// ============================================================
// ABAC (Attribute-Based Access Control) Helpers
// ============================================================

// requireRole verifies that the calling identity has the specified role
// attribute in their X.509 certificate. Roles include: registrar,
// tehsildar, bank, court, admin, citizen.
func requireRole(ctx contractapi.TransactionContextInterface, requiredRole string) error {
	clientIdentity := ctx.GetClientIdentity()
	role, found, err := clientIdentity.GetAttributeValue("role")
	if err != nil {
		return fmt.Errorf("ACCESS_DENIED: failed to read role attribute: %v", err)
	}
	if !found {
		return fmt.Errorf("ACCESS_DENIED: caller identity has no 'role' attribute")
	}
	if role != requiredRole {
		return fmt.Errorf("ACCESS_DENIED: required role '%s', caller has role '%s'", requiredRole, role)
	}
	return nil
}

// requireAnyRole verifies that the calling identity has at least one
// of the specified roles in their X.509 certificate.
func requireAnyRole(ctx contractapi.TransactionContextInterface, allowedRoles ...string) (string, error) {
	clientIdentity := ctx.GetClientIdentity()
	role, found, err := clientIdentity.GetAttributeValue("role")
	if err != nil {
		return "", fmt.Errorf("ACCESS_DENIED: failed to read role attribute: %v", err)
	}
	if !found {
		return "", fmt.Errorf("ACCESS_DENIED: caller identity has no 'role' attribute")
	}
	for _, allowed := range allowedRoles {
		if role == allowed {
			return role, nil
		}
	}
	return "", fmt.Errorf("ACCESS_DENIED: role '%s' is not in allowed roles %v", role, allowedRoles)
}

// requireStateAccess verifies that the calling identity's stateCode
// attribute matches the state of the property being accessed. This
// enforces jurisdictional boundaries — an AP registrar cannot modify
// Maharashtra records.
func requireStateAccess(ctx contractapi.TransactionContextInterface, propertyStateCode string) error {
	clientIdentity := ctx.GetClientIdentity()
	callerState, found, err := clientIdentity.GetAttributeValue("stateCode")
	if err != nil {
		return fmt.Errorf("ACCESS_DENIED: failed to read stateCode attribute: %v", err)
	}
	if !found {
		return fmt.Errorf("ACCESS_DENIED: caller identity has no 'stateCode' attribute")
	}
	if callerState != propertyStateCode {
		return fmt.Errorf("STATE_MISMATCH: registrar from %s cannot modify %s records", callerState, propertyStateCode)
	}
	return nil
}

// getCallerStateCode extracts the stateCode attribute from the caller's
// X.509 certificate. Returns empty string if not found.
func getCallerStateCode(ctx contractapi.TransactionContextInterface) string {
	callerState, found, err := ctx.GetClientIdentity().GetAttributeValue("stateCode")
	if err != nil || !found {
		return ""
	}
	return callerState
}

// getCallerID extracts a human-readable identifier from the caller's
// X.509 certificate for audit trail purposes. Combines role and stateCode.
func getCallerID(ctx contractapi.TransactionContextInterface) string {
	role, _, _ := ctx.GetClientIdentity().GetAttributeValue("role")
	stateCode, _, _ := ctx.GetClientIdentity().GetAttributeValue("stateCode")
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if role != "" && stateCode != "" {
		return fmt.Sprintf("%s:%s:%s", mspID, role, stateCode)
	}
	return mspID
}

// ============================================================
// Active Dispute Helpers
// ============================================================

// getActiveDisputes retrieves all disputes that are not resolved
// for the given property.
func getActiveDisputes(ctx contractapi.TransactionContextInterface, propertyID string) ([]*DisputeRecord, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(KeyPrefixDispute, []string{propertyID})
	if err != nil {
		return nil, fmt.Errorf("failed to query disputes for property %s: %v", propertyID, err)
	}
	defer iterator.Close()

	var activeDisputes []*DisputeRecord
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate disputes: %v", err)
		}
		var dispute DisputeRecord
		if err := json.Unmarshal(kv.Value, &dispute); err != nil {
			return nil, fmt.Errorf("failed to unmarshal dispute: %v", err)
		}
		if dispute.Status != "RESOLVED_IN_FAVOR" && dispute.Status != "RESOLVED_AGAINST" && dispute.Status != "SETTLED" {
			activeDisputes = append(activeDisputes, &dispute)
		}
	}
	return activeDisputes, nil
}

// ============================================================
// Index Management Helpers
// ============================================================

// putOwnerIndex creates or updates the owner-to-property index entry.
// The index value is the propertyId for quick lookups.
func putOwnerIndex(ctx contractapi.TransactionContextInterface, aadhaarHash, propertyID string) error {
	key, err := createOwnerIndexKey(ctx, aadhaarHash, propertyID)
	if err != nil {
		return fmt.Errorf("failed to create owner index key: %v", err)
	}
	return ctx.GetStub().PutState(key, []byte(propertyID))
}

// deleteOwnerIndex removes the owner-to-property index entry.
func deleteOwnerIndex(ctx contractapi.TransactionContextInterface, aadhaarHash, propertyID string) error {
	key, err := createOwnerIndexKey(ctx, aadhaarHash, propertyID)
	if err != nil {
		return fmt.Errorf("failed to create owner index key for deletion: %v", err)
	}
	return ctx.GetStub().DelState(key)
}

// putSurveyIndex creates or updates the survey number index entry.
func putSurveyIndex(ctx contractapi.TransactionContextInterface, stateCode, districtCode, surveyNo, propertyID string) error {
	key, err := createSurveyIndexKey(ctx, stateCode, districtCode, surveyNo)
	if err != nil {
		return fmt.Errorf("failed to create survey index key: %v", err)
	}
	return ctx.GetStub().PutState(key, []byte(propertyID))
}

// putLocationIndex creates or updates the location index entry.
func putLocationIndex(ctx contractapi.TransactionContextInterface, loc Location, propertyID string) error {
	key, err := createLocationIndexKey(ctx, loc.StateCode, loc.DistrictCode, loc.TehsilCode, loc.VillageCode, propertyID)
	if err != nil {
		return fmt.Errorf("failed to create location index key: %v", err)
	}
	return ctx.GetStub().PutState(key, []byte(propertyID))
}
