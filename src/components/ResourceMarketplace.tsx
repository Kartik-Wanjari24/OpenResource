import { useState, useEffect } from 'react';
import { resourceApi, ApiError, type DiscoveryResult, type Alternative } from '../lib/api';
import { ResourceCard } from './ResourceCard';
import styles from './ResourceMarketplace.module.css';

interface ResourceMarketplaceProps {
  userHeaders?: Record<string, string>;
  onResourceSelect?: (resources: any[]) => void;
}

const CATEGORIES = [
  'THREE_D_PRINTING',
  'LASER_CUTTING',
  'CNC_MACHINING',
  'ELECTRONICS_LAB',
  'WOODWORKING',
  'METALWORKING',
  'PHOTOGRAPHY',
  'VIDEO_PRODUCTION',
  'COMPUTING',
  'OTHER',
];

export function ResourceMarketplace({ userHeaders, onResourceSelect }: ResourceMarketplaceProps) {
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [maxDeposit, setMaxDeposit] = useState<string>('');

  useEffect(() => {
    loadResources();
  }, [selectedCategory, userHeaders]);

  // Notify parent of resource changes for timeline
  useEffect(() => {
    if (onResourceSelect && results.length > 0) {
      onResourceSelect(results.map((r) => r.resource));
    }
  }, [results, onResourceSelect]);

  const loadResources = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await resourceApi.discover({
        query: searchQuery || undefined,
        filters: {
          category: selectedCategory || undefined,
          location: locationFilter || undefined,
          maxDeposit: maxDeposit ? parseFloat(maxDeposit) : undefined,
        },
        headers: userHeaders,
      });

      setResults(data.results);
      setAlternatives(data.alternatives);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          setError('Authentication required. Please select a persona from the telemetry bar.');
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load resources');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    loadResources();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setLocationFilter('');
    setMaxDeposit('');
  };

  const readyCount = results.filter((r) => r.eligibility.status === 'READY_TO_BOOK').length;
  const totalCount = results.length;

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>Resource Marketplace</h1>
        <p className={styles.subtitle}>
          Discover and book lab equipment based on your qualifications
        </p>
      </header>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchRow}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            aria-label="Search resources"
          />
          <button
            type="button"
            className={styles.searchButton}
            onClick={handleSearch}
            disabled={isLoading}
            aria-label="Search"
          >
            Search
          </button>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label htmlFor="category-select" className={styles.filterLabel}>
              Category:
            </label>
            <select
              id="category-select"
              className={styles.filterSelect}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isLoading}
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {formatCategory(cat)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="location-input" className={styles.filterLabel}>
              Location:
            </label>
            <input
              id="location-input"
              type="text"
              className={styles.filterInput}
              placeholder="e.g., Lab A"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="deposit-input" className={styles.filterLabel}>
              Max Deposit:
            </label>
            <input
              id="deposit-input"
              type="number"
              className={styles.filterInput}
              placeholder="e.g., 100"
              value={maxDeposit}
              onChange={(e) => setMaxDeposit(e.target.value)}
              disabled={isLoading}
              min="0"
              step="10"
            />
          </div>

          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClearFilters}
            disabled={isLoading}
            aria-label="Clear filters"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results Summary */}
      {!isLoading && !error && (
        <div className={styles.summary}>
          <p className={styles.summaryText}>
            Found <strong>{totalCount}</strong> resources
            {readyCount > 0 && (
              <>
                {' '}
                — <strong>{readyCount}</strong> ready to book
              </>
            )}
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className={styles.loading} role="status" aria-live="polite">
          <div className={styles.spinner} aria-hidden="true" />
          <p>Loading resources...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.error} role="alert">
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorMessage}>{error}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={loadResources}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Grid */}
      {!isLoading && !error && results.length > 0 && (
        <div className={styles.grid}>
          {results.map((result) => (
            <ResourceCard
              key={result.resource.id}
              result={result}
              alternatives={alternatives.filter((alt) => alt.resourceId !== result.resource.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && results.length === 0 && (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>No resources found</h3>
          <p className={styles.emptyMessage}>
            Try adjusting your filters or search terms to find more resources.
          </p>
        </div>
      )}
    </div>
  );
}

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
