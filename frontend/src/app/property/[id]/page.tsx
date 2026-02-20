'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import OwnershipTimeline from '@/components/OwnershipTimeline';
import MapView from '@/components/MapView';
import { usePropertyStore } from '@/stores/property.store';
import { useAuthStore } from '@/stores/auth.store';
import type { PropertyStatus } from '@/components/StatusBadge';

interface PropertyDetail {
  id: string;
  surveyNumber: string;
  khasraNumber: string;
  district: string;
  tehsil: string;
  village: string;
  state: string;
  stateCode: string;
  area: string;
  areaUnit: string;
  landType: string;
  status: PropertyStatus;
  currentOwner: {
    name: string;
    aadhaarHash: string;
    acquisitionType: string;
    acquisitionDate: string;
  };
  encumbrances: Array<{
    id: string;
    type: string;
    holder: string;
    amount: string;
    startDate: string;
    endDate: string | null;
    status: string;
  }>;
  fabricTxId: string;
  algorandAppId: string | null;
  algorandVerified: boolean;
  lastVerifiedAt: string | null;
  coordinates: Array<[number, number]>;
  createdAt: string;
  updatedAt: string;
}

interface OwnershipRecord {
  ownerName: string;
  acquisitionType: 'SALE' | 'INHERITANCE' | 'GIFT' | 'GOVERNMENT_GRANT' | 'COURT_ORDER';
  date: string;
  fabricTxId: string;
  isCurrent: boolean;
}

const MOCK_PROPERTY: PropertyDetail = {
  id: 'PROP-MH-2024-00142',
  surveyNumber: '123/4A',
  khasraNumber: 'KH-2019-4532',
  district: 'Pune',
  tehsil: 'Haveli',
  village: 'Wadgaon Sheri',
  state: 'Maharashtra',
  stateCode: 'MH',
  area: '2400',
  areaUnit: 'sq ft',
  landType: 'Residential',
  status: 'ACTIVE',
  currentOwner: {
    name: 'Rajesh Kumar Sharma',
    aadhaarHash: 'a1b2c3...f9e8',
    acquisitionType: 'Sale',
    acquisitionDate: '2024-03-15',
  },
  encumbrances: [
    {
      id: 'ENC-001',
      type: 'Mortgage',
      holder: 'State Bank of India',
      amount: '45,00,000',
      startDate: '2024-04-01',
      endDate: '2044-04-01',
      status: 'ACTIVE',
    },
  ],
  fabricTxId: 'fab_tx_8a7b6c5d4e3f2g1h0i9j8k7l6m5n4o3p2q1',
  algorandAppId: '12345678',
  algorandVerified: true,
  lastVerifiedAt: '2024-12-01T10:30:00Z',
  coordinates: [
    [73.9355, 18.5597],
    [73.9365, 18.5597],
    [73.9365, 18.5607],
    [73.9355, 18.5607],
    [73.9355, 18.5597],
  ],
  createdAt: '2019-06-15T08:00:00Z',
  updatedAt: '2024-12-01T10:30:00Z',
};

const MOCK_HISTORY: OwnershipRecord[] = [
  {
    ownerName: 'Rajesh Kumar Sharma',
    acquisitionType: 'SALE',
    date: '2024-03-15',
    fabricTxId: 'fab_tx_8a7b6c5d4e3f2g1h',
    isCurrent: true,
  },
  {
    ownerName: 'Priya Mehta',
    acquisitionType: 'INHERITANCE',
    date: '2020-07-22',
    fabricTxId: 'fab_tx_2k3l4m5n6o7p8q9r',
    isCurrent: false,
  },
  {
    ownerName: 'Late Suresh Mehta',
    acquisitionType: 'SALE',
    date: '2015-11-10',
    fabricTxId: 'fab_tx_3s4t5u6v7w8x9y0z',
    isCurrent: false,
  },
  {
    ownerName: 'Maharashtra State Government',
    acquisitionType: 'GOVERNMENT_GRANT',
    date: '2010-01-01',
    fabricTxId: 'fab_tx_genesis_001',
    isCurrent: false,
  },
];

function InfoRow({
  label,
  value,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center py-3 border-b border-gray-100 last:border-0 ${className}`}>
      <dt className="text-sm font-medium text-gray-500 sm:w-40 flex-shrink-0">
        {label}
      </dt>
      <dd className="mt-1 sm:mt-0 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { getProperty, getHistory } = usePropertyStore();

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [history, setHistory] = useState<OwnershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'map' | 'encumbrances'>('overview');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        await getProperty(propertyId);
        await getHistory(propertyId);
        // Using mock data for now
        setProperty(MOCK_PROPERTY);
        setHistory(MOCK_HISTORY);
      } catch {
        // Error handled by store
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [propertyId, getProperty, getHistory]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="text-center py-20">
          <svg className="animate-spin w-8 h-8 text-bhulekh-saffron-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Loading property details...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="page-container">
        <div className="govt-card text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Property Not Found
          </h2>
          <p className="text-gray-500 mb-6">
            No property found with ID: {propertyId}
          </p>
          <Link href="/search" className="btn-primary">
            Search Records
          </Link>
        </div>
      </div>
    );
  }

  const isRegistrar = isAuthenticated && user?.role === 'registrar';

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="hover:text-bhulekh-blue-600">
              Home
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/search" className="hover:text-bhulekh-blue-600">
              Search
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-medium">{property.id}</li>
        </ol>
      </nav>

      {/* Property header */}
      <div className="govt-card mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-bhulekh-navy">
                {property.id}
              </h1>
              <StatusBadge status={property.status} size="md" />
            </div>
            <p className="text-gray-600">
              Survey No. {property.surveyNumber} | Khasra: {property.khasraNumber}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {property.village}, {property.tehsil}, {property.district},{' '}
              {property.state}
            </p>
          </div>
          <div className="mt-4 lg:mt-0 flex flex-wrap gap-3">
            <Link href="/verify" className="btn-secondary text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verify on Algorand
            </Link>
            {isRegistrar && (
              <Link
                href={`/transfer?propertyId=${property.id}`}
                className="btn-primary text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Initiate Transfer
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Verification banner */}
      {property.algorandVerified && (
        <div className="mb-6 p-4 bg-bhulekh-green-50 border border-bhulekh-green-200 rounded-lg flex items-center gap-3">
          <svg className="w-6 h-6 text-bhulekh-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-bhulekh-green-800">
              Blockchain Verified
            </p>
            <p className="text-xs text-bhulekh-green-600">
              This record has been verified on Algorand (App ID:{' '}
              {property.algorandAppId}). Last verified:{' '}
              {property.lastVerifiedAt
                ? new Date(property.lastVerifiedAt).toLocaleDateString('en-IN')
                : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8" aria-label="Property details tabs">
          {(
            [
              { key: 'overview', label: 'Overview' },
              { key: 'history', label: 'Ownership History' },
              { key: 'map', label: 'Map View' },
              { key: 'encumbrances', label: `Encumbrances (${property.encumbrances.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-bhulekh-saffron-500 text-bhulekh-saffron-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Property details */}
          <div className="govt-card">
            <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Property Details
            </h2>
            <dl>
              <InfoRow label="Property ID" value={property.id} />
              <InfoRow label="Survey Number" value={property.surveyNumber} />
              <InfoRow label="Khasra Number" value={property.khasraNumber} />
              <InfoRow label="Area" value={`${property.area} ${property.areaUnit}`} />
              <InfoRow label="Land Type" value={property.landType} />
              <InfoRow label="Status" value={<StatusBadge status={property.status} size="sm" />} />
              <InfoRow
                label="Fabric Tx ID"
                value={
                  <span className="font-mono text-xs break-all">
                    {property.fabricTxId}
                  </span>
                }
              />
            </dl>
          </div>

          {/* Location details */}
          <div className="govt-card">
            <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Location
            </h2>
            <dl>
              <InfoRow label="State" value={property.state} />
              <InfoRow label="District" value={property.district} />
              <InfoRow label="Tehsil" value={property.tehsil} />
              <InfoRow label="Village" value={property.village} />
            </dl>
          </div>

          {/* Current owner */}
          <div className="govt-card">
            <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Current Owner
            </h2>
            <dl>
              <InfoRow label="Name" value={property.currentOwner.name} />
              <InfoRow
                label="Aadhaar Hash"
                value={
                  <span className="font-mono text-xs">
                    {property.currentOwner.aadhaarHash}
                  </span>
                }
              />
              <InfoRow label="Acquisition" value={property.currentOwner.acquisitionType} />
              <InfoRow
                label="Date"
                value={new Date(property.currentOwner.acquisitionDate).toLocaleDateString('en-IN')}
              />
            </dl>
          </div>

          {/* Blockchain verification */}
          <div className="govt-card">
            <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
              Blockchain Verification
            </h2>
            <dl>
              <InfoRow
                label="Fabric"
                value={
                  <span className="inline-flex items-center gap-1.5 text-bhulekh-green-700">
                    <span className="w-2 h-2 bg-bhulekh-green-500 rounded-full" />
                    Recorded
                  </span>
                }
              />
              <InfoRow
                label="Algorand"
                value={
                  property.algorandVerified ? (
                    <span className="inline-flex items-center gap-1.5 text-bhulekh-green-700">
                      <span className="w-2 h-2 bg-bhulekh-green-500 rounded-full" />
                      Verified (App: {property.algorandAppId})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <span className="w-2 h-2 bg-gray-300 rounded-full" />
                      Pending Verification
                    </span>
                  )
                }
              />
              <InfoRow
                label="Last Updated"
                value={new Date(property.updatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <InfoRow
                label="First Recorded"
                value={new Date(property.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              />
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-6">
            Ownership Provenance Chain
          </h2>
          <OwnershipTimeline records={history} />
        </div>
      )}

      {activeTab === 'map' && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-4">
            Property Boundary Map
          </h2>
          <MapView
            coordinates={property.coordinates}
            propertyId={property.id}
          />
        </div>
      )}

      {activeTab === 'encumbrances' && (
        <div className="govt-card">
          <h2 className="text-lg font-semibold text-bhulekh-navy mb-6">
            Encumbrances & Liens
          </h2>
          {property.encumbrances.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No encumbrances found on this property.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {property.encumbrances.map((enc) => (
                <div
                  key={enc.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {enc.type}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({enc.id})
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        enc.status === 'ACTIVE'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {enc.status}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-gray-500">Holder</dt>
                      <dd className="font-medium">{enc.holder}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Amount</dt>
                      <dd className="font-medium">INR {enc.amount}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Start Date</dt>
                      <dd>
                        {new Date(enc.startDate).toLocaleDateString('en-IN')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">End Date</dt>
                      <dd>
                        {enc.endDate
                          ? new Date(enc.endDate).toLocaleDateString('en-IN')
                          : 'Ongoing'}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
