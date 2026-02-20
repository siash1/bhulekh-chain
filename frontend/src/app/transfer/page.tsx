'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TransferForm from '@/components/TransferForm';
import { useAuthStore } from '@/stores/auth.store';

export default function TransferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();

  const preselectedPropertyId = searchParams.get('propertyId') ?? undefined;

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Only registrars and tehsildars can initiate transfers
    if (user?.role !== 'registrar' && user?.role !== 'tehsildar' && user?.role !== 'admin') {
      router.push('/');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || !user) {
    return null;
  }

  const allowedRoles = ['registrar', 'tehsildar', 'admin'];
  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="page-container">
        <div className="govt-card text-center py-16">
          <svg className="w-16 h-16 text-red-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500">
            Only Sub-Registrars (Registrar) and Tehsildars can initiate property
            transfers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bhulekh-navy">
          Initiate Property Transfer
        </h1>
        <p className="text-gray-600 mt-2">
          Register a property transfer with required verifications. All steps
          are recorded on the blockchain.
        </p>
      </div>

      {/* Important notices */}
      <div className="mb-6 p-4 bg-bhulekh-saffron-50 border border-bhulekh-saffron-200 rounded-lg">
        <h3 className="text-sm font-semibold text-bhulekh-saffron-800 mb-2">
          Important Requirements
        </h3>
        <ul className="text-sm text-bhulekh-saffron-700 space-y-1">
          <li>
            - Encumbrance check is mandatory before transfer
          </li>
          <li>
            - Stamp duty is calculated on circle rate (not declared value)
          </li>
          <li>
            - Two witness digital signatures are required
          </li>
          <li>
            - 72-hour cooling period applies before finality
          </li>
          <li>
            - Mutation will be automatic upon registration
          </li>
        </ul>
      </div>

      {/* Transfer form */}
      <TransferForm preselectedPropertyId={preselectedPropertyId} />
    </div>
  );
}
