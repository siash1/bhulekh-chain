'use client';

import { useState, useCallback } from 'react';
import SearchForm from '@/components/SearchForm';
import PropertyCard from '@/components/PropertyCard';
import { usePropertyStore } from '@/stores/property.store';
import type { SearchQuery } from '@/stores/property.store';

const ITEMS_PER_PAGE = 12;

export default function SearchPage() {
  const {
    searchResults,
    loading,
    totalResults,
    search,
    clearSearch,
  } = usePropertyStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(
    async (query: SearchQuery) => {
      setCurrentPage(1);
      setHasSearched(true);
      await search(query);
    },
    [search]
  );

  const handleClear = useCallback(() => {
    clearSearch();
    setCurrentPage(1);
    setHasSearched(false);
  }, [clearSearch]);

  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE);

  const paginatedResults = searchResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bhulekh-navy">
          Search Land Records
        </h1>
        <p className="text-gray-600 mt-2">
          Search by survey number, owner name, or location across all registered
          states
        </p>
      </div>

      {/* Search form */}
      <div className="govt-card mb-8">
        <SearchForm onSearch={handleSearch} onClear={handleClear} />
      </div>

      {/* Results section */}
      {loading && (
        <div className="text-center py-16">
          <div className="inline-flex items-center gap-3">
            <svg className="animate-spin w-6 h-6 text-bhulekh-saffron-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-gray-600 text-lg">
              Searching land records...
            </span>
          </div>
        </div>
      )}

      {!loading && hasSearched && searchResults.length === 0 && (
        <div className="govt-card text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            No records found
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            No land records match your search criteria. Try adjusting your
            filters or search with different parameters.
          </p>
        </div>
      )}

      {!loading && searchResults.length > 0 && (
        <>
          {/* Results count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-600">
              Showing{' '}
              <span className="font-medium">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium">
                {Math.min(currentPage * ITEMS_PER_PAGE, totalResults)}
              </span>{' '}
              of <span className="font-medium">{totalResults}</span> results
            </p>
          </div>

          {/* Results grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {paginatedResults.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .map((page, index, arr) => {
                  const prev = arr[index - 1];
                  const showEllipsis = prev !== undefined && page - prev > 1;

                  return (
                    <span key={page} className="flex items-center">
                      {showEllipsis && (
                        <span className="px-2 py-2 text-gray-400">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={`w-10 h-10 text-sm font-medium rounded-lg ${
                          page === currentPage
                            ? 'bg-bhulekh-saffron-500 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    </span>
                  );
                })}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* No search yet */}
      {!hasSearched && !loading && (
        <div className="govt-card text-center py-16">
          <svg className="w-16 h-16 text-bhulekh-saffron-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            Search for land records
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Use the search form above to find land records by state, district,
            tehsil, survey number, or owner name.
          </p>
        </div>
      )}
    </div>
  );
}
