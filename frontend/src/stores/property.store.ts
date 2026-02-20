import { create } from 'zustand';
import { apiClient, ApiRequestError } from '@/lib/api';
import type { PropertyStatus } from '@/components/StatusBadge';

export interface PropertySummary {
  id: string;
  surveyNumber: string;
  district: string;
  tehsil: string;
  village: string;
  state: string;
  area: string;
  ownerName: string;
  status: PropertyStatus;
}

export interface PropertyDetail extends PropertySummary {
  khasraNumber: string;
  stateCode: string;
  areaUnit: string;
  landType: string;
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

export interface OwnershipRecord {
  ownerName: string;
  acquisitionType: 'SALE' | 'INHERITANCE' | 'GIFT' | 'GOVERNMENT_GRANT' | 'COURT_ORDER';
  date: string;
  fabricTxId: string;
  isCurrent: boolean;
}

export interface SearchQuery {
  stateCode?: string;
  district?: string;
  tehsil?: string;
  village?: string;
  surveyNumber?: string;
  ownerName?: string;
}

interface PropertyState {
  searchResults: PropertySummary[];
  totalResults: number;
  selectedProperty: PropertyDetail | null;
  propertyHistory: OwnershipRecord[];
  loading: boolean;
  historyLoading: boolean;
  error: string | null;

  /**
   * Search for properties matching the given query.
   */
  search: (query: SearchQuery) => Promise<void>;

  /**
   * Fetch a single property by ID.
   */
  getProperty: (id: string) => Promise<void>;

  /**
   * Fetch ownership history for a property.
   */
  getHistory: (id: string) => Promise<void>;

  /**
   * Clear search results and reset state.
   */
  clearSearch: () => void;
}


export const usePropertyStore = create<PropertyState>((set) => ({
  searchResults: [],
  totalResults: 0,
  selectedProperty: null,
  propertyHistory: [],
  loading: false,
  historyLoading: false,
  error: null,

  search: async (query: SearchQuery) => {
    set({ loading: true, error: null });

    try {
      const params: Record<string, string> = {};
      if (query.stateCode) params['stateCode'] = query.stateCode;
      if (query.district) params['district'] = query.district;
      if (query.tehsil) params['tehsil'] = query.tehsil;
      if (query.village) params['village'] = query.village;
      if (query.surveyNumber) params['surveyNo'] = query.surveyNumber;
      if (query.ownerName) params['ownerName'] = query.ownerName;

      const response = await apiClient.get<{
        success: boolean;
        data: {
          records: Array<Record<string, unknown>>;
          pagination: { total: number };
        };
      }>('/land/search', params);

      const records = response.data.records.map((r): PropertySummary => {
        // Handle Prisma Decimal for area
        let area = '?';
        const raw = r['areaSqMeters'];
        if (typeof raw === 'number' || typeof raw === 'string') {
          area = String(raw);
        } else if (raw && typeof raw === 'object' && 's' in (raw as Record<string, unknown>)) {
          const dec = raw as { s: number; e: number; d: number[] };
          const digits = dec.d.join('');
          area = String(dec.s * Number(digits) * Math.pow(10, dec.e - digits.length + 1));
        }
        return {
          id: String(r['propertyId'] ?? ''),
          surveyNumber: String(r['surveyNumber'] ?? ''),
          district: String(r['districtCode'] ?? ''),
          tehsil: String(r['tehsilCode'] ?? ''),
          village: String(r['villageCode'] ?? ''),
          state: String(r['stateCode'] ?? ''),
          area: `${area} sq m`,
          ownerName: String(r['ownerName'] ?? ''),
          status: (String(r['status'] ?? 'ACTIVE')) as PropertyStatus,
        };
      });

      set({
        searchResults: records,
        totalResults: response.data.pagination.total,
        loading: false,
      });
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Search failed';
      set({ loading: false, error: message, searchResults: [], totalResults: 0 });
    }
  },

  getProperty: async (id: string) => {
    set({ loading: true, error: null });

    try {
      const response = await apiClient.get<{
        success: boolean;
        data: Record<string, unknown>;
      }>(`/land/${id}`);

      const r = response.data;

      // Helper: extract a usable number from Prisma Decimal {s,e,d} or plain number
      const toNum = (val: unknown): string => {
        if (val == null) return '';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'string') return val;
        if (typeof val === 'object' && 's' in (val as Record<string, unknown>)) {
          // Prisma Decimal: reconstruct from {s, e, d}
          const dec = val as { s: number; e: number; d: number[] };
          const digits = dec.d.join('');
          const num = dec.s * Number(digits) * Math.pow(10, dec.e - digits.length + 1);
          return String(num);
        }
        return String(val);
      };

      // Helper: extract a date string from various formats
      const toDateStr = (val: unknown): string => {
        if (val == null) return '';
        if (typeof val === 'string' && val.length > 0) return val;
        // Prisma Date serializes as ISO string normally, but empty {} means no value
        if (typeof val === 'object' && Object.keys(val as object).length === 0) return '';
        return String(val);
      };

      const owner = r['currentOwner'] as Record<string, unknown> | undefined;
      const owners = (owner?.['owners'] as Array<Record<string, unknown>>) ?? [];
      const firstOwner = owners[0] ?? {};
      const location = r['location'] as Record<string, string> | undefined;
      const boundaries = r['boundaries'] as Record<string, unknown> | undefined;
      const geoJson = boundaries?.['geoJson'] as { coordinates?: number[][][] } | null;
      const coords = (geoJson?.coordinates?.[0] as Array<[number, number]>) ?? [];

      // Area: Fabric has area.value (number), PostgreSQL has areaSqMeters (Decimal)
      const areaRaw = r['area'] as Record<string, unknown> | undefined;
      const areaValue = areaRaw?.['value'] != null ? toNum(areaRaw['value']) : toNum(r['areaSqMeters']);

      const property: PropertyDetail = {
        id: String(r['propertyId'] ?? id),
        surveyNumber: String(r['surveyNumber'] ?? ''),
        khasraNumber: String(r['subSurveyNumber'] ?? ''),
        district: location?.['districtName'] ?? String(r['districtCode'] ?? ''),
        tehsil: location?.['tehsilName'] ?? String(r['tehsilCode'] ?? ''),
        village: location?.['villageName'] ?? String(r['villageCode'] ?? ''),
        state: location?.['stateName'] ?? String(r['stateCode'] ?? ''),
        stateCode: location?.['stateCode'] ?? String(r['stateCode'] ?? ''),
        ownerName: String(firstOwner['name'] ?? r['ownerName'] ?? ''),
        area: areaValue,
        areaUnit: 'sq m',
        landType: String(r['landUse'] ?? ''),
        status: String(r['status'] ?? 'ACTIVE') as PropertyStatus,
        currentOwner: {
          name: String(firstOwner['name'] ?? r['ownerName'] ?? ''),
          aadhaarHash: String(firstOwner['aadhaarHash'] ?? r['ownerAadhaarHash'] ?? ''),
          acquisitionType: String(owner?.['acquisitionType'] ?? r['acquisitionType'] ?? ''),
          acquisitionDate: toDateStr(owner?.['acquisitionDate'] ?? r['acquisitionDate']),
        },
        encumbrances: [],
        fabricTxId: String(r['fabricTxId'] ?? ''),
        algorandAppId: r['algorandInfo'] ? String((r['algorandInfo'] as Record<string, unknown>)['asaId'] ?? '') : null,
        algorandVerified: false,
        lastVerifiedAt: null,
        coordinates: coords,
        createdAt: toDateStr(r['createdAt']),
        updatedAt: toDateStr(r['updatedAt']),
      };

      set({ selectedProperty: property, loading: false });
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to load property details';

      set({ loading: false, error: message });
    }
  },

  getHistory: async (id: string) => {
    set({ historyLoading: true });

    try {
      const response = await apiClient.get<{
        success: boolean;
        data: {
          chain: Array<Record<string, unknown>>;
        };
      }>(`/land/${id}/history`);

      const records = response.data.chain.map((entry, idx, arr): OwnershipRecord => {
        const owner = entry['owner'] as Record<string, string> | undefined;
        return {
          ownerName: owner?.['name'] ?? String(entry['ownerName'] ?? ''),
          acquisitionType: String(entry['acquisitionType'] ?? 'SALE') as OwnershipRecord['acquisitionType'],
          date: String(entry['date'] ?? ''),
          fabricTxId: String(entry['fabricTxId'] ?? ''),
          isCurrent: idx === arr.length - 1,
        };
      });

      set({ propertyHistory: records, historyLoading: false });
    } catch {
      set({ historyLoading: false });
    }
  },

  clearSearch: () => {
    set({
      searchResults: [],
      totalResults: 0,
      error: null,
    });
  },
}));
