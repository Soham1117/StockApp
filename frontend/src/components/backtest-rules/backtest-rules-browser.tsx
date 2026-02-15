'use client';

import { RulesFilterPanel } from './rules-filter-panel';
import { RulesResultsTable } from './rules-results-table';
import { useBacktestRules } from '@/hooks/use-backtest-rules';
import { Skeleton } from '@/components/ui/skeleton';

export function BacktestRulesBrowser() {
  const {
    data,
    isLoading,
    isError,
    filters,
    sortBy,
    sortDir,
    page,
    updateFilters,
    updateSort,
    updatePage,
  } = useBacktestRules();

  const sectors = data?.sectors || [];
  const holdingYearsOptions = data?.holding_years_options || [1, 2, 3];
  const results = data?.results || [];
  const total = data?.total || 0;
  const pageSize = data?.page_size || 25;

  if (isError) {
    return (
      <div className="p-8 text-center border border-border rounded-md">
        <p className="text-red-500">Failed to load backtest rules. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left sidebar - Filters */}
      <div className="lg:col-span-3 lg:sticky lg:top-[60px] lg:self-start">
        {isLoading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : (
          <RulesFilterPanel
            filters={filters}
            onFiltersChange={updateFilters}
            sectors={sectors}
            holdingYearsOptions={holdingYearsOptions}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Main content - Results table */}
      <div className="lg:col-span-9">
        <RulesResultsTable
          results={results}
          total={total}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortDir={sortDir}
          isLoading={isLoading}
          onSort={updateSort}
          onPageChange={updatePage}
        />
      </div>
    </div>
  );
}
