'use client';

import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import type { PropertyStatus } from '@/components/StatusBadge';

export interface PropertyCardProps {
  property: {
    id: string;
    surveyNumber: string;
    district: string;
    tehsil: string;
    village: string;
    state: string;
    area: string;
    ownerName: string;
    status: PropertyStatus;
  };
}

export default function PropertyCard({ property }: PropertyCardProps) {
  return (
    <Link href={`/property/${property.id}`} className="block group">
      <div className="govt-card h-full transition-shadow duration-200 group-hover:shadow-govt-lg">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-bhulekh-navy">
              {property.id}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Survey No. {property.surveyNumber}
            </p>
          </div>
          <StatusBadge status={property.status} size="sm" />
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>
            {property.village}, {property.tehsil}, {property.district}
          </span>
        </div>

        {/* Area */}
        <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-3">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
          </svg>
          <span>{property.area}</span>
        </div>

        {/* Owner */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-bhulekh-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-bhulekh-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700 truncate">
              {property.ownerName}
            </span>
          </div>
        </div>

        {/* View link indicator */}
        <div className="mt-3 flex items-center justify-end text-xs text-bhulekh-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View Details
          <svg className="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
