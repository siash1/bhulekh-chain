/**
 * BhulekhChain shared TypeScript types.
 * These types mirror the data models defined in docs/DATA_MODELS.md
 * and the Fabric chaincode world state structures.
 *
 * All financial values are stored in paisa (1/100 INR) as BigInt
 * to avoid floating-point precision errors.
 */

// ============================================
// Enumerations
// ============================================

export enum UserRole {
  CITIZEN = 'CITIZEN',
  REGISTRAR = 'REGISTRAR',
  TEHSILDAR = 'TEHSILDAR',
  BANK = 'BANK',
  COURT = 'COURT',
  ADMIN = 'ADMIN',
}

export enum LandStatus {
  ACTIVE = 'ACTIVE',
  TRANSFER_IN_PROGRESS = 'TRANSFER_IN_PROGRESS',
  FROZEN = 'FROZEN',
  GOVERNMENT_ACQUIRED = 'GOVERNMENT_ACQUIRED',
}

export enum DisputeStatusEnum {
  CLEAR = 'CLEAR',
  DISPUTED = 'DISPUTED',
}

export enum EncumbranceStatusEnum {
  CLEAR = 'CLEAR',
  ENCUMBERED = 'ENCUMBERED',
}

export enum LandUse {
  AGRICULTURAL = 'AGRICULTURAL',
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
  MIXED = 'MIXED',
  GOVERNMENT = 'GOVERNMENT',
  FOREST = 'FOREST',
  WASTELAND = 'WASTELAND',
}

export enum LandClassification {
  IRRIGATED_WET = 'IRRIGATED_WET',
  IRRIGATED_DRY = 'IRRIGATED_DRY',
  RAIN_FED = 'RAIN_FED',
  GARDEN = 'GARDEN',
  PLANTATION = 'PLANTATION',
  URBAN = 'URBAN',
  BARREN = 'BARREN',
}

export enum OwnershipType {
  FREEHOLD = 'FREEHOLD',
  LEASEHOLD = 'LEASEHOLD',
  GOVERNMENT = 'GOVERNMENT',
  TRUST = 'TRUST',
}

export enum AcquisitionType {
  SALE = 'SALE',
  INHERITANCE = 'INHERITANCE',
  GIFT = 'GIFT',
  PARTITION = 'PARTITION',
  GOVERNMENT_GRANT = 'GOVERNMENT_GRANT',
  COURT_DECREE = 'COURT_DECREE',
  EXCHANGE = 'EXCHANGE',
}

export enum OwnerType {
  INDIVIDUAL = 'INDIVIDUAL',
  JOINT = 'JOINT',
  COMPANY = 'COMPANY',
  TRUST = 'TRUST',
  GOVERNMENT = 'GOVERNMENT',
}

export enum AreaUnit {
  SQ_METERS = 'SQ_METERS',
  ACRES = 'ACRES',
  HECTARES = 'HECTARES',
  BIGHA = 'BIGHA',
  GUNTHA = 'GUNTHA',
  KANAL = 'KANAL',
  MARLA = 'MARLA',
  CENT = 'CENT',
}

export enum TransferStatus {
  INITIATED = 'INITIATED',
  STAMP_DUTY_PENDING = 'STAMP_DUTY_PENDING',
  STAMP_DUTY_PAID = 'STAMP_DUTY_PAID',
  SIGNATURES_PENDING = 'SIGNATURES_PENDING',
  SIGNATURES_COMPLETE = 'SIGNATURES_COMPLETE',
  REGISTERED_PENDING_FINALITY = 'REGISTERED_PENDING_FINALITY',
  OBJECTION_RAISED = 'OBJECTION_RAISED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REGISTERED_FINAL = 'REGISTERED_FINAL',
  CANCELLED = 'CANCELLED',
}

export enum EncumbranceType {
  MORTGAGE = 'MORTGAGE',
  LIEN = 'LIEN',
  COURT_ORDER = 'COURT_ORDER',
}

export enum EncumbranceRecordStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
}

export enum DisputeType {
  OWNERSHIP_CLAIM = 'OWNERSHIP_CLAIM',
  BOUNDARY = 'BOUNDARY',
  INHERITANCE = 'INHERITANCE',
  FRAUD = 'FRAUD',
  GOVERNMENT_ACQUISITION = 'GOVERNMENT_ACQUISITION',
}

export enum DisputeRecordStatus {
  FILED = 'FILED',
  UNDER_ADJUDICATION = 'UNDER_ADJUDICATION',
  RESOLVED_IN_FAVOR = 'RESOLVED_IN_FAVOR',
  RESOLVED_AGAINST = 'RESOLVED_AGAINST',
  SETTLED = 'SETTLED',
}

export enum MutationType {
  SALE = 'SALE',
  INHERITANCE = 'INHERITANCE',
  GIFT = 'GIFT',
  PARTITION = 'PARTITION',
  COURT_DECREE = 'COURT_DECREE',
  EXCHANGE = 'EXCHANGE',
}

export enum MutationStatus {
  AUTO_APPROVED = 'AUTO_APPROVED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ============================================
// GeoJSON Types
// ============================================

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: number[];
}

// ============================================
// Land Record Types
// ============================================

export interface Location {
  stateCode: string;
  stateName: string;
  districtCode: string;
  districtName: string;
  tehsilCode: string;
  tehsilName: string;
  villageCode: string;
  villageName: string;
  pinCode: string;
}

export interface Area {
  /** Area in square meters (canonical unit for storage) */
  value: number;
  unit: AreaUnit;
  /** Area in local/traditional unit */
  localValue: number;
  localUnit: AreaUnit;
}

export interface Boundaries {
  north: string;
  south: string;
  east: string;
  west: string;
  geoJson: GeoJsonPolygon | null;
}

export interface Owner {
  aadhaarHash: string;
  name: string;
  fatherName: string;
  sharePercentage: number;
  isMinor: boolean;
}

export interface OwnerInfo {
  ownerType: OwnerType;
  owners: Owner[];
  ownershipType: OwnershipType;
  acquisitionType: AcquisitionType;
  acquisitionDate: string;
  acquisitionDocumentHash: string;
}

export interface CoolingPeriod {
  active: boolean;
  expiresAt: string;
}

export interface TaxInfo {
  /** Annual land revenue in paisa */
  annualLandRevenue: number;
  lastPaidDate: string;
  paidUpToYear: string;
}

export interface RegistrationInfo {
  registrationNumber: string;
  bookNumber: string;
  subRegistrarOffice: string;
  registrationDate: string;
}

export interface AlgorandInfo {
  asaId: number | null;
  lastAnchorTxId: string;
  lastAnchoredAt: string;
}

export interface PolygonInfo {
  tokenized: boolean;
  erc721TokenId: string | null;
  contractAddress: string | null;
}

export interface Provenance {
  previousPropertyId: string;
  splitFrom: string;
  mergedFrom: string[];
  sequence: number;
}

export interface LandRecord {
  docType: 'landRecord';
  propertyId: string;
  surveyNumber: string;
  subSurveyNumber: string;
  location: Location;
  area: Area;
  boundaries: Boundaries;
  currentOwner: OwnerInfo;
  landUse: LandUse;
  landClassification: LandClassification;
  status: LandStatus;
  disputeStatus: DisputeStatusEnum;
  encumbranceStatus: EncumbranceStatusEnum;
  coolingPeriod: CoolingPeriod;
  taxInfo: TaxInfo;
  registrationInfo: RegistrationInfo;
  algorandInfo: AlgorandInfo;
  polygonInfo: PolygonInfo;
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// ============================================
// Transfer Record Types
// ============================================

export interface PartyInfo {
  aadhaarHash: string;
  name: string;
}

export interface Witness {
  aadhaarHash: string;
  name: string;
  signed: boolean;
}

export interface TransactionDetails {
  /** All amounts in paisa */
  saleAmount: number;
  declaredValue: number;
  circleRateValue: number;
  stampDutyAmount: number;
  registrationFee: number;
  totalGovernmentFees: number;
}

export interface TransferDocuments {
  saleDeedHash: string;
  stampDutyReceiptHash: string;
  encumbranceCertificateHash: string;
}

export interface StatusHistoryEntry {
  status: TransferStatus;
  at: string;
  by: string;
}

export interface TransferRecord {
  docType: 'transferRecord';
  transferId: string;
  propertyId: string;
  seller: PartyInfo;
  buyer: PartyInfo;
  witnesses: Witness[];
  transactionDetails: TransactionDetails;
  documents: TransferDocuments;
  status: TransferStatus;
  statusHistory: StatusHistoryEntry[];
  registeredBy: string;
  fabricTxId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Encumbrance Record Types
// ============================================

export interface InstitutionInfo {
  name: string;
  branchCode: string;
  mspId: string;
}

export interface EncumbranceDetails {
  loanAccountNumber: string;
  /** Sanctioned amount in paisa */
  sanctionedAmount: number;
  /** Outstanding amount in paisa */
  outstandingAmount: number;
  /** Interest rate in basis points (850 = 8.50%) */
  interestRate: number;
  startDate: string;
  endDate: string;
}

export interface EncumbranceRecord {
  docType: 'encumbranceRecord';
  encumbranceId: string;
  propertyId: string;
  type: EncumbranceType;
  status: EncumbranceRecordStatus;
  institution: InstitutionInfo;
  details: EncumbranceDetails;
  courtOrderRef: string;
  createdAt: string;
  createdBy: string;
}

// ============================================
// Dispute Record Types
// ============================================

export interface CourtDetails {
  courtName: string;
  caseNumber: string;
  filedDate: string;
  nextHearingDate: string;
}

export interface DisputeRecord {
  docType: 'disputeRecord';
  disputeId: string;
  propertyId: string;
  type: DisputeType;
  status: DisputeRecordStatus;
  filedBy: PartyInfo;
  against: PartyInfo;
  courtDetails: CourtDetails;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

// ============================================
// Mutation Record Types
// ============================================

export interface OwnerRef {
  aadhaarHash: string;
  name: string;
}

export interface MutationRecord {
  docType: 'mutationRecord';
  mutationId: string;
  propertyId: string;
  type: MutationType;
  transferId: string;
  previousOwner: OwnerRef;
  newOwner: OwnerRef;
  status: MutationStatus;
  approvedBy: string;
  approvedAt: string;
  revenueRecordUpdated: boolean;
  createdAt: string;
}

// ============================================
// Anchor Record Types
// ============================================

export interface BlockRange {
  start: number;
  end: number;
}

export interface AnchorRecord {
  docType: 'anchorRecord';
  anchorId: string;
  stateCode: string;
  channelId: string;
  fabricBlockRange: BlockRange;
  stateRoot: string;
  transactionCount: number;
  algorandTxId: string;
  algorandRound: number;
  anchoredAt: string;
  verified: boolean;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: {
    records: T[];
    pagination: PaginationMeta;
  };
}

export interface ErrorDetail {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetail;
}

// ============================================
// JWT & Auth Types
// ============================================

export interface JwtPayload {
  /** User ID (e.g., "usr_x1y2z3") */
  sub: string;
  /** Salted SHA-256 hash of Aadhaar number */
  aadhaarHash: string;
  /** User display name */
  name: string;
  /** RBAC role */
  role: UserRole;
  /** State jurisdiction code (e.g., "AP") — null for ADMIN */
  stateCode: string | null;
  /** District jurisdiction code — null for state-level or ADMIN */
  districtCode: string | null;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Token type */
  type: 'access' | 'refresh';
}

// ============================================
// Express Request Extension
// ============================================

/**
 * Authenticated user attached to Express request by JWT middleware.
 */
export interface AuthenticatedUser {
  id: string;
  aadhaarHash: string;
  name: string;
  role: UserRole;
  stateCode: string | null;
  districtCode: string | null;
}

/**
 * Extend Express Request to include the authenticated user.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId: string;
    }
  }
}
