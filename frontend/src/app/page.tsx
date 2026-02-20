'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PropertyCard from '@/components/PropertyCard';
import { useAuthStore } from '@/stores/auth.store';
import type { PropertySummary } from '@/stores/property.store';

interface PlatformStats {
  totalRecords: number;
  transfersToday: number;
  statesActive: number;
  verificationsTotal: number;
}

const MOCK_STATS: PlatformStats = {
  totalRecords: 23_45_678,
  transfersToday: 1_247,
  statesActive: 12,
  verificationsTotal: 8_92_341,
};

const MOCK_USER_PROPERTIES: PropertySummary[] = [
  {
    id: 'PROP-MH-2024-00142',
    surveyNumber: '123/4A',
    district: 'Pune',
    tehsil: 'Haveli',
    village: 'Wadgaon Sheri',
    state: 'MH',
    area: '2400 sq ft',
    ownerName: 'Rajesh Kumar Sharma',
    status: 'ACTIVE',
  },
  {
    id: 'PROP-MH-2024-00891',
    surveyNumber: '456/7B',
    district: 'Pune',
    tehsil: 'Haveli',
    village: 'Kharadi',
    state: 'MH',
    area: '1200 sq ft',
    ownerName: 'Rajesh Kumar Sharma',
    status: 'ENCUMBERED',
  },
];

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="govt-card text-center">
      <div className="text-bhulekh-saffron-500 mb-2 flex justify-center">
        {icon}
      </div>
      <div className="text-3xl font-bold text-bhulekh-navy">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-bhulekh-navy via-bhulekh-blue-900 to-bhulekh-navy text-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center px-3 py-1 bg-bhulekh-saffron-500/20 text-bhulekh-saffron-300 rounded-full text-sm font-medium mb-6">
              Government of India Initiative
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
              BhulekhChain
              <span className="block text-bhulekh-saffron-400 mt-2">
                National Blockchain Property Register
              </span>
            </h1>
            <p className="text-lg text-gray-300 mb-8 max-w-xl">
              Secure, transparent, and tamper-proof land records for every
              citizen of India. Powered by blockchain technology to eliminate
              fraud and ensure trust in property ownership.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/search" className="btn-primary text-lg px-8 py-3">
                Search Land Records
              </Link>
              <Link
                href="/verify"
                className="btn-secondary text-lg px-8 py-3 bg-transparent border-white text-white hover:bg-white/10"
              >
                Verify Property
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-bhulekh-green-400 rounded-full" />
                  <span className="text-sm">
                    Hyperledger Fabric - Government Registry
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-bhulekh-blue-400 rounded-full" />
                  <span className="text-sm">
                    Algorand - Public Verification
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-purple-400 rounded-full" />
                  <span className="text-sm">
                    Polygon - Tokenization Layer
                  </span>
                </div>
                <div className="mt-6 pt-4 border-t border-white/20">
                  <p className="text-xs text-gray-400">
                    Three-chain architecture ensuring government control,
                    public transparency, and future-ready tokenization.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSection({ stats }: { stats: PlatformStats }) {
  const formatNumber = (num: number): string => {
    if (num >= 100_000) {
      return `${(num / 100_000).toFixed(1)}L`;
    }
    return num.toLocaleString('en-IN');
  };

  return (
    <section className="py-12 bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard
            label="Total Land Records"
            value={formatNumber(stats.totalRecords)}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <StatCard
            label="Transfers Today"
            value={formatNumber(stats.transfersToday)}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
          />
          <StatCard
            label="States Active"
            value={stats.statesActive.toString()}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
            }
          />
          <StatCard
            label="Verifications"
            value={formatNumber(stats.verificationsTotal)}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

function DashboardView() {
  const { user } = useAuthStore();
  const [recentProperties] = useState<PropertySummary[]>(MOCK_USER_PROPERTIES);

  return (
    <div className="page-container">
      {/* Welcome banner */}
      <div className="govt-card mb-8 bg-gradient-to-r from-bhulekh-saffron-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-bhulekh-navy">
              Welcome, {user?.name ?? 'User'}
            </h1>
            <p className="text-gray-600 mt-1">
              Role: <span className="font-medium capitalize">{user?.role ?? 'citizen'}</span>
              {user?.stateCode && (
                <span className="ml-2 text-bhulekh-saffron-600">
                  ({user.stateCode})
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-3">
            <Link href="/search" className="btn-primary">
              Search Records
            </Link>
            <Link href="/verify" className="btn-secondary">
              Verify Property
            </Link>
          </div>
        </div>
      </div>

      {/* Quick stats for user */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="govt-card">
          <div className="text-sm text-gray-500">My Properties</div>
          <div className="text-2xl font-bold text-bhulekh-navy mt-1">
            {recentProperties.length}
          </div>
        </div>
        <div className="govt-card">
          <div className="text-sm text-gray-500">Pending Transfers</div>
          <div className="text-2xl font-bold text-bhulekh-saffron-600 mt-1">0</div>
        </div>
        <div className="govt-card">
          <div className="text-sm text-gray-500">Last Verification</div>
          <div className="text-2xl font-bold text-bhulekh-green-600 mt-1">
            2 days ago
          </div>
        </div>
      </div>

      {/* My properties */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-bhulekh-navy mb-4">
          My Properties
        </h2>
        {recentProperties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="govt-card text-center py-12 text-gray-500">
            <p>No properties linked to your account.</p>
            <Link
              href="/search"
              className="text-bhulekh-blue-600 hover:underline mt-2 inline-block"
            >
              Search for your property records
            </Link>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-xl font-semibold text-bhulekh-navy mb-4">
          Recent Activity
        </h2>
        <div className="govt-card">
          <div className="space-y-4">
            <div className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
              <div className="w-2 h-2 bg-bhulekh-green-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Property PROP-MH-2024-00142 verified on Algorand
                </p>
                <p className="text-xs text-gray-500">2 days ago</p>
              </div>
            </div>
            <div className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
              <div className="w-2 h-2 bg-bhulekh-blue-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Encumbrance check completed for PROP-MH-2024-00891
                </p>
                <p className="text-xs text-gray-500">5 days ago</p>
              </div>
            </div>
            <div className="flex items-center gap-4 py-2">
              <div className="w-2 h-2 bg-bhulekh-saffron-500 rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Account created and Aadhaar verified
                </p>
                <p className="text-xs text-gray-500">1 month ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [stats] = useState<PlatformStats>(MOCK_STATS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (isAuthenticated) {
    return <DashboardView />;
  }

  return (
    <div>
      <HeroSection />
      <StatsSection stats={stats} />

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-bhulekh-navy">
              Why BhulekhChain?
            </h2>
            <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">
              Built on the foundation of transparency, security, and citizen
              empowerment
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="govt-card text-center">
              <div className="w-12 h-12 bg-bhulekh-saffron-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-bhulekh-saffron-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-bhulekh-navy mb-2">
                Tamper-Proof Records
              </h3>
              <p className="text-gray-600 text-sm">
                Blockchain ensures no record can be altered without a
                transparent audit trail. Every change is permanent and
                verifiable.
              </p>
            </div>
            <div className="govt-card text-center">
              <div className="w-12 h-12 bg-bhulekh-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-bhulekh-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-bhulekh-navy mb-2">
                Instant Verification
              </h3>
              <p className="text-gray-600 text-sm">
                Citizens, banks, and courts can verify any property title
                instantly using public blockchain proofs on Algorand.
              </p>
            </div>
            <div className="govt-card text-center">
              <div className="w-12 h-12 bg-bhulekh-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-bhulekh-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-bhulekh-navy mb-2">
                Automatic Mutation
              </h3>
              <p className="text-gray-600 text-sm">
                No more separate applications. Ownership mutation happens
                automatically upon registration, saving weeks of processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-bhulekh-navy">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                title: 'Aadhaar Login',
                desc: 'Authenticate with your Aadhaar for secure, verified access',
              },
              {
                step: '2',
                title: 'Search Records',
                desc: 'Find any land record by survey number, owner, or location',
              },
              {
                step: '3',
                title: 'View Details',
                desc: 'See complete ownership history, encumbrances, and GIS maps',
              },
              {
                step: '4',
                title: 'Verify on Chain',
                desc: 'Independently verify any record on the public Algorand blockchain',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-bhulekh-saffron-500 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-bhulekh-navy mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
