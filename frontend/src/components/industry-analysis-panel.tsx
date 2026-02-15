'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CustomRuleBuilder } from '@/components/screener/custom-rule-builder';
import { SaveScreenDialog } from '@/components/screener/save-screen-dialog';
import { useScreenerFilters } from '@/hooks/use-screener-filters';
import { useSavedScreens } from '@/hooks/use-saved-screens';
import type { ScreenerFilters } from '@/lib/saved-screens-api';
import { VALUATION_WEIGHT_PRESETS, type WeightPresetKey } from '@/lib/valuation-weight-presets';
import type { Stock } from '@/types';
import { Input } from '@/components/ui/input';
import { triggerFileDownload } from '@/lib/export-utils';

interface IndustryAnalysisSymbol {
  symbol: string;
  industry: string;
  sector: string;
  passes_filters?: boolean;
  valuation: {
    score: number | null;
    component_count: number;
    components?: {
      pe?: number | null;
      ps?: number | null;
      pb?: number | null;
      ev_ebit?: number | null;
      ev_ebitda?: number | null;
      ev_sales?: number | null;
    };
    raw_values?: Record<string, number | null>;
    weights?: Record<string, number> | null;
    interpretation: string;
  };
}

interface IndustryAnalysisResponse {
  industry: string;
  peer_counts: Record<string, number>;
  industry_stats?: Record<
    string,
    {
      mean: number | null;
      median: number | null;
      p25: number | null;
      p75: number | null;
      min: number | null;
      max: number | null;
    }
  >;
  industry_stats_unfiltered?: Record<
    string,
    {
      mean: number | null;
      median: number | null;
      p25: number | null;
      p75: number | null;
      min: number | null;
      max: number | null;
    }
  >;
  symbols: IndustryAnalysisSymbol[];
  applied_filters?: ScreenerFilters | null;
  note?: string;
}

async function fetchIndustryStocks(industry: string): Promise<Stock[]> {
  const res = await fetch(`/api/industry/${encodeURIComponent(industry)}/stocks`);
  if (!res.ok) {
    throw new Error(`Failed to fetch stocks for industry: ${industry}`);
  }
  const data = await res.json();
  const stocks: Stock[] = [ 
    ...(data.large || []),
    ...(data.mid || []),
    ...(data.small || []),
  ];
  return stocks;
}

async function fetchIndustryAnalysis(
  industry: string,
  symbols: string[],
  weights: Record<string, number> | undefined,
  filters: ScreenerFilters | undefined,
  excludeSymbols: string[] | undefined
): Promise<IndustryAnalysisResponse> {
  const res = await fetch(`/api/industry/${encodeURIComponent(industry)}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols,
      weights: weights && Object.keys(weights).length > 0 ? weights : undefined,
      filters,
      exclude_symbols: excludeSymbols && excludeSymbols.length > 0 ? excludeSymbols : undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Industry analysis failed: ${res.status} ${text}`);
  }

  return (await res.json()) as IndustryAnalysisResponse;
}

interface IndustryAnalysisPanelProps {
  industry: string | undefined;
  capFilter: 'all' | 'large' | 'mid' | 'small';
}

export function IndustryAnalysisPanel({ industry, capFilter }: IndustryAnalysisPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { load } = useSavedScreens();
  const loadedScreenRef = useRef<string | null>(null);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [analysis, setAnalysis] = useState<IndustryAnalysisResponse | null>(null);
  const [isLoadingStocks, setIsLoadingStocks] = useState<boolean>(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [excludedSymbols, setExcludedSymbols] = useState<string[]>([]);
  const [reportTopN, setReportTopN] = useState<number>(10);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const {
    filters,
    replaceFilters,
    updateFilter,
    addCustomRule,
    updateCustomRule,
    removeCustomRule,
    resetFilters,
  } = useScreenerFilters({
    industry,
    cap: capFilter,
  });

  const [appliedFilters, setAppliedFilters] = useState<ScreenerFilters>(filters);
  const filtersRef = useRef<ScreenerFilters>(filters);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);

  type ExpandedPanel = 'filters' | 'weights' | null;
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>('filters');

  const [showIndustryStats, setShowIndustryStats] = useState(true);

  const [selectedPreset, setSelectedPreset] = useState<WeightPresetKey>('equal');
  const [appliedPreset, setAppliedPreset] = useState<WeightPresetKey>('equal');
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(
    VALUATION_WEIGHT_PRESETS.custom.weights
  );

  const handleRowClick = (symbol: string) => {
    router.push(`/stocks/${symbol.toUpperCase()}`);
  };

  const currentWeights = useMemo(() => {
    if (selectedPreset === 'custom') {
      return customWeights;
    }
    return VALUATION_WEIGHT_PRESETS[selectedPreset]?.weights ?? VALUATION_WEIGHT_PRESETS.equal.weights;
  }, [selectedPreset, customWeights]);

  const weightsRef = useRef<Record<string, number>>(currentWeights);
  useEffect(() => {
    weightsRef.current = currentWeights;
  }, [currentWeights]);

  const appliedWeightsRef = useRef<Record<string, number>>(currentWeights);

  useEffect(() => {
    if (industry) {
      updateFilter('industry', industry);
    }
    if (capFilter) {
      updateFilter('cap', capFilter);
    }
    setExcludedSymbols([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry, capFilter]);

  // Keep ref aligned with applied filters
  useEffect(() => {
    filtersRef.current = appliedFilters;
  }, [appliedFilters]);

  useEffect(() => {
    if (!industry) return;
    setIsLoadingDefaults(true);
    const controller = new AbortController();
    fetch(`/api/industry/${encodeURIComponent(industry)}/filters`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data || !data.filters) return;
        const nextFilters = { ...(data.filters as ScreenerFilters), industry };
        replaceFilters(nextFilters);
        setAppliedFilters(nextFilters);
        filtersRef.current = nextFilters;
        setRefreshVersion((v) => v + 1);
      })
      .catch(() => {
        /* ignore load errors */
      })
      .finally(() => setIsLoadingDefaults(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

  useEffect(() => {
    if (!industry) return;
    const screenId = searchParams.get('screen');
    if (!screenId || loadedScreenRef.current === screenId) return;
    loadedScreenRef.current = screenId;

    load(screenId)
      .then((loadedFilters) => {
        if (!loadedFilters) return;
        const nextFilters = { ...loadedFilters, industry };
        replaceFilters(nextFilters);
        setAppliedFilters(nextFilters);
        filtersRef.current = nextFilters;
        setRefreshVersion((v) => v + 1);
      })
      .catch(() => {
        /* ignore load errors */
      });
  }, [industry, load, replaceFilters, searchParams]);

  // Keep preset in URL for shareability (only when industry is present)
  useEffect(() => {
    if (typeof window === 'undefined' || !industry) {
      return;
    }
    const currentParams = new URLSearchParams(window.location.search);
    const urlPreset = currentParams.get('preset');
    if (urlPreset === selectedPreset) {
      return;
    }
    currentParams.set('preset', selectedPreset);
    router.replace(`?${currentParams.toString()}`, { scroll: false });
  }, [selectedPreset, router, industry]);

  // Initialize preset from URL on first render
  useEffect(() => {
    const presetFromUrl = searchParams?.get('preset') as WeightPresetKey | null;
    if (presetFromUrl && VALUATION_WEIGHT_PRESETS[presetFromUrl]) {
      setSelectedPreset(presetFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load stocks when industry or cap filter changes
  useEffect(() => {
    if (!industry) {
      setStocks([]);
      setAnalysis(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingStocks(true);
    setError(null);

    fetchIndustryStocks(industry)
      .then((data) => {
        if (cancelled) return;
        let filtered: Stock[] = data;
        if (capFilter === 'large') {
          filtered = data.filter((s) => s.marketCap >= 10_000_000_000);
        } else if (capFilter === 'mid') {
          filtered = data.filter((s) => s.marketCap >= 2_000_000_000 && s.marketCap < 10_000_000_000);
        } else if (capFilter === 'small') {
          filtered = data.filter((s) => s.marketCap >= 300_000_000 && s.marketCap < 2_000_000_000);
        }
        setStocks(filtered);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stocks');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingStocks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [industry, capFilter]);

  // Fetch analysis whenever stocks or weights change
  const [refreshVersion, setRefreshVersion] = useState<number>(0);

  useEffect(() => {
    if (!industry || isLoadingStocks || stocks.length === 0) {
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setIsLoadingAnalysis(true);
    setError(null);

    const symbols = stocks.map((s) => s.symbol);

    fetchIndustryAnalysis(industry, symbols, weightsRef.current, filtersRef.current, excludedSymbols)
      .then((resp) => {
        if (!cancelled) {
          setAnalysis(resp);
          setCurrentPage(1);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analysis');
          setAnalysis(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAnalysis(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Only rerun when industry/stocks change or user explicitly refreshes
  }, [industry, stocks, isLoadingStocks, refreshVersion, excludedSymbols]);

  const isLoading = isLoadingStocks || isLoadingAnalysis;
  const PAGE_SIZE = 14;

  const paginatedSymbols = useMemo(() => {
    if (!analysis) return [];
    const start = (currentPage - 1) * PAGE_SIZE;
    return analysis.symbols.slice(start, start + PAGE_SIZE);
  }, [analysis, currentPage]);

  const totalPages = analysis ? Math.ceil(analysis.symbols.length / PAGE_SIZE) : 0;
  const activeRuleCount = useMemo(() => {
    const custom = (appliedFilters.customRules || []).filter((r) => r.enabled).length;
    const capActive = appliedFilters.cap && appliedFilters.cap !== 'all' ? 1 : 0;
    return custom + capActive;
  }, [appliedFilters]);

  const handlePresetClick = (preset: WeightPresetKey) => {
    if (isLoading) return;
    setSelectedPreset(preset);
  };

  const handleCustomWeightChange = (key: string, value: number) => {
    setCustomWeights((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyWeights = () => {
    if (!industry) return;
    setRefreshVersion((v) => v + 1);
    setAppliedPreset(selectedPreset);
    appliedWeightsRef.current = weightsRef.current;
  };

  const handleBacktestWeights = () => {
    if (!industry) return;
    const params = new URLSearchParams();
    params.set('sector', industry);
    // Use the currently selected preset/weights so the Backtest page reflects what the user sees,
    // even if they haven't clicked "Apply Weights" yet.
    params.set('preset', selectedPreset);
    // Only pass explicit weights when preset is custom; otherwise Backtest UI will default to "custom"
    // because it sees a weights param.
    if (selectedPreset === 'custom') {
      params.set('weights', JSON.stringify(weightsRef.current));
    }
    // Use the currently applied filters (explicit "Apply Filters" action) to keep this deterministic.
    params.set('filters', JSON.stringify(appliedFilters));
    params.set('auto', '1');
    router.push(`/backtest?${params.toString()}`);
  };

  const handleApplyFilters = () => {
    if (!industry) return;
    setAppliedFilters(filters);
    filtersRef.current = filters;
    setRefreshVersion((v) => v + 1);
  };

  const handleExcludeSymbol = (symbol: string) => {
    setExcludedSymbols((prev) => {
      if (prev.includes(symbol)) return prev;
      return [...prev, symbol];
    });
  };

  const handleGenerateReport = async () => {
    if (!industry || !analysis) return;
    const eligible = analysis.symbols.filter((row) => row.passes_filters);
    const totalEligible = eligible.length;
    const rankMap: Record<string, { rank: number; total: number }> = {};
    eligible.forEach((row, idx) => {
      rankMap[row.symbol] = { rank: idx + 1, total: totalEligible };
    });
    const selected = eligible.slice(0, Math.max(1, reportTopN));
    if (selected.length === 0) {
      setReportError('No passing symbols to include in the report.');
      return;
    }

    setReportError(null);
    setIsGeneratingReport(true);

    try {
      const res = await fetch(
        `/api/industry/${encodeURIComponent(industry)}/reports/pdf`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: selected.map((row) => row.symbol),
            limit: reportTopN,
            title: `Industry Report: ${industry}`,
            rankings: rankMap,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Report generation failed (${res.status})`);
      }

      const blob = await res.blob();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `industry_report_${industry.replace(/\s+/g, '_')}_${dateStr}.pdf`;
      triggerFileDownload(blob, filename);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSaveDefaultFilters = async () => {
    if (!industry) return;
    setIsSavingDefault(true);
    setError(null);
    try {
      const res = await fetch(`/api/industry/${encodeURIComponent(industry)}/filters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(detail);
      }
    } catch (err) {
      setError(
        err instanceof Error ? `Failed to save default filters: ${err.message}` : 'Failed to save default filters'
      );
    } finally {
      setIsSavingDefault(false);
    }
  };

  if (!industry) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Industry Valuation Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set an Industry / Sector filter in the screener to view detailed valuation analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="dense" className="mt-2">
      <CardContent className="space-y-3 pt-3">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading && !analysis ? (
          <div className="space-y-3 min-w-0">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !analysis ? (
          <p className="text-[11px] text-muted-foreground">
            No analysis available yet. Adjust your filters and run the screener.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-3">
            {/* Left Column: Filters & Controls */}
            <div className="space-y-3 lg:sticky lg:top-[52px] lg:self-start lg:max-h-[calc(100vh-60px)] lg:overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-background">
              <Card variant="dense">
              <CardHeader className="border-b border-border pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[13px] tracking-widest uppercase">Filters</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedPanel(expandedPanel === 'filters' ? null : 'filters')}>
                    {expandedPanel === 'filters' ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </CardHeader>
              {expandedPanel === 'filters' && (
                <CardContent className="space-y-3">
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[12px] font-semibold">Market Cap</Label>
                      <span className="text-[11px] text-muted-foreground">
                        {isLoadingDefaults ? 'Loading defaults…' : `${activeRuleCount} active`}
                      </span>
                    </div>
                    <RadioGroup
                      value={filters.cap || 'all'}
                      onValueChange={(value) =>
                        updateFilter('cap', value as 'large' | 'mid' | 'small' | 'all')
                      }
                      className="space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="cap-all-analysis" />
                        <Label htmlFor="cap-all-analysis" className="font-normal cursor-pointer">
                          All
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="large" id="cap-large-analysis" />
                        <Label htmlFor="cap-large-analysis" className="font-normal cursor-pointer">
                          Large (&gt;$10B)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mid" id="cap-mid-analysis" />
                        <Label htmlFor="cap-mid-analysis" className="font-normal cursor-pointer">
                          Mid ($2B-$10B)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="small" id="cap-small-analysis" />
                        <Label htmlFor="cap-small-analysis" className="font-normal cursor-pointer">
                          Small ($300M-$2B)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="rounded-md border p-2">
                    <CustomRuleBuilder
                      rules={filters.customRules || []}
                      onAddRule={addCustomRule}
                      onUpdateRule={updateCustomRule}
                      onRemoveRule={removeCustomRule}
                    />
                  </div>

                  {/* Action buttons at the bottom */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetFilters}
                      disabled={isLoading}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSaveDefaultFilters}
                      disabled={isLoading || isSavingDefault}
                    >
                      {isSavingDefault ? 'Saving…' : 'Save Default'}
                    </Button>
                    <SaveScreenDialog filters={appliedFilters} />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleApplyFilters}
                      disabled={isLoading || !industry}
                      className="ml-auto"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card variant="dense">
              <CardHeader className="border-b border-border pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-[13px] tracking-widest uppercase">Weights</CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      Active: {VALUATION_WEIGHT_PRESETS[appliedPreset]?.label || appliedPreset}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedPanel(expandedPanel === 'weights' ? null : 'weights')}>
                    {expandedPanel === 'weights' ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </CardHeader>

              {expandedPanel === 'weights' && (
                <CardContent className="space-y-3">
                  {/* Preset buttons in a compact grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(VALUATION_WEIGHT_PRESETS) as WeightPresetKey[]).map((key) => {
                      const preset = VALUATION_WEIGHT_PRESETS[key];
                      return (
                        <Button
                          key={key}
                          type="button"
                          variant={selectedPreset === key ? 'default' : 'outline'}
                          size="sm"
                          className="h-auto py-1.5 px-2 flex flex-col items-start"
                          onClick={() => handlePresetClick(key)}
                          disabled={isLoading}
                        >
                          <span className="text-[12px] font-medium">{preset.label}</span>
                          <span className="text-[11px] text-muted-foreground text-wrap text-left">{preset.description}</span>
                          {appliedPreset === key && (
                            <span className="text-[9px] uppercase text-primary mt-0.5">Active</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Custom weights editor */}
                  {selectedPreset === 'custom' && (
                    <div className="space-y-2 p-2 border rounded-md bg-muted/20">
                      <div className="text-[11px] text-muted-foreground">
                        Total:{' '}
                        {Object.values(customWeights)
                          .reduce((sum, w) => sum + w, 0)
                          .toFixed(0)}
                        %
                      </div>
                      {Object.keys(customWeights).map((key) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-16 text-right text-[11px] uppercase">{key}</span>
                          <input
                            id={`weight-${key}`}
                            type="number"
                            min={0}
                            max={100}
                            value={customWeights[key]}
                            onChange={(e) =>
                              handleCustomWeightChange(key, parseInt(e.target.value, 10) || 0)
                            }
                            className="flex-1 h-7 text-[12px] rounded border border-input bg-background px-2 py-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Apply button at the bottom */}
                  <div className="pt-2 border-t border-border">
                    <Button
                      onClick={handleApplyWeights}
                      disabled={isLoading || !industry}
                      className="w-full"
                      size="sm"
                      variant={selectedPreset === appliedPreset ? 'secondary' : 'default'}
                    >
                      Apply Weights
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* Right Column: Data & Results */}
          <div className="space-y-4">
            {/* Industry averages - collapsible */}
            <Card variant="dense">
              <CardHeader className="flex flex-row items-center justify-between space-y-4 border-b border-border pb-1">
                <CardTitle className="text-[13px] tracking-widest uppercase">Industry Stats</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowIndustryStats((v) => !v)}>
                  {showIndustryStats ? 'Hide' : 'Show'}
                </Button>
              </CardHeader>
              {showIndustryStats && (
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {analysis.industry_stats &&
                      Object.entries(analysis.industry_stats).map(([key, stats]) => {
                        const filteredMean = stats?.mean;
                        const filteredMedian = stats?.median;
                        const unfilteredMean = analysis.industry_stats_unfiltered?.[key]?.mean;
                        const unfilteredMedian = analysis.industry_stats_unfiltered?.[key]?.median;
                        if (filteredMean == null && unfilteredMean == null) return null;
                        return (
                          <div
                            key={key}
                            className="flex flex-col gap-2 rounded-md border border-border/60 bg-gradient-to-br from-muted/30 via-muted/10 to-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          >
                            <div className="flex items-center justify-between">
                              <span className="uppercase text-[11px] tracking-widest text-muted-foreground">{key}</span>
                              <span className="text-[10px] text-muted-foreground">avg / med</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="rounded-sm border border-border/50 bg-background/40 px-2 py-1.5">
                                <div className="text-[10px] uppercase text-muted-foreground">Filtered</div>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Avg</div>
                                    <div className="font-mono tabular-nums text-[13px] font-semibold">
                                      {filteredMean != null ? filteredMean.toFixed(2) : '-'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Med</div>
                                    <div className="font-mono tabular-nums text-[12px]">
                                      {filteredMedian != null ? filteredMedian.toFixed(2) : '-'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-sm border border-border/50 bg-background/40 px-2 py-1.5">
                                <div className="text-[10px] uppercase text-muted-foreground">All</div>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Avg</div>
                                    <div className="font-mono tabular-nums text-[13px] font-semibold">
                                      {unfilteredMean != null ? unfilteredMean.toFixed(2) : '-'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Med</div>
                                    <div className="font-mono tabular-nums text-[12px]">
                                      {unfilteredMedian != null ? unfilteredMedian.toFixed(2) : '-'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Results table */}
            <Card variant="dense">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border pb-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[13px] tracking-widest uppercase">Ranked</CardTitle>
                  <span className="text-[11px] text-muted-foreground">{analysis.symbols.length} stocks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="report-top-n" className="text-[11px] text-muted-foreground">
                    Top N
                  </Label>
                  <Input
                    id="report-top-n"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={reportTopN}
                    onChange={(e) => setReportTopN(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="h-7 w-16 text-[11px] font-mono"
                    disabled={isLoading || isGeneratingReport}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateReport}
                    disabled={isLoading || isGeneratingReport}
                  >
                    {isGeneratingReport ? 'Generating.' : 'PDF Report'}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {reportError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {reportError}
                  </div>
                ) : null}
                <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-md border custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Valuation Score</TableHead>
                        <TableHead>P/E</TableHead>
                        <TableHead>P/S</TableHead>
                        <TableHead>P/B</TableHead>
                        <TableHead>EV/EBIT</TableHead>
                        <TableHead>EV/EBITDA</TableHead>
                        <TableHead>EV/Sales</TableHead>
                        <TableHead className="text-right">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSymbols.map((row) => {
                        const raw = row.valuation.raw_values || {};
                        const passesFilters = row.passes_filters;
                        return (
                          <TableRow
                            key={row.symbol}
                            className={
                              passesFilters
                                ? 'cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20'
                                : 'cursor-pointer bg-rose-500/10 hover:bg-rose-500/20'
                            }
                            onClick={() => handleRowClick(row.symbol)}
                          >
                            <TableCell className="font-mono">{row.symbol}</TableCell>
                            <TableCell>{row.sector}</TableCell>
                            <TableCell className="font-mono">
                              {row.valuation.score != null ? row.valuation.score.toFixed(1) : '-'}
                            </TableCell>
                            <TableCell className="font-mono">{raw.pe != null ? raw.pe.toFixed(2) : '-'}</TableCell>
                            <TableCell className="font-mono">{raw.ps != null ? raw.ps.toFixed(2) : '-'}</TableCell>
                            <TableCell className="font-mono">{raw.pb != null ? raw.pb.toFixed(2) : '-'}</TableCell>
                            <TableCell className="font-mono">
                              {raw.ev_ebit != null ? raw.ev_ebit.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="font-mono">
                              {raw.ev_ebitda != null ? raw.ev_ebitda.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="font-mono">
                              {raw.ev_sales != null ? raw.ev_sales.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleExcludeSymbol(row.symbol);
                                }}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Backtest card */}
            <Card variant="dense">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border pb-1">
                <div>
                  <CardTitle className="text-[13px] tracking-widest uppercase">Backtest</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Tests the currently applied filters + applied weight preset for this sector over time.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBacktestWeights}
                  disabled={isLoading || !industry}
                >
                  Backtest Current Setup
                </Button>
              </CardHeader>
            </Card>
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}