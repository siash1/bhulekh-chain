'use client';

import { useState, useCallback } from 'react';
import StatusBadge from '@/components/StatusBadge';

interface TransferFormProps {
  preselectedPropertyId?: string;
}

type TransferStep = 1 | 2 | 3 | 4 | 5;

interface PropertySelection {
  propertyId: string;
  surveyNumber: string;
  district: string;
  state: string;
  area: string;
  currentOwner: string;
  status: string;
  encumbranceStatus: string;
}

interface SellerInfo {
  aadhaarVerified: boolean;
  name: string;
  aadhaarLast4: string;
}

interface BuyerInfo {
  name: string;
  aadhaarNumber: string;
  address: string;
  phone: string;
  isNRI: boolean;
  femaCompliant: boolean | null;
}

interface WitnessInfo {
  name: string;
  aadhaarNumber: string;
  address: string;
}

interface TransferDetails {
  saleAmount: string;
  circleRate: string;
  stampDuty: string;
  registrationFee: string;
  totalPayable: string;
  documentHash: string;
}

const STEP_LABELS: Record<TransferStep, string> = {
  1: 'Select Property',
  2: 'Verify Seller',
  3: 'Buyer Details',
  4: 'Witnesses',
  5: 'Review & Submit',
};

export default function TransferForm({
  preselectedPropertyId,
}: TransferFormProps) {
  const [currentStep, setCurrentStep] = useState<TransferStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Step 1: Property
  const [propertySearch, setPropertySearch] = useState(
    preselectedPropertyId ?? ''
  );
  const [selectedProperty, setSelectedProperty] =
    useState<PropertySelection | null>(null);

  // Step 2: Seller
  const [seller, setSeller] = useState<SellerInfo>({
    aadhaarVerified: false,
    name: '',
    aadhaarLast4: '',
  });

  // Step 3: Buyer
  const [buyer, setBuyer] = useState<BuyerInfo>({
    name: '',
    aadhaarNumber: '',
    address: '',
    phone: '',
    isNRI: false,
    femaCompliant: null,
  });

  // Step 4: Witnesses
  const [witness1, setWitness1] = useState<WitnessInfo>({
    name: '',
    aadhaarNumber: '',
    address: '',
  });
  const [witness2, setWitness2] = useState<WitnessInfo>({
    name: '',
    aadhaarNumber: '',
    address: '',
  });

  // Step 5: Transfer details
  const [transferDetails, setTransferDetails] = useState<TransferDetails>({
    saleAmount: '',
    circleRate: '5500',
    stampDuty: '',
    registrationFee: '',
    totalPayable: '',
    documentHash: '',
  });

  // Calculate stamp duty (simplified: 5% of max(sale_amount, circle_rate * area))
  const calculateStampDuty = useCallback(
    (saleAmountStr: string) => {
      const saleAmount = parseInt(saleAmountStr.replace(/,/g, ''), 10) || 0;
      const areaNum = selectedProperty
        ? parseInt(selectedProperty.area.replace(/[^\d]/g, ''), 10) || 0
        : 0;
      const circleRateVal = parseInt(transferDetails.circleRate, 10) || 0;
      const circleValue = circleRateVal * areaNum;
      const assessableValue = Math.max(saleAmount, circleValue);

      // Stamp duty at 5%
      const stampDuty = Math.round(assessableValue * 0.05);
      // Registration fee at 1%
      const registrationFee = Math.round(assessableValue * 0.01);
      const total = stampDuty + registrationFee;

      setTransferDetails((prev) => ({
        ...prev,
        saleAmount: saleAmountStr,
        stampDuty: stampDuty.toLocaleString('en-IN'),
        registrationFee: registrationFee.toLocaleString('en-IN'),
        totalPayable: total.toLocaleString('en-IN'),
      }));
    },
    [selectedProperty, transferDetails.circleRate]
  );

  // Mock property search
  const handlePropertySearch = useCallback(() => {
    if (!propertySearch.trim()) return;

    // Simulate API call
    setSelectedProperty({
      propertyId: propertySearch || 'PROP-MH-2024-00142',
      surveyNumber: '123/4A',
      district: 'Pune',
      state: 'Maharashtra',
      area: '2400 sq ft',
      currentOwner: 'Rajesh Kumar Sharma',
      status: 'ACTIVE',
      encumbranceStatus: 'Clear',
    });
  }, [propertySearch]);

  // Mock seller verification
  const handleVerifySeller = useCallback(() => {
    setSeller({
      aadhaarVerified: true,
      name: selectedProperty?.currentOwner ?? 'Rajesh Kumar Sharma',
      aadhaarLast4: '4567',
    });
  }, [selectedProperty]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setSubmitted(true);
    } catch {
      // Error handling
    } finally {
      setSubmitting(false);
    }
  }, []);

  const canProceed = (step: TransferStep): boolean => {
    switch (step) {
      case 1:
        return selectedProperty !== null && selectedProperty.status === 'ACTIVE';
      case 2:
        return seller.aadhaarVerified;
      case 3:
        return (
          buyer.name.trim() !== '' &&
          buyer.aadhaarNumber.length === 12 &&
          buyer.address.trim() !== '' &&
          buyer.phone.trim() !== '' &&
          (!buyer.isNRI || buyer.femaCompliant === true)
        );
      case 4:
        return (
          witness1.name.trim() !== '' &&
          witness1.aadhaarNumber.length === 12 &&
          witness2.name.trim() !== '' &&
          witness2.aadhaarNumber.length === 12
        );
      case 5:
        return transferDetails.saleAmount !== '' && !submitting;
      default:
        return false;
    }
  };

  if (submitted) {
    return (
      <div className="govt-card text-center py-12">
        <div className="w-16 h-16 bg-bhulekh-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-bhulekh-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-bhulekh-navy mb-2">
          Transfer Initiated Successfully
        </h2>
        <p className="text-gray-600 mb-4">
          The property transfer has been recorded on the blockchain. A 72-hour
          cooling period is now active.
        </p>
        <div className="bg-bhulekh-saffron-50 border border-bhulekh-saffron-200 rounded-lg p-4 max-w-md mx-auto mb-6">
          <p className="text-sm text-bhulekh-saffron-800">
            <strong>Cooling Period:</strong> The transfer will be finalized after
            72 hours (3 days) unless an objection is raised.
          </p>
          <p className="text-sm text-bhulekh-saffron-700 mt-1">
            Mutation will be automatic upon finalization.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          <p>
            Transaction ID:{' '}
            <span className="font-mono">fab_tx_new_transfer_001</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="govt-card mb-6">
        <div className="flex items-center justify-between">
          {([1, 2, 3, 4, 5] as TransferStep[]).map((step) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step < currentStep
                      ? 'bg-bhulekh-green-500 text-white'
                      : step === currentStep
                      ? 'bg-bhulekh-saffron-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step < currentStep ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step
                  )}
                </div>
                <span
                  className={`text-xs mt-1 hidden sm:block ${
                    step === currentStep
                      ? 'text-bhulekh-saffron-600 font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
              {step < 5 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    step < currentStep
                      ? 'bg-bhulekh-green-500'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Select Property */}
      {currentStep === 1 && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
            Step 1: Select Property
          </h2>

          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={propertySearch}
              onChange={(e) => setPropertySearch(e.target.value)}
              className="form-input flex-1"
              placeholder="Enter Property ID (e.g., PROP-MH-2024-00142)"
            />
            <button
              type="button"
              onClick={handlePropertySearch}
              className="btn-primary"
            >
              Find
            </button>
          </div>

          {selectedProperty && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-gray-900">
                  {selectedProperty.propertyId}
                </h3>
                <StatusBadge
                  status={selectedProperty.status as 'ACTIVE'}
                  size="sm"
                />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Survey Number</dt>
                  <dd className="font-medium">{selectedProperty.surveyNumber}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">District, State</dt>
                  <dd className="font-medium">
                    {selectedProperty.district}, {selectedProperty.state}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Area</dt>
                  <dd className="font-medium">{selectedProperty.area}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Current Owner</dt>
                  <dd className="font-medium">{selectedProperty.currentOwner}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Encumbrance</dt>
                  <dd className="font-medium text-bhulekh-green-600">
                    {selectedProperty.encumbranceStatus}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Verify Seller */}
      {currentStep === 2 && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
            Step 2: Verify Seller Identity
          </h2>

          {!seller.aadhaarVerified ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                Verify that the current property owner ({selectedProperty?.currentOwner})
                is present and consents to the transfer.
              </p>
              <button
                type="button"
                onClick={handleVerifySeller}
                className="btn-primary"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                Verify with Aadhaar eKYC
              </button>
              <p className="text-xs text-gray-400 mt-3">
                Biometric or OTP verification via UIDAI
              </p>
            </div>
          ) : (
            <div className="border border-bhulekh-green-200 bg-bhulekh-green-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-bhulekh-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-bhulekh-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-bhulekh-green-800">
                    Seller Verified
                  </p>
                  <p className="text-sm text-bhulekh-green-700">
                    {seller.name} (Aadhaar: XXXX-XXXX-{seller.aadhaarLast4})
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Buyer Details */}
      {currentStep === 3 && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
            Step 3: Buyer Details
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="buyerName" className="form-label">
                Full Name (as per Aadhaar)
              </label>
              <input
                id="buyerName"
                type="text"
                value={buyer.name}
                onChange={(e) =>
                  setBuyer((prev) => ({ ...prev, name: e.target.value }))
                }
                className="form-input"
                placeholder="Enter buyer's full name"
              />
            </div>

            <div>
              <label htmlFor="buyerAadhaar" className="form-label">
                Aadhaar Number
              </label>
              <input
                id="buyerAadhaar"
                type="text"
                inputMode="numeric"
                value={buyer.aadhaarNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setBuyer((prev) => ({ ...prev, aadhaarNumber: val }));
                }}
                className="form-input aadhaar-input"
                placeholder="12-digit Aadhaar number"
                maxLength={12}
              />
            </div>

            <div>
              <label htmlFor="buyerAddress" className="form-label">
                Address
              </label>
              <textarea
                id="buyerAddress"
                value={buyer.address}
                onChange={(e) =>
                  setBuyer((prev) => ({ ...prev, address: e.target.value }))
                }
                className="form-input resize-none"
                rows={3}
                placeholder="Complete address"
              />
            </div>

            <div>
              <label htmlFor="buyerPhone" className="form-label">
                Phone Number
              </label>
              <input
                id="buyerPhone"
                type="tel"
                value={buyer.phone}
                onChange={(e) =>
                  setBuyer((prev) => ({ ...prev, phone: e.target.value }))
                }
                className="form-input"
                placeholder="+91 XXXXX XXXXX"
              />
            </div>

            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <input
                id="isNRI"
                type="checkbox"
                checked={buyer.isNRI}
                onChange={(e) =>
                  setBuyer((prev) => ({
                    ...prev,
                    isNRI: e.target.checked,
                    femaCompliant: e.target.checked ? null : null,
                  }))
                }
                className="w-4 h-4 text-bhulekh-saffron-500 rounded"
              />
              <label htmlFor="isNRI" className="text-sm text-gray-700">
                Buyer is a Non-Resident Indian (NRI)
              </label>
            </div>

            {buyer.isNRI && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-3">
                  <strong>FEMA Compliance Required:</strong> NRI property
                  transfers require Foreign Exchange Management Act compliance
                  verification.
                </p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="femaCompliant"
                      checked={buyer.femaCompliant === true}
                      onChange={() =>
                        setBuyer((prev) => ({ ...prev, femaCompliant: true }))
                      }
                      className="text-bhulekh-saffron-500"
                    />
                    <span className="text-sm">FEMA Compliant</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="femaCompliant"
                      checked={buyer.femaCompliant === false}
                      onChange={() =>
                        setBuyer((prev) => ({ ...prev, femaCompliant: false }))
                      }
                      className="text-bhulekh-saffron-500"
                    />
                    <span className="text-sm">Not Verified</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Witnesses */}
      {currentStep === 4 && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-2">
            Step 4: Witness Details
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Two witnesses with digital signatures are required for the transfer.
          </p>

          <div className="space-y-6">
            {/* Witness 1 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Witness 1</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="w1Name" className="form-label">
                    Full Name
                  </label>
                  <input
                    id="w1Name"
                    type="text"
                    value={witness1.name}
                    onChange={(e) =>
                      setWitness1((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="form-input"
                    placeholder="Witness name"
                  />
                </div>
                <div>
                  <label htmlFor="w1Aadhaar" className="form-label">
                    Aadhaar Number
                  </label>
                  <input
                    id="w1Aadhaar"
                    type="text"
                    inputMode="numeric"
                    value={witness1.aadhaarNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setWitness1((prev) => ({
                        ...prev,
                        aadhaarNumber: val,
                      }));
                    }}
                    className="form-input"
                    placeholder="12-digit Aadhaar"
                    maxLength={12}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="w1Address" className="form-label">
                    Address
                  </label>
                  <input
                    id="w1Address"
                    type="text"
                    value={witness1.address}
                    onChange={(e) =>
                      setWitness1((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="Complete address"
                  />
                </div>
              </div>
            </div>

            {/* Witness 2 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Witness 2</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="w2Name" className="form-label">
                    Full Name
                  </label>
                  <input
                    id="w2Name"
                    type="text"
                    value={witness2.name}
                    onChange={(e) =>
                      setWitness2((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="form-input"
                    placeholder="Witness name"
                  />
                </div>
                <div>
                  <label htmlFor="w2Aadhaar" className="form-label">
                    Aadhaar Number
                  </label>
                  <input
                    id="w2Aadhaar"
                    type="text"
                    inputMode="numeric"
                    value={witness2.aadhaarNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setWitness2((prev) => ({
                        ...prev,
                        aadhaarNumber: val,
                      }));
                    }}
                    className="form-input"
                    placeholder="12-digit Aadhaar"
                    maxLength={12}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="w2Address" className="form-label">
                    Address
                  </label>
                  <input
                    id="w2Address"
                    type="text"
                    value={witness2.address}
                    onChange={(e) =>
                      setWitness2((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="Complete address"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Review & Submit */}
      {currentStep === 5 && (
        <div className="space-y-6">
          {/* Sale details */}
          <div className="govt-card">
            <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Step 5: Sale Details & Review
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label htmlFor="saleAmount" className="form-label">
                  Sale Amount (INR)
                </label>
                <input
                  id="saleAmount"
                  type="text"
                  inputMode="numeric"
                  value={transferDetails.saleAmount}
                  onChange={(e) => calculateStampDuty(e.target.value)}
                  className="form-input"
                  placeholder="e.g., 5000000"
                />
              </div>
              <div>
                <label htmlFor="circleRate" className="form-label">
                  Circle Rate (INR / sq ft)
                </label>
                <input
                  id="circleRate"
                  type="text"
                  value={transferDetails.circleRate}
                  disabled
                  className="form-input bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set by state government. Cannot be overridden.
                </p>
              </div>
            </div>

            {/* Stamp duty breakdown */}
            {transferDetails.stampDuty && (
              <div className="bg-bhulekh-blue-50 border border-bhulekh-blue-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-bhulekh-blue-800 mb-3">
                  Stamp Duty Calculation
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-bhulekh-blue-700">
                      Stamp Duty (5%)
                    </span>
                    <span className="font-medium text-bhulekh-blue-900">
                      INR {transferDetails.stampDuty}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-bhulekh-blue-700">
                      Registration Fee (1%)
                    </span>
                    <span className="font-medium text-bhulekh-blue-900">
                      INR {transferDetails.registrationFee}
                    </span>
                  </div>
                  <hr className="border-bhulekh-blue-200" />
                  <div className="flex justify-between text-base">
                    <span className="font-semibold text-bhulekh-blue-800">
                      Total Payable
                    </span>
                    <span className="font-bold text-bhulekh-blue-900">
                      INR {transferDetails.totalPayable}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-bhulekh-blue-600 mt-2">
                  Calculated on higher of declared value or circle rate value
                  (anti-benami compliance).
                </p>
              </div>
            )}

            {/* Document upload */}
            <div>
              <label className="form-label">Sale Deed Document</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-bhulekh-saffron-400 transition-colors">
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600">
                  Upload signed sale deed (PDF)
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Document will be stored on IPFS with hash recorded on
                  blockchain
                </p>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  id="saleDocument"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setTransferDetails((prev) => ({
                        ...prev,
                        documentHash: `ipfs://Qm${file.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 44)}`,
                      }));
                    }
                  }}
                />
                <label
                  htmlFor="saleDocument"
                  className="btn-secondary text-sm mt-3 cursor-pointer inline-block"
                >
                  Choose File
                </label>
              </div>
            </div>
          </div>

          {/* Review summary */}
          <div className="govt-card">
            <h3 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Transfer Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Property</p>
                <p className="font-medium">{selectedProperty?.propertyId}</p>
              </div>
              <div>
                <p className="text-gray-500">Survey Number</p>
                <p className="font-medium">{selectedProperty?.surveyNumber}</p>
              </div>
              <div>
                <p className="text-gray-500">Seller</p>
                <p className="font-medium">{seller.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Buyer</p>
                <p className="font-medium">{buyer.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Witness 1</p>
                <p className="font-medium">{witness1.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Witness 2</p>
                <p className="font-medium">{witness2.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={() => setCurrentStep((prev) => (prev - 1) as TransferStep)}
          disabled={currentStep === 1}
          className="btn-secondary disabled:opacity-0"
        >
          Previous
        </button>

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((prev) => (prev + 1) as TransferStep)}
            disabled={!canProceed(currentStep)}
            className="btn-primary"
          >
            Next Step
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canProceed(5)}
            className="btn-primary bg-bhulekh-green-600 hover:bg-bhulekh-green-700 focus:ring-bhulekh-green-200"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Recording on Blockchain...
              </span>
            ) : (
              'Submit Transfer'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
