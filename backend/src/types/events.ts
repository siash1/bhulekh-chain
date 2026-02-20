/**
 * Chaincode event types emitted by Fabric smart contracts.
 * These events are consumed by the backend to trigger:
 *  - PostgreSQL mirror updates
 *  - Algorand anchoring jobs (via BullMQ)
 *  - Socket.io real-time notifications
 *  - Webhook dispatches to banks/courts
 */

// ============================================
// Base Chaincode Event
// ============================================

export interface ChaincodeEvent {
  /** Event name as emitted by the Fabric chaincode */
  eventName: string;
  /** Fabric transaction ID that emitted this event */
  transactionId: string;
  /** Block number in which the transaction was committed */
  blockNumber: number;
  /** ISO 8601 timestamp of the block */
  timestamp: string;
  /** MSP ID of the organization that submitted the transaction */
  mspId: string;
  /** Channel on which the event was emitted */
  channelName: string;
  /** Chaincode name */
  chaincodeName: string;
}

// ============================================
// Property Registered Event
// ============================================

export interface PropertyRegisteredPayload {
  propertyId: string;
  surveyNumber: string;
  stateCode: string;
  districtCode: string;
  tehsilCode: string;
  villageCode: string;
  ownerAadhaarHash: string;
  ownerName: string;
  landUse: string;
  areaSqMeters: number;
  registeredBy: string;
}

export interface PropertyRegisteredEvent extends ChaincodeEvent {
  eventName: 'PropertyRegistered';
  payload: PropertyRegisteredPayload;
}

// ============================================
// Transfer Completed Event
// ============================================

export interface TransferCompletedPayload {
  transferId: string;
  propertyId: string;
  sellerAadhaarHash: string;
  sellerName: string;
  buyerAadhaarHash: string;
  buyerName: string;
  /** Sale amount in paisa */
  saleAmountPaisa: number;
  /** Stamp duty in paisa */
  stampDutyPaisa: number;
  /** Registration fee in paisa */
  registrationFeePaisa: number;
  mutationId: string;
  registeredBy: string;
  coolingPeriodEnds: string;
  saleDeedHash: string;
}

export interface TransferCompletedEvent extends ChaincodeEvent {
  eventName: 'TransferCompleted';
  payload: TransferCompletedPayload;
}

// ============================================
// Encumbrance Added Event
// ============================================

export interface EncumbranceAddedPayload {
  encumbranceId: string;
  propertyId: string;
  type: 'MORTGAGE' | 'LIEN' | 'COURT_ORDER';
  institutionName: string;
  institutionBranchCode: string;
  /** Sanctioned/order amount in paisa */
  amountPaisa: number;
  loanAccountNumber: string;
  startDate: string;
  endDate: string;
  addedBy: string;
}

export interface EncumbranceAddedEvent extends ChaincodeEvent {
  eventName: 'EncumbranceAdded';
  payload: EncumbranceAddedPayload;
}

// ============================================
// Encumbrance Released Event
// ============================================

export interface EncumbranceReleasedPayload {
  encumbranceId: string;
  propertyId: string;
  type: 'MORTGAGE' | 'LIEN' | 'COURT_ORDER';
  institutionName: string;
  releasedBy: string;
}

export interface EncumbranceReleasedEvent extends ChaincodeEvent {
  eventName: 'EncumbranceReleased';
  payload: EncumbranceReleasedPayload;
}

// ============================================
// Dispute Flagged Event
// ============================================

export interface DisputeFlaggedPayload {
  disputeId: string;
  propertyId: string;
  type: string;
  filedByAadhaarHash: string;
  filedByName: string;
  againstAadhaarHash: string;
  againstName: string;
  courtName: string;
  caseNumber: string;
  description: string;
}

export interface DisputeFlaggedEvent extends ChaincodeEvent {
  eventName: 'DisputeFlagged';
  payload: DisputeFlaggedPayload;
}

// ============================================
// Dispute Resolved Event
// ============================================

export interface DisputeResolvedPayload {
  disputeId: string;
  propertyId: string;
  resolution: 'RESOLVED_IN_FAVOR' | 'RESOLVED_AGAINST' | 'SETTLED';
  resolutionDetails: string;
  resolvedBy: string;
}

export interface DisputeResolvedEvent extends ChaincodeEvent {
  eventName: 'DisputeResolved';
  payload: DisputeResolvedPayload;
}

// ============================================
// Mutation Approved Event
// ============================================

export interface MutationApprovedPayload {
  mutationId: string;
  propertyId: string;
  transferId: string;
  previousOwnerAadhaarHash: string;
  newOwnerAadhaarHash: string;
  newOwnerName: string;
  type: string;
  approvedBy: string;
}

export interface MutationApprovedEvent extends ChaincodeEvent {
  eventName: 'MutationApproved';
  payload: MutationApprovedPayload;
}

// ============================================
// Anchor Committed Event
// ============================================

export interface AnchorCommittedPayload {
  anchorId: string;
  stateCode: string;
  fabricBlockStart: number;
  fabricBlockEnd: number;
  stateRoot: string;
  transactionCount: number;
  algorandTxId: string;
  algorandRound: number;
}

export interface AnchorCommittedEvent extends ChaincodeEvent {
  eventName: 'AnchorCommitted';
  payload: AnchorCommittedPayload;
}

// ============================================
// Union Type for All Chaincode Events
// ============================================

export type BhulekhChainEvent =
  | PropertyRegisteredEvent
  | TransferCompletedEvent
  | EncumbranceAddedEvent
  | EncumbranceReleasedEvent
  | DisputeFlaggedEvent
  | DisputeResolvedEvent
  | MutationApprovedEvent
  | AnchorCommittedEvent;

/**
 * Map of event names to their payload types, for type-safe event handling.
 */
export interface EventPayloadMap {
  PropertyRegistered: PropertyRegisteredPayload;
  TransferCompleted: TransferCompletedPayload;
  EncumbranceAdded: EncumbranceAddedPayload;
  EncumbranceReleased: EncumbranceReleasedPayload;
  DisputeFlagged: DisputeFlaggedPayload;
  DisputeResolved: DisputeResolvedPayload;
  MutationApproved: MutationApprovedPayload;
  AnchorCommitted: AnchorCommittedPayload;
}

/**
 * All possible event names.
 */
export type EventName = keyof EventPayloadMap;
