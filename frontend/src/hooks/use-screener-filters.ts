'use client';

import { useState, useCallback } from 'react';
import type { ScreenerFilters, CustomRule } from '@/lib/saved-screens-api';

const DEFAULT_FILTERS: ScreenerFilters = {
  country: undefined, // No country filter by default - show all stocks
  industry: undefined,
  cap: 'all',
  customRules: [],
  ruleLogic: 'AND',
};

export function useScreenerFilters(initialFilters?: ScreenerFilters) {
  const [filters, setFilters] = useState<ScreenerFilters>(
    initialFilters || DEFAULT_FILTERS
  );

  const updateFilter = useCallback(<K extends keyof ScreenerFilters>(
    key: K,
    value: ScreenerFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addCustomRule = useCallback((rule: CustomRule) => {
    setFilters((prev) => ({
      ...prev,
      customRules: [...(prev.customRules || []), rule],
    }));
  }, []);

  const updateCustomRule = useCallback((ruleId: string, updates: Partial<CustomRule>) => {
    setFilters((prev) => ({
      ...prev,
      customRules: (prev.customRules || []).map((rule) =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      ),
    }));
  }, []);

  const removeCustomRule = useCallback((ruleId: string) => {
    setFilters((prev) => ({
      ...prev,
      customRules: (prev.customRules || []).filter((rule) => rule.id !== ruleId),
    }));
  }, []);

  const toggleCustomRule = useCallback((ruleId: string) => {
    setFilters((prev) => ({
      ...prev,
      customRules: (prev.customRules || []).map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      ),
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    replaceFilters: setFilters,
    updateFilter,
    addCustomRule,
    updateCustomRule,
    removeCustomRule,
    toggleCustomRule,
    resetFilters,
  };
}
