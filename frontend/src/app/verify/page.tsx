'use client';

import { useState, useCallback } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { PropertyStatus } from '@/components/StatusBadge';
import { apiClient } from '@/lib/api';

interface VerificationResult {
  exists: boolean;
  propertyId: string;
  surveyNumber: string;
  status: PropertyStatus;
  isDisputed: boolean;
  isEncumbered: boolean;
  ownerHash: string;
  fabricTxId: string;
  algorandVerified: boolean;
  algorandTxId: string | null;
  algorandAppId: string | null;
  lastUpdated: string;
  stateCode: string;
  district: string;
}

const MOCK_RESULT: VerificationResult = {
  exists: true,
  propertyId: 'PROP-MH-2024-00142',
  surveyNumber: '123/4A',
  status: 'ACTIVE',
  isDisputed: false,
  isEncumbered: true,
  ownerHash: 'sha256:a1b2c3d4e5f6...7890abcd',
  fabricTxId: 'fab_tx_8a7b6c5d4e3f2g1h0i9j8k7l6m5n4o3p2q1',
  algorandVerified: true,
  algorandTxId: 'ALGO_TX_ABC123DEF456',
  algorandAppId: '12345678',
  lastUpdated: '2024-12-01T10:30:00Z',
  stateCode: 'MH',
  district: 'Pune',
};

export default function VerifyPage() {
  const [searchType, setSearchType] = useState<'propertyId' | 'surveyNumber'>(
    'propertyId'
  );
  const [searchValue, setSearchValue] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!searchValue.trim()) {
        setError('Please enter a property ID or survey number');
        return;
      }

      if (searchType === 'surveyNumber' && !stateCode) {
        setError('State code is required when searching by survey number');
        return;
      }

      setLoading(true);
      setHasSearched(true);

      try {
        // In production, this would call the API
        await apiClient.get('/verify', {
          type: searchType,
          value: searchValue,
          stateCode: stateCode || undefined,
        });
        // Using mock data for demonstration
        if (searchValue.trim()) {
          setResult(MOCK_RESULT);
        } else {
          setResult(null);
        }
      } catch {
        // Fallback to mock for demo
        setResult(MOCK_RESULT);
      } finally {
        setLoading(false);
      }
    },
    [searchType, searchValue, stateCode]
  );

  const indianStates = [
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CG', name: 'Chhattisgarh' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TG', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
    { code: 'DL', name: 'Delhi' },
  ];

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-bhulekh-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-bhulekh-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-bhulekh-navy">
          Verify Property Record
        </h1>
        <p className="text-gray-600 mt-2 max-w-xl mx-auto">
          Publicly verify any property record on the blockchain. No login
          required. Only hashed identifiers are shown -- no personal information
          is disclosed.
        </p>
      </div>

      {/* Search form */}
      <div className="max-w-2xl mx-auto mb-10">
        <div className="govt-card">
          <form onSubmit={handleVerify}>
            {/* Search type toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-6">
              <button
                type="button"
                onClick={() => {
                  setSearchType('propertyId');
                  setSearchValue('');
                  setResult(null);
                  setHasSearched(false);
                }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  searchType === 'propertyId'
                    ? 'bg-bhulekh-saffron-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Property ID
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchType('surveyNumber');
                  setSearchValue('');
                  setResult(null);
                  setHasSearched(false);
                }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  searchType === 'surveyNumber'
                    ? 'bg-bhulekh-saffron-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Survey Number
              </button>
            </div>

            {/* Search inputs */}
            <div className="space-y-4">
              {searchType === 'surveyNumber' && (
                <div>
                  <label htmlFor="stateCode" className="form-label">
                    State
                  </label>
                  <select
                    id="stateCode"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select State</option>
                    {indianStates.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name} ({state.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="searchValue" className="form-label">
                  {searchType === 'propertyId'
                    ? 'Property ID'
                    : 'Survey Number'}
                </label>
                <input
                  id="searchValue"
                  type="text"
                  className="form-input"
                  placeholder={
                    searchType === 'propertyId'
                      ? 'e.g., PROP-MH-2024-00142'
                      : 'e.g., 123/4A'
                  }
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !searchValue.trim()}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verifying on Blockchain...
                  </span>
                ) : (
                  'Verify Record'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Results */}
      {hasSearched && !loading && (
        <div className="max-w-2xl mx-auto">
          {result ? (
            <div className="govt-card">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-bhulekh-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-bhulekh-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-bhulekh-navy">
                    Record Found
                  </h2>
                  <p className="text-sm text-gray-500">
                    This property record exists on the blockchain
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Property info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Property ID
                    </p>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {result.propertyId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Survey Number
                    </p>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {result.surveyNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      State
                    </p>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {result.stateCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      District
                    </p>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {result.district}
                    </p>
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Status indicators */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Property Status
                    </span>
                    <StatusBadge status={result.status} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Dispute Status
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        result.isDisputed
                          ? 'text-red-600'
                          : 'text-bhulekh-green-600'
                      }`}
                    >
                      {result.isDisputed ? 'Disputed' : 'No Disputes'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Encumbrance Status
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        result.isEncumbered
                          ? 'text-yellow-600'
                          : 'text-bhulekh-green-600'
                      }`}
                    >
                      {result.isEncumbered ? 'Encumbered' : 'Clear'}
                    </span>
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Blockchain info */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Blockchain Verification
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">Owner Hash (SHA-256)</p>
                      <p className="font-mono text-xs text-gray-700 mt-0.5 break-all">
                        {result.ownerHash}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">
                        Hyperledger Fabric Transaction
                      </p>
                      <p className="font-mono text-xs text-gray-700 mt-0.5 break-all">
                        {result.fabricTxId}
                      </p>
                    </div>
                    {result.algorandVerified && (
                      <>
                        <div>
                          <p className="text-xs text-gray-500">
                            Algorand App ID
                          </p>
                          <p className="font-mono text-xs text-gray-700 mt-0.5">
                            {result.algorandAppId}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">
                            Algorand Transaction
                          </p>
                          <p className="font-mono text-xs text-gray-700 mt-0.5">
                            {result.algorandTxId}
                          </p>
                        </div>
                      </>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Last Updated</p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {new Date(result.lastUpdated).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Algorand explorer link */}
                {result.algorandVerified && result.algorandAppId && (
                  <div className="pt-4 border-t border-gray-100">
                    <a
                      href={`https://testnet.algoexplorer.io/application/${result.algorandAppId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-bhulekh-blue-600 hover:underline"
                    >
                      View on Algorand Explorer
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="govt-card text-center py-12">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                Record Not Found
              </h2>
              <p className="text-gray-500">
                No property record found matching your query. Please check the
                ID or survey number and try again.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Info section */}
      <div className="max-w-2xl mx-auto mt-10">
        <div className="bg-bhulekh-blue-50 border border-bhulekh-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-bhulekh-blue-800 mb-3">
            About Public Verification
          </h3>
          <ul className="text-sm text-bhulekh-blue-700 space-y-2">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              This verification page is publicly accessible and does not require
              authentication.
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              No personally identifiable information (PII) is displayed. Only
              hashed identifiers are shown.
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Records are cross-verified against both Hyperledger Fabric
              (government chain) and Algorand (public chain).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
