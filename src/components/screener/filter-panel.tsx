'use client';

import { useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CustomRuleBuilder } from './custom-rule-builder';
import { SaveScreenDialog } from './save-screen-dialog';
import { useIndustries } from '@/hooks/use-industries';
import { Play } from 'lucide-react';
import type { Stock, StockMetrics } from '@/types';
import type { ScreenerFilters, CustomRule } from '@/lib/saved-screens-api';
import { applyFilters } from '@/lib/filter-utils';

interface FilterPanelProps {
  allStocks: Stock[];
  allMetrics: StockMetrics[];
  onRun: () => void;
  onFilteredCountChange?: (count: number) => void;
  filters: ScreenerFilters;
  updateFilter: <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => void;
  addCustomRule: (rule: CustomRule) => void;
  updateCustomRule: (ruleId: string, updates: Partial<CustomRule>) => void;
  removeCustomRule: (ruleId: string) => void;
}

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Japan',
  'Australia',
  'China',
  'India',
  'Brazil',
  'Other',
] as const;

export function FilterPanel({
  allStocks,
  allMetrics,
  onRun,
  onFilteredCountChange,
  filters,
  updateFilter,
  addCustomRule,
  updateCustomRule,
  removeCustomRule,
}: FilterPanelProps) {
  const { data: industriesData, isLoading: isLoadingIndustries } = useIndustries();

  // Calculate filtered count
  const filteredCount = useMemo(() => {
    const filtered = applyFilters(allStocks, allMetrics, filters);
    return filtered.length;
  }, [allStocks, allMetrics, filters]);

  // Notify parent of count change
  useEffect(() => {
    onFilteredCountChange?.(filteredCount);
  }, [filteredCount, onFilteredCountChange]);

  const industries = industriesData?.industries || [];
  const sectors = industriesData?.sectors || [];
  const industryOptions = [...sectors, ...industries].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  return (
    <Card className="h-fit" variant="dense">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-[11px] tracking-widest uppercase">Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Country Filter */}
        <div className="space-y-1">
          <Label htmlFor="country" className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Country
          </Label>
          <Select
            value={filters.country || '__all__'}
            onValueChange={(value) => updateFilter('country', value === '__all__' ? undefined : value)}
          >
            <SelectTrigger id="country" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Countries</SelectItem>
              {COUNTRIES.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Industry/Sector Filter */}
        <div className="space-y-1">
          <Label htmlFor="industry" className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Industry / Sector
          </Label>
          <Select
            value={filters.industry || '__all__'}
            onValueChange={(value) => updateFilter('industry', value === '__all__' ? undefined : value)}
            disabled={isLoadingIndustries}
          >
            <SelectTrigger id="industry" size="sm" className="w-full">
              <SelectValue placeholder="All Industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Industries</SelectItem>
              {industryOptions.map((industry) => (
                <SelectItem key={industry} value={industry}>
                  {industry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Market Cap Filter */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Market Cap</Label>
          <RadioGroup
            value={filters.cap || 'all'}
            onValueChange={(value) =>
              updateFilter('cap', value as 'large' | 'mid' | 'small' | 'all')
            }
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="cap-all" />
                <Label htmlFor="cap-all" className="text-[11px] font-normal cursor-pointer">
                  All
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="large" id="cap-large" />
                <Label htmlFor="cap-large" className="text-[11px] font-normal cursor-pointer">
                  Large (&gt;$10B)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="mid" id="cap-mid" />
                <Label htmlFor="cap-mid" className="text-[11px] font-normal cursor-pointer">
                  Mid ($2B-$10B)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="small" id="cap-small" />
                <Label htmlFor="cap-small" className="text-[11px] font-normal cursor-pointer">
                  Small ($300M-$2B)
                </Label>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Custom Rules */}
        <CustomRuleBuilder
          rules={filters.customRules || []}
          onAddRule={addCustomRule}
          onUpdateRule={updateCustomRule}
          onRemoveRule={removeCustomRule}
        />

        {/* Rule Logic */}
        {filters.customRules && filters.customRules.length > 1 && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Rule Logic</Label>
            <RadioGroup
              value={filters.ruleLogic || 'AND'}
              onValueChange={(value) =>
                updateFilter('ruleLogic', value as 'AND' | 'OR')
              }
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="AND" id="logic-and" />
                <Label htmlFor="logic-and" className="text-[11px] font-normal cursor-pointer">
                  All rules (AND)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="OR" id="logic-or" />
                <Label htmlFor="logic-or" className="text-[11px] font-normal cursor-pointer">
                  Any rule (OR)
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Stock Count & Run Button */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Matching</span>
            <span className="text-[12px] font-semibold font-mono">{filteredCount}</span>
          </div>
          <div className="flex gap-2">
            <SaveScreenDialog filters={filters} />
            <Button onClick={onRun} className="flex-1" size="sm">
              <Play className="mr-2 h-3.5 w-3.5" />
              Run
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

