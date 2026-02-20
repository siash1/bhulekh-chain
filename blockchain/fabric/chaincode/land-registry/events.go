package main

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ============================================================
// Event Types — emitted by chaincode for middleware consumption
// ============================================================

// TransferEvent is emitted when a property transfer is completed.
// The Node.js middleware uses this to sync PostgreSQL and trigger
// Algorand anchoring.
type TransferEvent struct {
	Type              string `json:"type"`
	TransferID        string `json:"transferId"`
	PropertyID        string `json:"propertyId"`
	PreviousOwnerHash string `json:"previousOwnerHash"`
	NewOwnerHash      string `json:"newOwnerHash"`
	FabricTxID        string `json:"fabricTxId"`
	Timestamp         string `json:"timestamp"`
	MutationID        string `json:"mutationId"`
	DocumentHash      string `json:"documentHash"`
	StateCode         string `json:"stateCode"`
	ChannelID         string `json:"channelId"`
}

// PropertyRegisteredEvent is emitted when a new property is registered
// in the system for the first time.
type PropertyRegisteredEvent struct {
	Type         string `json:"type"`
	PropertyID   string `json:"propertyId"`
	OwnerHash    string `json:"ownerHash"`
	SurveyNumber string `json:"surveyNumber"`
	FabricTxID   string `json:"fabricTxId"`
	Timestamp    string `json:"timestamp"`
	StateCode    string `json:"stateCode"`
	ChannelID    string `json:"channelId"`
}

// EncumbranceEvent is emitted when an encumbrance (mortgage, lien)
// is added to or released from a property.
type EncumbranceEvent struct {
	Type            string `json:"type"`
	EncumbranceID   string `json:"encumbranceId"`
	PropertyID      string `json:"propertyId"`
	EncumbranceType string `json:"encumbranceType"`
	InstitutionName string `json:"institutionName"`
	FabricTxID      string `json:"fabricTxId"`
	Timestamp       string `json:"timestamp"`
	StateCode       string `json:"stateCode"`
	ChannelID       string `json:"channelId"`
}

// DisputeEvent is emitted when a dispute is flagged against or
// resolved for a property.
type DisputeEvent struct {
	Type        string `json:"type"`
	DisputeID   string `json:"disputeId"`
	PropertyID  string `json:"propertyId"`
	DisputeType string `json:"disputeType"`
	FabricTxID  string `json:"fabricTxId"`
	Timestamp   string `json:"timestamp"`
	StateCode   string `json:"stateCode"`
	ChannelID   string `json:"channelId"`
}

// MutationEvent is emitted when a mutation (revenue record update)
// is approved or rejected.
type MutationEvent struct {
	Type         string `json:"type"`
	MutationID   string `json:"mutationId"`
	PropertyID   string `json:"propertyId"`
	MutationType string `json:"mutationType"`
	FabricTxID   string `json:"fabricTxId"`
	Timestamp    string `json:"timestamp"`
	StateCode    string `json:"stateCode"`
	ChannelID    string `json:"channelId"`
}

// PropertyFrozenEvent is emitted when a property is frozen or
// unfrozen by a court order.
type PropertyFrozenEvent struct {
	Type          string `json:"type"`
	PropertyID    string `json:"propertyId"`
	CourtOrderRef string `json:"courtOrderRef"`
	FabricTxID    string `json:"fabricTxId"`
	Timestamp     string `json:"timestamp"`
	StateCode     string `json:"stateCode"`
	ChannelID     string `json:"channelId"`
}

// LandUseChangedEvent is emitted when the land use classification
// of a property is changed.
type LandUseChangedEvent struct {
	Type        string `json:"type"`
	PropertyID  string `json:"propertyId"`
	OldLandUse  string `json:"oldLandUse"`
	NewLandUse  string `json:"newLandUse"`
	ApprovalRef string `json:"approvalRef"`
	FabricTxID  string `json:"fabricTxId"`
	Timestamp   string `json:"timestamp"`
	StateCode   string `json:"stateCode"`
	ChannelID   string `json:"channelId"`
}

// PropertySplitEvent is emitted when a property is subdivided into
// multiple smaller plots.
type PropertySplitEvent struct {
	Type              string   `json:"type"`
	OriginalProperty  string   `json:"originalPropertyId"`
	NewPropertyIDs    []string `json:"newPropertyIds"`
	FabricTxID        string   `json:"fabricTxId"`
	Timestamp         string   `json:"timestamp"`
	StateCode         string   `json:"stateCode"`
	ChannelID         string   `json:"channelId"`
}

// PropertyMergeEvent is emitted when multiple properties are merged
// into a single record.
type PropertyMergeEvent struct {
	Type              string   `json:"type"`
	SourcePropertyIDs []string `json:"sourcePropertyIds"`
	MergedPropertyID  string   `json:"mergedPropertyId"`
	FabricTxID        string   `json:"fabricTxId"`
	Timestamp         string   `json:"timestamp"`
	StateCode         string   `json:"stateCode"`
	ChannelID         string   `json:"channelId"`
}

// AnchorRecordedEvent is emitted when a state root is anchored to
// the Algorand public chain.
type AnchorRecordedEvent struct {
	Type          string `json:"type"`
	AnchorID      string `json:"anchorId"`
	StateCode     string `json:"stateCode"`
	StateRoot     string `json:"stateRoot"`
	AlgorandTxID  string `json:"algorandTxId"`
	FabricTxID    string `json:"fabricTxId"`
	Timestamp     string `json:"timestamp"`
	ChannelID     string `json:"channelId"`
}

// ============================================================
// Event emission helper
// ============================================================

// emitEvent serialises the given event payload to JSON and sets it as
// a chaincode event on the transaction stub. The eventName should be
// one of the standard event type constants (e.g. "TRANSFER_COMPLETED",
// "PROPERTY_REGISTERED", etc.).
func emitEvent(ctx contractapi.TransactionContextInterface, eventName string, payload interface{}) error {
	eventJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal event %s: %v", eventName, err)
	}
	if err := ctx.GetStub().SetEvent(eventName, eventJSON); err != nil {
		return fmt.Errorf("failed to emit event %s: %v", eventName, err)
	}
	return nil
}
