'use client';

import { useState, useCallback } from 'react';
import type { SearchQuery } from '@/stores/property.store';

interface SearchFormProps {
  onSearch: (query: SearchQuery) => void;
  onClear: () => void;
}

const INDIAN_STATES = [
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

export default function SearchForm({ onSearch, onClear }: SearchFormProps) {
  const [stateCode, setStateCode] = useState('');
  const [district, setDistrict] = useState('');
  const [tehsil, setTehsil] = useState('');
  const [village, setVillage] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const query: SearchQuery = {};
      if (stateCode) query.stateCode = stateCode;
      if (district.trim()) query.district = district.trim();
      if (tehsil.trim()) query.tehsil = tehsil.trim();
      if (village.trim()) query.village = village.trim();
      if (surveyNumber.trim()) query.surveyNumber = surveyNumber.trim();
      if (ownerName.trim()) query.ownerName = ownerName.trim();

      onSearch(query);
    },
    [stateCode, district, tehsil, village, surveyNumber, ownerName, onSearch]
  );

  const handleClear = useCallback(() => {
    setStateCode('');
    setDistrict('');
    setTehsil('');
    setVillage('');
    setSurveyNumber('');
    setOwnerName('');
    onClear();
  }, [onClear]);

  const hasFilters =
    stateCode || district || tehsil || village || surveyNumber || ownerName;

  return (
    <form onSubmit={handleSubmit}>
      {/* Primary search row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <option value="">All States</option>
            {INDIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name} ({state.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="surveyNumber" className="form-label">
            Survey Number
          </label>
          <input
            id="surveyNumber"
            type="text"
            value={surveyNumber}
            onChange={(e) => setSurveyNumber(e.target.value)}
            className="form-input"
            placeholder="e.g., 123/4A"
          />
        </div>

        <div>
          <label htmlFor="ownerName" className="form-label">
            Owner Name
          </label>
          <input
            id="ownerName"
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="form-input"
            placeholder="e.g., Rajesh Sharma"
          />
        </div>
      </div>

      {/* Advanced filters toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-bhulekh-blue-600 hover:text-bhulekh-blue-800 font-medium mb-4 flex items-center gap-1"
      >
        <svg
          className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
      </button>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label htmlFor="district" className="form-label">
              District
            </label>
            <input
              id="district"
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="form-input"
              placeholder="e.g., Pune"
            />
          </div>

          <div>
            <label htmlFor="tehsil" className="form-label">
              Tehsil
            </label>
            <input
              id="tehsil"
              type="text"
              value={tehsil}
              onChange={(e) => setTehsil(e.target.value)}
              className="form-input"
              placeholder="e.g., Haveli"
            />
          </div>

          <div>
            <label htmlFor="village" className="form-label">
              Village
            </label>
            <input
              id="village"
              type="text"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              className="form-input"
              placeholder="e.g., Wadgaon Sheri"
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search Records
        </button>

        {hasFilters && (
          <button type="button" onClick={handleClear} className="btn-secondary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear Filters
          </button>
        )}
      </div>
    </form>
  );
}
