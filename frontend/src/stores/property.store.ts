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

// Mock data for demonstration when API is not available
const MOCK_SEARCH_RESULTS: PropertySummary[] = [
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
    ownerName: 'Priya Mehta',
    status: 'ENCUMBERED',
  },
  {
    id: 'PROP-MH-2023-01234',
    surveyNumber: '789/2C',
    district: 'Mumbai',
    tehsil: 'Andheri',
    village: 'Versova',
    state: 'MH',
    area: '850 sq ft',
    ownerName: 'Amit Deshmukh',
    status: 'ACTIVE',
  },
  {
    id: 'PROP-GJ-2024-00567',
    surveyNumber: '321/1A',
    district: 'Ahmedabad',
    tehsil: 'Daskroi',
    village: 'Bopal',
    state: 'GJ',
    area: '3200 sq ft',
    ownerName: 'Suresh Patel',
    status: 'ACTIVE',
  },
  {
    id: 'PROP-KA-2024-00234',
    surveyNumber: '654/3B',
    district: 'Bangalore Urban',
    tehsil: 'Anekal',
    village: 'Electronic City',
    state: 'KA',
    area: '1800 sq ft',
    ownerName: 'Lakshmi Narayanan',
    status: 'DISPUTED',
  },
  {
    id: 'PROP-TG-2024-00890',
    surveyNumber: '987/5D',
    district: 'Hyderabad',
    tehsil: 'Rajendranagar',
    village: 'Narsingi',
    state: 'TG',
    area: '2000 sq ft',
    ownerName: 'Mohammed Irfan',
    status: 'ACTIVE',
  },
  {
    id: 'PROP-UP-2024-01122',
    surveyNumber: '111/8E',
    district: 'Lucknow',
    tehsil: 'Sarojininagar',
    village: 'Gomti Nagar',
    state: 'UP',
    area: '1500 sq ft',
    ownerName: 'Neha Gupta',
    status: 'TRANSFER_IN_PROGRESS',
  },
  {
    id: 'PROP-RJ-2024-00345',
    surveyNumber: '222/6F',
    district: 'Jaipur',
    tehsil: 'Sanganer',
    village: 'Mansarovar',
    state: 'RJ',
    area: '2800 sq ft',
    ownerName: 'Vikram Singh Rathore',
    status: 'ACTIVE',
  },
  {
    id: 'PROP-DL-2024-00678',
    surveyNumber: '333/9G',
    district: 'South Delhi',
    tehsil: 'Hauz Khas',
    village: 'Safdarjung Enclave',
    state: 'DL',
    area: '1100 sq ft',
    ownerName: 'Ananya Kapoor',
    status: 'FROZEN',
  },
];

function filterMockResults(query: SearchQuery): PropertySummary[] {
  return MOCK_SEARCH_RESULTS.filter((property) => {
    if (query.stateCode && property.state !== query.stateCode) return false;
    if (
      query.district &&
      !property.district.toLowerCase().includes(query.district.toLowerCase())
    )
      return false;
    if (
      query.tehsil &&
      !property.tehsil.toLowerCase().includes(query.tehsil.toLowerCase())
    )
      return false;
    if (
      query.village &&
      !property.village.toLowerCase().includes(query.village.toLowerCase())
    )
      return false;
    if (
      query.surveyNumber &&
      !property.surveyNumber.includes(query.surveyNumber)
    )
      return false;
    if (
      query.ownerName &&
      !property.ownerName.toLowerCase().includes(query.ownerName.toLowerCase())
    )
      return false;
    return true;
  });
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
      const response = await apiClient.get<{
        results: PropertySummary[];
        total: number;
      }>('/properties/search', query as Record<string, string>);

      set({
        searchResults: response.results,
        totalResults: response.total,
        loading: false,
      });
    } catch (error) {
      // Fallback to mock data for demo
      if (
        error instanceof TypeError ||
        (error instanceof ApiRequestError && error.status >= 500)
      ) {
        const filtered = filterMockResults(query);
        set({
          searchResults: filtered,
          totalResults: filtered.length,
          loading: false,
        });
        return;
      }

      // If there are no specific filters, show all mock results
      if (Object.keys(query).length === 0) {
        set({
          searchResults: MOCK_SEARCH_RESULTS,
          totalResults: MOCK_SEARCH_RESULTS.length,
          loading: false,
        });
        return;
      }

      const filtered = filterMockResults(query);
      set({
        searchResults: filtered,
        totalResults: filtered.length,
        loading: false,
        error: null,
      });
    }
  },

  getProperty: async (id: string) => {
    set({ loading: true, error: null });

    try {
      const property = await apiClient.get<PropertyDetail>(
        `/properties/${id}`
      );
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
      const response = await apiClient.get<{ records: OwnershipRecord[] }>(
        `/properties/${id}/history`
      );
      set({ propertyHistory: response.records, historyLoading: false });
    } catch {
      // Silently fail for history -- the page has its own mock data
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
