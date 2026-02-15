'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type {
  BacktestRulesResponse,
  BacktestRulesFilters,
  RulesSortField,
  SortDirection,
} from '@/lib/backtest-rules-types';

export function useBacktestRules() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse URL params into filter state
  const filters: BacktestRulesFilters = useMemo(
    () => ({
      sector: searchParams.get('sector') || undefined,
      cap: (searchParams.get('cap') as BacktestRulesFilters['cap']) || 'all',
      holdingYears: searchParams.get('holdingYears')
        ? parseInt(searchParams.get('holdingYears')!)
        : undefined,
    }),
    [searchParams]
  );

  const sortBy = (searchParams.get('sortBy') as RulesSortField) || 'train_avg_excess';
  const sortDir = (searchParams.get('sortDir') as SortDirection) || 'desc';
  const page = parseInt(searchParams.get('page') || '1');

  // Update URL when filters change
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Fetch data
  const query = useQuery({
    queryKey: ['backtest-rules', filters, sortBy, sortDir, page],
    queryFn: async (): Promise<BacktestRulesResponse> => {
      const params = new URLSearchParams();
      if (filters.sector) params.set('sector', filters.sector);
      if (filters.cap && filters.cap !== 'all') params.set('cap', filters.cap);
      if (filters.holdingYears) params.set('holding_years', String(filters.holdingYears));
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      params.set('page', String(page));
      params.set('page_size', '25');

      const res = await fetch(`/api/backtest/rules?${params}`);
      if (!res.ok) throw new Error('Failed to fetch backtest rules');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ...query,
    filters,
    sortBy,
    sortDir,
    page,
    updateFilters: (newFilters: Partial<BacktestRulesFilters>) => {
      // Merge with existing filters - only update what's provided
      const merged = { ...filters, ...newFilters };
      updateParams({
        sector: merged.sector,
        cap: merged.cap,
        holdingYears: merged.holdingYears?.toString(),
        page: '1', // Reset to page 1 on filter change
      });
    },
    updateSort: (field: RulesSortField) => {
      const newDir = sortBy === field && sortDir === 'desc' ? 'asc' : 'desc';
      updateParams({ sortBy: field, sortDir: newDir, page: '1' });
    },
    updatePage: (newPage: number) => {
      updateParams({ page: String(newPage) });
    },
  };
}
