'use client';

export type PropertyStatus =
  | 'ACTIVE'
  | 'DISPUTED'
  | 'ENCUMBERED'
  | 'FROZEN'
  | 'TRANSFER_IN_PROGRESS';

type BadgeSize = 'sm' | 'md' | 'lg';

interface StatusBadgeProps {
  status: PropertyStatus | string;
  size?: BadgeSize;
}

const STATUS_CONFIG: Record<
  PropertyStatus,
  { label: string; bgColor: string; textColor: string; dotColor: string }
> = {
  ACTIVE: {
    label: 'Active',
    bgColor: 'bg-bhulekh-green-100',
    textColor: 'text-bhulekh-green-800',
    dotColor: 'bg-bhulekh-green-500',
  },
  DISPUTED: {
    label: 'Disputed',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    dotColor: 'bg-red-500',
  },
  ENCUMBERED: {
    label: 'Encumbered',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    dotColor: 'bg-yellow-500',
  },
  FROZEN: {
    label: 'Frozen',
    bgColor: 'bg-bhulekh-blue-100',
    textColor: 'text-bhulekh-blue-800',
    dotColor: 'bg-bhulekh-blue-500',
  },
  TRANSFER_IN_PROGRESS: {
    label: 'Transfer in Progress',
    bgColor: 'bg-bhulekh-saffron-100',
    textColor: 'text-bhulekh-saffron-800',
    dotColor: 'bg-bhulekh-saffron-500',
  },
};

const SIZE_CLASSES: Record<BadgeSize, { container: string; dot: string; text: string }> = {
  sm: {
    container: 'px-2 py-0.5',
    dot: 'w-1.5 h-1.5',
    text: 'text-xs',
  },
  md: {
    container: 'px-2.5 py-1',
    dot: 'w-2 h-2',
    text: 'text-sm',
  },
  lg: {
    container: 'px-3 py-1.5',
    dot: 'w-2.5 h-2.5',
    text: 'text-base',
  },
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const normalizedStatus = status.toUpperCase() as PropertyStatus;
  const config = STATUS_CONFIG[normalizedStatus] ?? {
    label: status,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    dotColor: 'bg-gray-500',
  };
  const sizeConfig = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bgColor} ${config.textColor} ${sizeConfig.container}`}
    >
      <span className={`${config.dotColor} ${sizeConfig.dot} rounded-full flex-shrink-0`} />
      <span className={sizeConfig.text}>{config.label}</span>
    </span>
  );
}
