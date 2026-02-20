package main

// ============================================================
// LandRecord — Primary entity representing a property on-chain
// ============================================================

// LandRecord is the core land ownership document stored in Fabric world state.
// All financial fields are in paisa (int64) to avoid floating point errors.
type LandRecord struct {
	DocType            string           `json:"docType"`
	PropertyID         string           `json:"propertyId"`
	SurveyNumber       string           `json:"surveyNumber"`
	SubSurveyNumber    string           `json:"subSurveyNumber"`
	Location           Location         `json:"location"`
	Area               Area             `json:"area"`
	Boundaries         Boundaries       `json:"boundaries"`
	CurrentOwner       OwnerInfo        `json:"currentOwner"`
	LandUse            string           `json:"landUse"`
	LandClassification string           `json:"landClassification"`
	Status             string           `json:"status"`
	DisputeStatus      string           `json:"disputeStatus"`
	EncumbranceStatus  string           `json:"encumbranceStatus"`
	CoolingPeriod      CoolingPeriod    `json:"coolingPeriod"`
	TaxInfo            TaxInfo          `json:"taxInfo"`
	RegistrationInfo   RegistrationInfo `json:"registrationInfo"`
	AlgorandInfo       AlgorandInfo     `json:"algorandInfo"`
	PolygonInfo        PolygonInfo      `json:"polygonInfo"`
	Provenance         Provenance       `json:"provenance"`
	FabricTxID         string           `json:"fabricTxId"`
	CreatedAt          string           `json:"createdAt"`
	UpdatedAt          string           `json:"updatedAt"`
	CreatedBy          string           `json:"createdBy"`
	UpdatedBy          string           `json:"updatedBy"`
}

// Location holds the hierarchical administrative location of a property,
// following Indian revenue department administrative structure.
type Location struct {
	StateCode    string `json:"stateCode"`
	StateName    string `json:"stateName"`
	DistrictCode string `json:"districtCode"`
	DistrictName string `json:"districtName"`
	TehsilCode   string `json:"tehsilCode"`
	TehsilName   string `json:"tehsilName"`
	VillageCode  string `json:"villageCode"`
	VillageName  string `json:"villageName"`
	PinCode      string `json:"pinCode"`
}

// Area holds the measurement details of a property in both standard
// (square meters) and local (acres, bigha, etc.) units.
type Area struct {
	Value     float64 `json:"value"`
	Unit      string  `json:"unit"`
	LocalVal  float64 `json:"localValue"`
	LocalUnit string  `json:"localUnit"`
}

// GeoJSON represents the geographic boundary of a property.
type GeoJSON struct {
	Type        string        `json:"type"`
	Coordinates [][][]float64 `json:"coordinates"`
}

// Boundaries describes the property boundary by adjacent landmarks/owners
// and an optional GeoJSON polygon.
type Boundaries struct {
	North   string  `json:"north"`
	South   string  `json:"south"`
	East    string  `json:"east"`
	West    string  `json:"west"`
	GeoJSON GeoJSON `json:"geoJson"`
}

// OwnerInfo holds the current ownership details including all co-owners,
// ownership type, and acquisition details.
type OwnerInfo struct {
	OwnerType               string  `json:"ownerType"`
	Owners                  []Owner `json:"owners"`
	OwnershipType           string  `json:"ownershipType"`
	AcquisitionType         string  `json:"acquisitionType"`
	AcquisitionDate         string  `json:"acquisitionDate"`
	AcquisitionDocumentHash string  `json:"acquisitionDocumentHash"`
}

// Owner represents a single owner or co-owner of a property.
type Owner struct {
	AadhaarHash     string `json:"aadhaarHash"`
	Name            string `json:"name"`
	FatherName      string `json:"fatherName"`
	SharePercentage int    `json:"sharePercentage"`
	IsMinor         bool   `json:"isMinor"`
}

// CoolingPeriod tracks the 72-hour objection window after a transfer.
type CoolingPeriod struct {
	Active    bool   `json:"active"`
	ExpiresAt string `json:"expiresAt"`
}

// TaxInfo holds land revenue tax payment details (amounts in paisa).
type TaxInfo struct {
	AnnualLandRevenue int64  `json:"annualLandRevenue"`
	LastPaidDate      string `json:"lastPaidDate"`
	PaidUpToYear      string `json:"paidUpToYear"`
}

// RegistrationInfo holds sub-registrar office registration details.
type RegistrationInfo struct {
	RegistrationNumber string `json:"registrationNumber"`
	BookNumber         string `json:"bookNumber"`
	SubRegistrarOffice string `json:"subRegistrarOffice"`
	RegistrationDate   string `json:"registrationDate"`
}

// AlgorandInfo tracks the public verification layer references on Algorand.
type AlgorandInfo struct {
	AsaID          int64  `json:"asaId"`
	LastAnchorTxID string `json:"lastAnchorTxId"`
	LastAnchoredAt string `json:"lastAnchoredAt"`
}

// PolygonInfo tracks tokenization status on the Polygon network.
type PolygonInfo struct {
	Tokenized      bool   `json:"tokenized"`
	ERC721TokenID  string `json:"erc721TokenId"`
	ContractAddr   string `json:"contractAddress"`
}

// Provenance tracks the lineage of a property through splits, merges,
// and successive ownership transfers.
type Provenance struct {
	PreviousPropertyID string   `json:"previousPropertyId"`
	SplitFrom          string   `json:"splitFrom"`
	MergedFrom         []string `json:"mergedFrom"`
	Sequence           int      `json:"sequence"`
}

// ============================================================
// TransferRecord — Records an ownership transfer transaction
// ============================================================

// TransferRecord captures the full lifecycle of a property transfer
// from initiation through finalization, including stamp duty payment
// and witness signatures.
type TransferRecord struct {
	DocType            string             `json:"docType"`
	TransferID         string             `json:"transferId"`
	PropertyID         string             `json:"propertyId"`
	Seller             PartyInfo          `json:"seller"`
	Buyer              PartyInfo          `json:"buyer"`
	Witnesses          []Witness          `json:"witnesses"`
	TransactionDetails TransactionDetails `json:"transactionDetails"`
	Documents          Documents          `json:"documents"`
	Status             string             `json:"status"`
	StatusHistory      []StatusEntry      `json:"statusHistory"`
	BankConsent        bool               `json:"bankConsent"`
	CourtOrderRef      string             `json:"courtOrderRef"`
	FEMACompliance     bool               `json:"femaCompliance"`
	IsNRI              bool               `json:"isNri"`
	RegisteredBy       string             `json:"registeredBy"`
	FabricTxID         string             `json:"fabricTxId"`
	CreatedAt          string             `json:"createdAt"`
	UpdatedAt          string             `json:"updatedAt"`
}

// PartyInfo identifies a buyer or seller in a transfer by their
// Aadhaar hash (never raw Aadhaar) and name.
type PartyInfo struct {
	AadhaarHash string `json:"aadhaarHash"`
	Name        string `json:"name"`
}

// Witness records a witness to a property transfer, including
// their digital signature status.
type Witness struct {
	AadhaarHash string `json:"aadhaarHash"`
	Name        string `json:"name"`
	Signed      bool   `json:"signed"`
}

// TransactionDetails holds all financial aspects of a transfer
// (all amounts in paisa).
type TransactionDetails struct {
	SaleAmount          int64 `json:"saleAmount"`
	DeclaredValue       int64 `json:"declaredValue"`
	CircleRateValue     int64 `json:"circleRateValue"`
	StampDutyAmount     int64 `json:"stampDutyAmount"`
	RegistrationFee     int64 `json:"registrationFee"`
	TotalGovernmentFees int64 `json:"totalGovernmentFees"`
}

// Documents stores IPFS content hashes of supporting documents.
type Documents struct {
	SaleDeedHash                string `json:"saleDeedHash"`
	StampDutyReceiptHash        string `json:"stampDutyReceiptHash"`
	EncumbranceCertificateHash  string `json:"encumbranceCertificateHash"`
}

// StatusEntry records a status transition in the transfer lifecycle.
type StatusEntry struct {
	Status string `json:"status"`
	At     string `json:"at"`
	By     string `json:"by"`
}

// ============================================================
// EncumbranceRecord — Mortgage, lien, or charge on a property
// ============================================================

// EncumbranceRecord represents a financial or legal claim (mortgage,
// lien, court order) against a property.
type EncumbranceRecord struct {
	DocType        string             `json:"docType"`
	EncumbranceID  string             `json:"encumbranceId"`
	PropertyID     string             `json:"propertyId"`
	Type           string             `json:"type"`
	Status         string             `json:"status"`
	Institution    Institution        `json:"institution"`
	Details        EncumbranceDetails `json:"details"`
	CourtOrderRef  string             `json:"courtOrderRef"`
	CreatedAt      string             `json:"createdAt"`
	CreatedBy      string             `json:"createdBy"`
}

// Institution identifies the bank or financial institution
// holding the encumbrance.
type Institution struct {
	Name       string `json:"name"`
	BranchCode string `json:"branchCode"`
	MspID      string `json:"mspId"`
}

// EncumbranceDetails holds the financial details of a mortgage
// or lien (all amounts in paisa).
type EncumbranceDetails struct {
	LoanAccountNumber string `json:"loanAccountNumber"`
	SanctionedAmount  int64  `json:"sanctionedAmount"`
	OutstandingAmount int64  `json:"outstandingAmount"`
	InterestRate      int64  `json:"interestRate"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
}

// ============================================================
// DisputeRecord — Legal dispute flagged against a property
// ============================================================

// DisputeRecord tracks ownership claims, boundary disputes, or
// other legal proceedings against a property.
type DisputeRecord struct {
	DocType      string       `json:"docType"`
	DisputeID    string       `json:"disputeId"`
	PropertyID   string       `json:"propertyId"`
	Type         string       `json:"type"`
	Status       string       `json:"status"`
	FiledBy      PartyInfo    `json:"filedBy"`
	Against      PartyInfo    `json:"against"`
	CourtDetails CourtDetails `json:"courtDetails"`
	Description  string       `json:"description"`
	CreatedAt    string       `json:"createdAt"`
	ResolvedAt   string       `json:"resolvedAt"`
	Resolution   string       `json:"resolution"`
}

// CourtDetails holds court case reference information for a dispute.
type CourtDetails struct {
	CourtName       string `json:"courtName"`
	CaseNumber      string `json:"caseNumber"`
	FiledDate       string `json:"filedDate"`
	NextHearingDate string `json:"nextHearingDate"`
}

// ============================================================
// MutationRecord — Revenue record update after transfer
// ============================================================

// MutationRecord tracks the update of revenue records (dakhil-kharij)
// following a property transfer. In BhulekhChain, sale mutations are
// auto-approved; inheritance/gift mutations require Tehsildar approval.
type MutationRecord struct {
	DocType              string   `json:"docType"`
	MutationID           string   `json:"mutationId"`
	PropertyID           string   `json:"propertyId"`
	Type                 string   `json:"type"`
	TransferID           string   `json:"transferId"`
	PreviousOwner        OwnerRef `json:"previousOwner"`
	NewOwner             OwnerRef `json:"newOwner"`
	Status               string   `json:"status"`
	ApprovedBy           string   `json:"approvedBy"`
	ApprovedAt           string   `json:"approvedAt"`
	RejectedReason       string   `json:"rejectedReason"`
	RevenueRecordUpdated bool     `json:"revenueRecordUpdated"`
	CreatedAt            string   `json:"createdAt"`
}

// OwnerRef is a lightweight reference to a property owner.
type OwnerRef struct {
	AadhaarHash string `json:"aadhaarHash"`
	Name        string `json:"name"`
}

// ============================================================
// AnchorRecord — Cross-chain anchoring record to Algorand
// ============================================================

// AnchorRecord records the anchoring of a range of Fabric blocks
// to the Algorand public chain for independent verification.
type AnchorRecord struct {
	DocType          string     `json:"docType"`
	AnchorID         string     `json:"anchorId"`
	StateCode        string     `json:"stateCode"`
	ChannelID        string     `json:"channelId"`
	FabricBlockRange BlockRange `json:"fabricBlockRange"`
	StateRoot        string     `json:"stateRoot"`
	TransactionCount int        `json:"transactionCount"`
	AlgorandTxID     string     `json:"algorandTxId"`
	AlgorandRound    int64      `json:"algorandRound"`
	AnchoredAt       string     `json:"anchoredAt"`
	Verified         bool       `json:"verified"`
}

// BlockRange specifies a contiguous range of Fabric blocks.
type BlockRange struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

// ============================================================
// SplitRequest — Input for property subdivision
// ============================================================

// SplitRequest describes one sub-plot resulting from a property split.
type SplitRequest struct {
	NewPropertyID   string     `json:"newPropertyId"`
	SurveyNumber    string     `json:"surveyNumber"`
	SubSurveyNumber string     `json:"subSurveyNumber"`
	Area            Area       `json:"area"`
	Boundaries      Boundaries `json:"boundaries"`
	OwnerInfo       OwnerInfo  `json:"ownerInfo"`
}

// ============================================================
// HistoryEntry — Ledger history query result
// ============================================================

// HistoryEntry represents a single historical state of a land record
// as returned by the Fabric history query API.
type HistoryEntry struct {
	TxID      string      `json:"txId"`
	Timestamp string      `json:"timestamp"`
	IsDelete  bool        `json:"isDelete"`
	Record    *LandRecord `json:"record"`
}
