'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { BacktestRulesFilters } from '@/lib/backtest-rules-types';

interface RulesFilterPanelProps {
  filters: BacktestRulesFilters;
  onFiltersChange: (filters: Partial<BacktestRulesFilters>) => void;
  sectors: string[];
  holdingYearsOptions: number[];
  isLoading?: boolean;
}

export function RulesFilterPanel({
  filters,
  onFiltersChange,
  sectors,
  holdingYearsOptions,
  isLoading,
}: RulesFilterPanelProps) {
  return (
    <Card className="h-fit" variant="dense">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-[11px] tracking-widest uppercase">Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Holding Period Filter */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Holding Period
          </Label>
          <RadioGroup
            value={filters.holdingYears?.toString() || 'all'}
            onValueChange={(value) =>
              onFiltersChange({
                holdingYears: value === 'all' ? undefined : parseInt(value),
              })
            }
            disabled={isLoading}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="hold-all" />
                <Label htmlFor="hold-all" className="text-[11px] font-normal cursor-pointer">
                  All
                </Label>
              </div>
              {holdingYearsOptions.map((years) => (
                <div key={years} className="flex items-center gap-2">
                  <RadioGroupItem value={years.toString()} id={`hold-${years}`} />
                  <Label
                    htmlFor={`hold-${years}`}
                    className="text-[11px] font-normal cursor-pointer"
                  >
                    {years} Year{years > 1 ? 's' : ''}
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        </div>

        {/* Sector Filter */}
        <div className="space-y-2">
          <Label
            htmlFor="sector"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            Sector
          </Label>
          <Select
            value={filters.sector || '__all__'}
            onValueChange={(value) =>
              onFiltersChange({ sector: value === '__all__' ? undefined : value })
            }
            disabled={isLoading}
          >
            <SelectTrigger id="sector" size="sm" className="w-full">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sectors</SelectItem>
              {sectors.map((sector) => (
                <SelectItem key={sector} value={sector}>
                  {sector}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Market Cap Filter */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Market Cap
          </Label>
          <RadioGroup
            value={filters.cap || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ cap: value as 'large' | 'mid' | 'small' | 'all' })
            }
            disabled={isLoading}
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
      </CardContent>
    </Card>
  );
}
