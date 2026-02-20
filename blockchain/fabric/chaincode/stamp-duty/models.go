package main

// CircleRate represents the minimum government-set valuation rate
// per square meter for a specific tehsil/area. Circle rates are
// used to calculate stamp duty and prevent undervaluation of
// property transactions (anti-benami measure).
// All financial values are in paisa (int64).
type CircleRate struct {
	DocType         string `json:"docType"`
	StateCode       string `json:"stateCode"`
	DistrictCode    string `json:"districtCode"`
	TehsilCode      string `json:"tehsilCode"`
	RatePerSqMeter  int64  `json:"ratePerSqMeter"`
	EffectiveFrom   string `json:"effectiveFrom"`
	SetBy           string `json:"setBy"`
	FabricTxID      string `json:"fabricTxId"`
}

// StampDutyBreakdown is the result of a stamp duty calculation.
// It provides a detailed breakdown of all government fees payable
// on a property transaction.
// All financial values are in paisa (int64).
type StampDutyBreakdown struct {
	CircleRateValue int64  `json:"circleRateValue"`
	ApplicableValue int64  `json:"applicableValue"`
	StampDutyRate   int32  `json:"stampDutyRate"`
	StampDutyAmount int64  `json:"stampDutyAmount"`
	RegistrationFee int64  `json:"registrationFee"`
	Surcharge       int64  `json:"surcharge"`
	TotalFees       int64  `json:"totalFees"`
	State           string `json:"state"`
}

// StampDutyConfig holds the stamp duty and registration fee rates
// for a specific state. Rates are stored in basis points
// (e.g., 600 = 6.00%, 100 = 1.00%).
type StampDutyConfig struct {
	DocType             string `json:"docType"`
	StateCode           string `json:"stateCode"`
	StampDutyBasisPts   int32  `json:"stampDutyBasisPoints"`
	RegistrationBasisPts int32  `json:"registrationBasisPoints"`
	SurchargeBasisPts   int32  `json:"surchargeBasisPoints"`
	EffectiveFrom       string `json:"effectiveFrom"`
	SetBy               string `json:"setBy"`
	FabricTxID          string `json:"fabricTxId"`
}

// CircleRateChangedEvent is emitted when a circle rate is set or updated.
type CircleRateChangedEvent struct {
	Type           string `json:"type"`
	StateCode      string `json:"stateCode"`
	DistrictCode   string `json:"districtCode"`
	TehsilCode     string `json:"tehsilCode"`
	RatePerSqMeter int64  `json:"ratePerSqMeter"`
	FabricTxID     string `json:"fabricTxId"`
	Timestamp      string `json:"timestamp"`
	ChannelID      string `json:"channelId"`
}

// StampDutyConfigChangedEvent is emitted when state-level stamp duty
// configuration is updated.
type StampDutyConfigChangedEvent struct {
	Type              string `json:"type"`
	StateCode         string `json:"stateCode"`
	StampDutyBasisPts int32  `json:"stampDutyBasisPoints"`
	FabricTxID        string `json:"fabricTxId"`
	Timestamp         string `json:"timestamp"`
	ChannelID         string `json:"channelId"`
}
