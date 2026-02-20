'use client';

type AcquisitionType =
  | 'SALE'
  | 'INHERITANCE'
  | 'GIFT'
  | 'GOVERNMENT_GRANT'
  | 'COURT_ORDER';

interface OwnershipRecord {
  ownerName: string;
  acquisitionType: AcquisitionType;
  date: string;
  fabricTxId: string;
  isCurrent: boolean;
}

interface OwnershipTimelineProps {
  records: OwnershipRecord[];
}

const ACQUISITION_CONFIG: Record<
  AcquisitionType,
  { label: string; color: string; bgColor: string; borderColor: string; icon: string }
> = {
  SALE: {
    label: 'Sale',
    color: 'text-bhulekh-blue-700',
    bgColor: 'bg-bhulekh-blue-100',
    borderColor: 'border-bhulekh-blue-400',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  },
  INHERITANCE: {
    label: 'Inheritance',
    color: 'text-bhulekh-green-700',
    bgColor: 'bg-bhulekh-green-100',
    borderColor: 'border-bhulekh-green-400',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  GIFT: {
    label: 'Gift',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-400',
    icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  },
  GOVERNMENT_GRANT: {
    label: 'Government Grant',
    color: 'text-bhulekh-saffron-700',
    bgColor: 'bg-bhulekh-saffron-100',
    borderColor: 'border-bhulekh-saffron-400',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  COURT_ORDER: {
    label: 'Court Order',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-400',
    icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 01-6.001 0M18 7l-3 9m0-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
  },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function OwnershipTimeline({ records }: OwnershipTimelineProps) {
  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No ownership history available.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

      <div className="space-y-0">
        {records.map((record, index) => {
          const config = ACQUISITION_CONFIG[record.acquisitionType];

          return (
            <div key={record.fabricTxId} className="relative flex gap-4">
              {/* Timeline node */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    record.isCurrent
                      ? `${config.bgColor} ring-4 ring-white shadow-lg`
                      : config.bgColor
                  }`}
                >
                  <svg
                    className={`w-5 h-5 ${config.color}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={config.icon}
                    />
                  </svg>
                </div>
              </div>

              {/* Content */}
              <div
                className={`flex-1 pb-8 ${
                  index === records.length - 1 ? 'pb-0' : ''
                }`}
              >
                <div
                  className={`border rounded-lg p-4 ${
                    record.isCurrent
                      ? `${config.borderColor} border-2 bg-white shadow-sm`
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Current owner badge */}
                  {record.isCurrent && (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-bhulekh-green-100 text-bhulekh-green-800 rounded-full">
                        Current Owner
                      </span>
                    </div>
                  )}

                  {/* Owner name */}
                  <h3
                    className={`font-semibold ${
                      record.isCurrent ? 'text-lg text-bhulekh-navy' : 'text-gray-800'
                    }`}
                  >
                    {record.ownerName}
                  </h3>

                  {/* Details */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
                    >
                      {config.label}
                    </span>
                    <span className="text-gray-500">
                      {formatDate(record.date)}
                    </span>
                  </div>

                  {/* Transaction ID */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Fabric Tx:</span>
                    <code className="text-xs text-gray-500 font-mono">
                      {record.fabricTxId.length > 24
                        ? `${record.fabricTxId.slice(0, 12)}...${record.fabricTxId.slice(-8)}`
                        : record.fabricTxId}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(record.fabricTxId);
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy transaction ID"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
