'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AppLayout } from '@/components/layout/app-layout';
import { IndustrySelector } from '@/components/industry-selector';
import { BacktestRulesBrowser } from '@/components/backtest-rules';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { VALUATION_WEIGHT_PRESETS, type WeightPresetKey } from '@/lib/valuation-weight-presets';

type BacktestResponse = {
  sector: string;
  benchmark: string;
  request_id?: string;
  server_timing_ms?: Record<string, number>;
  applied_filters?: unknown;
  summary?: {
    points?: number;
    points_with_returns?: number;
    win_rate?: number | null;
    avg_portfolio_return?: number | null;
    avg_benchmark_return?: number | null;
    avg_industry_return?: number | null;
    avg_industry_return_raw?: number | null;
  };
  data?: Array<{
    as_of: string;
    end_date: string;
    universe_size?: number;
    filtered_by_filters_size?: number;
    filtered_size?: number;
    portfolio_total_return?: number | null;
    benchmark_total_return?: number | null;
    industry_avg_return?: number | null;
    industry_avg_return_raw?: number | null;
    industry_avg_return_filtered?: number | null;
    unsupported_filter_metrics?: string[];
    selected?: Array<{
      symbol: string;
      valuation_score?: number | null;
      ratios?: {
        pe?: number | null;
        ps?: number | null;
        pb?: number | null;
        ev_ebit?: number | null;
        ev_ebitda?: number | null;
        ev_sales?: number | null;
      };
      total_return?: number | null;
      dividends?: number | null;
      split_factor?: number | null;
    }>;
  }>;
  note?: string;
};

type ImportedFilters = {
  country?: string;
  industry?: string;
  cap?: 'large' | 'mid' | 'small' | 'all';
  customRules?: Array<{
    id?: string;
    metric: string;
    operator: string;
    value: number | [number, number];
    enabled?: boolean;
  }>;
  ruleLogic?: 'AND' | 'OR';
};

const SMALL_UNIVERSE_THRESHOLD = 10;

function clampInt(value: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  return Math.min(max, Math.max(min, rounded));
}

function pct(v: number | null | undefined, digits: number = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function num(v: number | null | undefined, digits: number = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString();
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatRuleValue(v: number | [number, number]): string {
  if (Array.isArray(v)) return `${v[0]} to ${v[1]}`;
  return String(v);
}

function tryParseImportedFilters(value: unknown): ImportedFilters | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: ImportedFilters = {};
  if (typeof v.country === 'string') out.country = v.country;
  if (typeof v.industry === 'string') out.industry = v.industry;
  if (typeof v.cap === 'string') out.cap = v.cap as ImportedFilters['cap'];
  if (typeof v.ruleLogic === 'string') out.ruleLogic = v.ruleLogic as ImportedFilters['ruleLogic'];
  if (Array.isArray(v.customRules)) {
    out.customRules = v.customRules
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        id: typeof r.id === 'string' ? r.id : undefined,
        metric: String(r.metric ?? ''),
        operator: String(r.operator ?? ''),
        value: r.value as number | [number, number],
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      }))
      .filter((r) => r.metric.length > 0 && r.operator.length > 0);
  }
  return out;
}

function BacktestPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Tab state from URL
  const activeTab = searchParams.get('tab') || 'live';
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'live') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [sector, setSector] = useState<string>('Technology');
  const [years, setYears] = useState<number>(10);
  const [holdingYears, setHoldingYears] = useState<number>(1);
  const [topN, setTopN] = useState<number>(10);
  const [lagDays, setLagDays] = useState<number>(90);
  const [pePositive, setPePositive] = useState<boolean>(true);
  const [peBelowMean, setPeBelowMean] = useState<boolean>(true);
  const [preset, setPreset] = useState<WeightPresetKey>('equal');
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(VALUATION_WEIGHT_PRESETS.custom.weights);
  const [filtersJson, setFiltersJson] = useState<string | null>(null);
  const [filtersObj, setFiltersObj] = useState<unknown>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [clientMs, setClientMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'picks' | 'filters' | 'warnings' | 'timing' | 'raw'>('picks');
  const didInitFromQuery = useRef(false);
  const didAutoRun = useRef(false);
  const [industryAvgMode, setIndustryAvgMode] = useState<'filtered' | 'raw'>('filtered');

  const currentWeights = useMemo(() => {
    if (preset === 'custom') return customWeights;
    return VALUATION_WEIGHT_PRESETS[preset]?.weights ?? VALUATION_WEIGHT_PRESETS.equal.weights;
  }, [preset, customWeights]);

  useEffect(() => {
    if (didInitFromQuery.current) return;
    didInitFromQuery.current = true;

    const qpSector = searchParams.get('sector');
    const qpYears = searchParams.get('years');
    const qpHoldingYears = searchParams.get('holdingYears');
    const qpTopN = searchParams.get('topN');
    const qpLagDays = searchParams.get('lagDays');
    const qpPreset = searchParams.get('preset') as WeightPresetKey | null;
    const qpWeights = searchParams.get('weights');
    const qpFilters = searchParams.get('filters');
    const qpAuto = searchParams.get('auto');

    const hasValidPreset = !!(qpPreset && VALUATION_WEIGHT_PRESETS[qpPreset]);
    if (qpSector) setSector(qpSector);
    if (qpYears) setYears(clampInt(qpYears, 10, { min: 1, max: 30 }));
    if (qpHoldingYears) setHoldingYears(clampInt(qpHoldingYears, 1, { min: 1, max: 3 }));
    if (qpTopN) setTopN(clampInt(qpTopN, 10, { min: 1, max: 100 }));
    if (qpLagDays) setLagDays(clampInt(qpLagDays, 90, { min: 0, max: 365 }));
    if (hasValidPreset) setPreset(qpPreset!);

    if (qpWeights && (!hasValidPreset || qpPreset === 'custom')) {
      try {
        const parsed = JSON.parse(qpWeights) as Record<string, unknown>;
        const cleaned: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const n = typeof v === 'number' ? v : Number(v);
          if (Number.isFinite(n)) cleaned[k] = n;
        }
        if (Object.keys(cleaned).length > 0) {
          setPreset('custom');
          setCustomWeights(cleaned);
        }
      } catch {
        // ignore
      }
    }

    if (qpFilters) {
      setFiltersJson(qpFilters);
      try {
        setFiltersObj(JSON.parse(qpFilters));
      } catch {
        setFiltersObj(qpFilters);
      }
    }

    if (qpAuto === '1' && qpFilters) {
      setPePositive(false);
      setPeBelowMean(false);
    }

    if (qpAuto === '1' && !didAutoRun.current) {
      didAutoRun.current = true;
      setTimeout(() => run(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = useMemo(() => sector.trim().length > 0 && years >= 1 && holdingYears >= 1 && topN >= 1, [sector, years, holdingYears, topN]);
  const importedFilters = useMemo(() => tryParseImportedFilters(filtersObj), [filtersObj]);

  const returnPoints = useMemo(() => {
    return (result?.data || [])
      .map((d) => ({
        as_of: d.as_of,
        ptf: toFiniteNumber(d.portfolio_total_return),
        spy: toFiniteNumber(d.benchmark_total_return),
        industry: toFiniteNumber(
          industryAvgMode === 'raw'
            ? d.industry_avg_return_raw ?? d.industry_avg_return
            : d.industry_avg_return_filtered ?? d.industry_avg_return
        ),
      }))
      .filter((d) => d.ptf != null && d.spy != null);
  }, [result, industryAvgMode]);

  const equityCurve = useMemo(() => {
    let portfolio = 1;
    let benchmark = 1;
    let industry = 1;
    return returnPoints.map((p) => {
      portfolio *= 1 + (p.ptf ?? 0);
      benchmark *= 1 + (p.spy ?? 0);
      industry *= 1 + (p.industry ?? 0);
      return { as_of: p.as_of, portfolio, benchmark, industry };
    });
  }, [returnPoints]);

  const selectedPoint = useMemo(() => {
    if (!selectedKey) return null;
    return (result?.data || []).find((r) => `${r.as_of}-${r.end_date}` === selectedKey) ?? null;
  }, [result, selectedKey]);

  const warningsAll = useMemo(() => {
    const set = new Set<string>();
    for (const p of result?.data || []) {
      for (const m of p.unsupported_filter_metrics || []) set.add(m);
    }
    return Array.from(set).sort();
  }, [result]);

  const smallUniversePoints = useMemo(() => {
    return (result?.data || []).filter(
      (p) => (p.filtered_size ?? 0) > 0 && (p.filtered_size ?? 0) < SMALL_UNIVERSE_THRESHOLD
    );
  }, [result]);

  useEffect(() => {
    if (!isLoading) return;
    const startedAt = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [isLoading]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        abortRef.current?.abort();
        return;
      }
      if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        if (canRun && !isLoading) {
          e.preventDefault();
          void run();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRun, isLoading]);

  async function run() {
    if (!canRun) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSelectedKey(null);
    setInspectorTab('picks');
    setClientMs(null);

    try {
      const startedAt = performance.now();
      const res = await fetch('/api/backtest/sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          sector,
          years,
          holding_years: holdingYears,
          top_n: topN,
          benchmark: 'SPY',
          fundamentals_lag_days: lagDays,
          weights: currentWeights,
          filters: filtersObj || undefined,
          rules: {
            pe_positive: pePositive,
            pe_below_universe_mean: peBelowMean,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Backtest failed (${res.status})`);
      }

      const data = (await res.json()) as BacktestResponse;
      setClientMs(performance.now() - startedAt);
      setResult(data);

      const firstWithPicks = (data.data || []).find((r) => (r.selected || []).length > 0);
      if (firstWithPicks) setSelectedKey(`${firstWithPicks.as_of}-${firstWithPicks.end_date}`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Request aborted');
      } else {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  function clear() {
    abortRef.current?.abort();
    setError(null);
    setResult(null);
    setSelectedKey(null);
    setInspectorTab('picks');
    setClientMs(null);
  }

  return (
    <AppLayout>
      <div className="w-full px-4 py-4">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">BACKTEST</h1>
            <div className="text-xs text-muted-foreground">
              {activeTab === 'live'
                ? <>Sector rotation via annual fundamentals (lagged). <span className="font-mono">Enter</span>=run, <span className="font-mono">Esc</span>=abort</>
                : 'Browse precomputed backtest rule results across sectors and holding periods.'}
            </div>
          </div>
          {activeTab === 'live' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded border px-2 py-1 font-mono">SPY</span>
              <span className="rounded border px-2 py-1 font-mono">T+{lagDays}d</span>
              {isLoading ? <span className="rounded border px-2 py-1 font-mono">RUN {elapsedSec}s</span> : null}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="live">Live Backtest</TabsTrigger>
            <TabsTrigger value="rules">Rule Search</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-0">
            <BacktestRulesBrowser />
          </TabsContent>

          <TabsContent value="live" className="mt-0">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Card className="lg:col-span-3">
            <CardHeader className="py-3">
              <CardTitle className="text-sm tracking-wide">RUN TICKET</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label className="text-xs">Sector</Label>
                <IndustrySelector selectedIndustry={sector} onSelectIndustry={setSector} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Years</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={years}
                    onChange={(e) => setYears(clampInt(e.target.value, years, { min: 1, max: 30 }))}
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hold</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3}
                    value={holdingYears}
                    onChange={(e) => setHoldingYears(clampInt(e.target.value, holdingYears, { min: 1, max: 3 }))}
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Top N</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={topN}
                    onChange={(e) => setTopN(clampInt(e.target.value, topN, { min: 1, max: 100 }))}
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Lag (d)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={365}
                    value={lagDays}
                    onChange={(e) => setLagDays(clampInt(e.target.value, lagDays, { min: 0, max: 365 }))}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Weights</Label>
                  <span className="text-[11px] text-muted-foreground font-mono">{preset.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(VALUATION_WEIGHT_PRESETS) as WeightPresetKey[]).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={preset === k ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPreset(k)}
                      disabled={isLoading}
                      className={cn('h-8 justify-start px-2 text-xs', preset === k ? 'shadow-none' : '')}
                    >
                      {VALUATION_WEIGHT_PRESETS[k].label}
                    </Button>
                  ))}
                </div>

                {preset === 'custom' ? (
                  <ScrollArea className="h-44 rounded-md border bg-muted/20">
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {Object.keys(customWeights).map((k) => (
                        <label key={k} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-2">
                          <span className="text-[11px] uppercase text-muted-foreground">{k}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            value={customWeights[k]}
                            onChange={(e) =>
                              setCustomWeights((prev) => ({
                                ...prev,
                                [k]: clampInt(e.target.value, prev[k] ?? 0, { min: 0, max: 100 }),
                              }))
                            }
                            className="h-7 w-20 rounded border border-input bg-background px-2 py-1 text-right font-mono text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                ) : null}
              </div>

              <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Extra rules</div>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono">PE &gt; 0</span>
                  <input type="checkbox" checked={pePositive} onChange={(e) => setPePositive(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono">PE &lt; mean</span>
                  <input type="checkbox" checked={peBelowMean} onChange={(e) => setPeBelowMean(e.target.checked)} />
                </label>
              </div>

              {importedFilters ? (
                <div className="rounded-md border bg-muted/10 p-2 text-[11px] text-muted-foreground">
                  Imported filters: <span className="font-mono">rules={(importedFilters.customRules || []).filter((r) => r.enabled !== false).length}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <Button onClick={run} disabled={!canRun || isLoading} className="col-span-2 h-9">
                  Run
                </Button>
                <Button type="button" onClick={abort} disabled={!isLoading} variant="outline" className="h-9">
                  Abort
                </Button>
                <Button type="button" onClick={clear} disabled={isLoading} variant="ghost" className="col-span-3 h-9 justify-start px-2 text-xs text-muted-foreground">
                  Clear result
                </Button>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader className="py-3">
              <CardTitle className="text-sm tracking-wide">PERFORMANCE</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {!result && isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-56 w-full" />
                  <Skeleton className="h-56 w-full" />
                </div>
              ) : null}
              {!result && !isLoading ? (
                <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Load a sector and run the backtest. Blotter rows populate the inspector.
                </div>
              ) : null}
              {result ? (
                <>
                  {result.note ? (
                    <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                      {result.note}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">Win rate</div>
                      <div className="font-mono text-sm">{pct(result.summary?.win_rate ?? null)}</div>
                    </div>
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">Avg PTF</div>
                      <div className="font-mono text-sm">{pct(result.summary?.avg_portfolio_return ?? null)}</div>
                    </div>
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">Avg SPY</div>
                      <div className="font-mono text-sm">{pct(result.summary?.avg_benchmark_return ?? null)}</div>
                    </div>
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">
                        Avg Industry ({industryAvgMode})
                      </div>
                      <div className="font-mono text-sm">
                        {pct(
                          industryAvgMode === 'raw'
                            ? result.summary?.avg_industry_return_raw ?? result.summary?.avg_industry_return
                            : result.summary?.avg_industry_return ?? null
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/10 p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">Points</div>
                      <div className="font-mono text-sm">{fmtInt(result.summary?.points_with_returns ?? 0)}</div>
                    </div>
                  </div>
                  {smallUniversePoints.length > 0 ? (
                    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700">
                      Warning: {smallUniversePoints.length} points have filtered universe &lt; {SMALL_UNIVERSE_THRESHOLD}. Rankings may be noisy.
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-muted/5 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Equity curve</div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>
                          {result.sector} vs {result.benchmark}
                        </span>
                        <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-[11px]">
                          <button
                            type="button"
                            className={`px-2 py-0.5 rounded-sm ${
                              industryAvgMode === 'filtered'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                            onClick={() => setIndustryAvgMode('filtered')}
                          >
                            Filtered
                          </button>
                          <button
                            type="button"
                            className={`px-2 py-0.5 rounded-sm ${
                              industryAvgMode === 'raw'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                            onClick={() => setIndustryAvgMode('raw')}
                          >
                            Raw
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="h-56 w-full">
                      {equityCurve.length === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-md border bg-muted/10 px-3 text-xs text-muted-foreground">
                          No points with returns (points={fmtInt(result.summary?.points ?? (result.data || []).length)}{' '}
                          points_with_returns={fmtInt(result.summary?.points_with_returns ?? 0)}). Check `note`/filters or reduce `years`.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={equityCurve}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="as_of" tick={{ fontSize: 10 }} minTickGap={18} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) || 0).toFixed(2)}x`} width={44} />
                            <Tooltip
                              formatter={(value: number) => `${(Number(value) || 0).toFixed(3)}x`}
                              labelFormatter={(label) => `as_of=${label}`}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#22c55e" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                            <Line
                              type="monotone"
                              dataKey="industry"
                              name={`Industry (${industryAvgMode})`}
                              stroke="#f59e0b"
                              strokeWidth={1.5}
                              dot={false}
                              strokeDasharray="5 5"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Blotter</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        rows={fmtInt((result.data || []).length)} selected={selectedKey ? '1' : '0'}
                      </div>
                    </div>
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="sticky top-0 bg-background">
                            <TableHead className="text-[11px]">As of</TableHead>
                            <TableHead className="text-[11px]">End</TableHead>
                            <TableHead className="text-[11px] text-right">PTF</TableHead>
                            <TableHead className="text-[11px] text-right">SPY</TableHead>
                            <TableHead className="text-[11px] text-right">Industry ({industryAvgMode})</TableHead>
                            <TableHead className="text-[11px] text-right">Δ</TableHead>
                            <TableHead className="text-[11px] text-right">U</TableHead>
                            <TableHead className="text-[11px] text-right">F</TableHead>
                            <TableHead className="text-[11px] text-right">Picks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(result.data || []).map((row) => {
                            const key = `${row.as_of}-${row.end_date}`;
                            const isSelected = selectedKey === key;
                            const ptf = row.portfolio_total_return ?? null;
                            const spy = row.benchmark_total_return ?? null;
                            const industry =
                              industryAvgMode === 'raw'
                                ? row.industry_avg_return_raw ?? row.industry_avg_return
                                : row.industry_avg_return_filtered ?? row.industry_avg_return;
                            const spread = ptf != null && spy != null ? ptf - spy : null;
                            const picksCount = (row.selected || []).length;
                            const filteredSize = row.filtered_size ?? null;
                            const isSmallFiltered = (filteredSize ?? 0) > 0 && (filteredSize ?? 0) < SMALL_UNIVERSE_THRESHOLD;
                            return (
                              <TableRow
                                key={key}
                                className={cn('cursor-pointer', isSelected ? 'bg-muted/30' : '')}
                                onClick={() => {
                                  setSelectedKey(key);
                                  setInspectorTab(picksCount > 0 ? 'picks' : 'warnings');
                                }}
                              >
                                <TableCell className="font-mono text-xs">
                                  {row.as_of}
                                  {row.unsupported_filter_metrics && row.unsupported_filter_metrics.length > 0 ? (
                                    <span className="ml-2 text-muted-foreground">*</span>
                                  ) : null}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{row.end_date}</TableCell>
                                <TableCell className="font-mono text-xs text-right">{pct(ptf, 1)}</TableCell>
                                <TableCell className="font-mono text-xs text-right">{pct(spy, 1)}</TableCell>
                                <TableCell className="font-mono text-xs text-right">{pct(industry, 1)}</TableCell>
                                <TableCell className={cn('font-mono text-xs text-right', spread != null && spread < 0 ? 'text-destructive' : 'text-foreground')}>
                                  {pct(spread, 1)}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-right">{fmtInt(row.universe_size ?? null)}</TableCell>
                                <TableCell className="font-mono text-xs text-right">
                                  {fmtInt(filteredSize)}
                                  {isSmallFiltered ? (
                                    <span
                                      className="ml-1 text-yellow-600"
                                      title={`Filtered universe < ${SMALL_UNIVERSE_THRESHOLD}; rankings may be noisy.`}
                                    >
                                      !
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-right">{fmtInt(picksCount)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="py-3">
              <CardTitle className="text-sm tracking-wide">INSPECTOR</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs value={inspectorTab} onValueChange={(v) => setInspectorTab(v as typeof inspectorTab)}>
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="picks" className="text-[11px]">
                    Picks
                  </TabsTrigger>
                  <TabsTrigger value="filters" className="text-[11px]">
                    Filters
                  </TabsTrigger>
                  <TabsTrigger value="warnings" className="text-[11px]">
                    Warn
                  </TabsTrigger>
                  <TabsTrigger value="timing" className="text-[11px]">
                    Time
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-[11px]">
                    Raw
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="picks" className="mt-3">
                  {!selectedPoint ? (
                    <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Select a blotter row to inspect picks.
                    </div>
                  ) : (
                    <ScrollArea className="h-[620px] rounded-md border">
                      <div className="border-b bg-muted/10 px-3 py-2">
                        <div className="text-[11px] uppercase text-muted-foreground">Selection</div>
                        <div className="mt-1 font-mono text-xs">
                          as_of={selectedPoint.as_of} end={selectedPoint.end_date} picks={(selectedPoint.selected || []).length}
                        </div>
                      </div>
                      <div className="p-2">
                        {(selectedPoint.selected || []).length === 0 ? (
                          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">No picks for this point.</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Symbol</TableHead>
                                <TableHead className="text-[11px] text-right">Score</TableHead>
                                <TableHead className="text-[11px] text-right">P/E</TableHead>
                                <TableHead className="text-[11px] text-right">Ret</TableHead>
                                <TableHead className="text-[11px] text-right">Div</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(selectedPoint.selected || []).slice(0, 40).map((p) => (
                                <TableRow key={`${selectedPoint.as_of}-${p.symbol}`} className="hover:bg-muted/20">
                                  <TableCell className="font-mono text-xs">
                                    <Link href={`/stocks/${p.symbol}`} className="underline underline-offset-2">
                                      {p.symbol}
                                    </Link>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-right">{num(p.valuation_score ?? null, 1)}</TableCell>
                                  <TableCell className="font-mono text-xs text-right">{num(p.ratios?.pe ?? null, 2)}</TableCell>
                                  <TableCell className="font-mono text-xs text-right">{pct(p.total_return ?? null, 1)}</TableCell>
                                  <TableCell className="font-mono text-xs text-right">{num(p.dividends ?? null, 2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>

                <TabsContent value="filters" className="mt-3">
                  <ScrollArea className="h-[620px] rounded-md border">
                    <div className="p-3 space-y-3">
                      <div className="rounded-md border bg-muted/20 p-2">
                        <div className="text-[11px] uppercase text-muted-foreground">Imported</div>
                        <div className="mt-1 font-mono text-xs">
                          {importedFilters ? (
                            <>
                              cap={importedFilters.cap ?? 'all'}
                              {importedFilters.country ? ` country=${importedFilters.country}` : ''}
                              {importedFilters.industry ? ` industry=${importedFilters.industry}` : ''}
                              {importedFilters.ruleLogic ? ` logic=${importedFilters.ruleLogic}` : ''} rules=
                              {(importedFilters.customRules || []).filter((r) => r.enabled !== false).length}
                            </>
                          ) : (
                            'none'
                          )}
                        </div>
                        {filtersJson ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            filters_json={filtersJson.length > 110 ? `${filtersJson.slice(0, 110)}…` : filtersJson}
                          </div>
                        ) : null}
                      </div>

                      {importedFilters && (importedFilters.customRules || []).length > 0 ? (
                        <div className="rounded-md border">
                          <div className="border-b px-3 py-2 text-[11px] uppercase text-muted-foreground">Rules</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">On</TableHead>
                                <TableHead className="text-[11px]">Metric</TableHead>
                                <TableHead className="text-[11px]">Op</TableHead>
                                <TableHead className="text-[11px]">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(importedFilters.customRules || []).slice(0, 40).map((r, idx) => (
                                <TableRow key={r.id || `${r.metric}-${idx}`}>
                                  <TableCell className="font-mono text-xs">{r.enabled === false ? '0' : '1'}</TableCell>
                                  <TableCell className="font-mono text-xs">{r.metric}</TableCell>
                                  <TableCell className="font-mono text-xs">{r.operator}</TableCell>
                                  <TableCell className="font-mono text-xs">{formatRuleValue(r.value)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {(importedFilters.customRules || []).length > 40 ? (
                            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                              Showing first 40 of {(importedFilters.customRules || []).length} rules.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">No imported rules.</div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="warnings" className="mt-3">
                  <ScrollArea className="h-[620px] rounded-md border">
                    <div className="p-3 space-y-3">
                      <div className="rounded-md border bg-muted/20 p-2">
                        <div className="text-[11px] uppercase text-muted-foreground">Point</div>
                        <div className="mt-1 font-mono text-xs">
                          {selectedPoint ? `as_of=${selectedPoint.as_of} end=${selectedPoint.end_date}` : 'none'}
                        </div>
                      </div>

                      <div className="rounded-md border">
                        <div className="border-b px-3 py-2 text-[11px] uppercase text-muted-foreground">Unsupported filter metrics</div>
                        <div className="p-3 text-xs">
                          {selectedPoint && (selectedPoint.unsupported_filter_metrics || []).length > 0 ? (
                            <div className="font-mono text-xs">{(selectedPoint.unsupported_filter_metrics || []).join(', ')}</div>
                          ) : (
                            <div className="text-muted-foreground">None for selected point.</div>
                          )}
                          {warningsAll.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] uppercase text-muted-foreground">All points</div>
                              <div className="mt-1 font-mono text-xs">{warningsAll.join(', ')}</div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {result?.note ? (
                        <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">note={result.note}</div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="timing" className="mt-3">
                  <ScrollArea className="h-[620px] rounded-md border">
                    <div className="p-3 space-y-3">
                      <div className="rounded-md border bg-muted/20 p-2">
                        <div className="text-[11px] uppercase text-muted-foreground">Request</div>
                        <div className="mt-1 font-mono text-xs">{result?.request_id ? `request_id=${result.request_id}` : 'request_id=—'}</div>
                        <div className="mt-1 font-mono text-xs">client_ms={clientMs != null ? Math.round(clientMs).toLocaleString() : '—'}</div>
                      </div>

                      <div className="rounded-md border">
                        <div className="border-b px-3 py-2 text-[11px] uppercase text-muted-foreground">Server timing (ms)</div>
                        <div className="p-3">
                          {result?.server_timing_ms && Object.keys(result.server_timing_ms).length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[11px]">Key</TableHead>
                                  <TableHead className="text-[11px] text-right">ms</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.entries(result.server_timing_ms).map(([k, v]) => (
                                  <TableRow key={k}>
                                    <TableCell className="font-mono text-xs">{k}</TableCell>
                                    <TableCell className="font-mono text-xs text-right">{Math.round(v).toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-xs text-muted-foreground">No server timing attached.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="raw" className="mt-3">
                  <ScrollArea className="h-[620px] rounded-md border">
                    <div className="p-3">
                      {!result ? (
                        <div className="text-xs text-muted-foreground">No payload.</div>
                      ) : (
                        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4">{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <BacktestPageContent />
    </Suspense>
  );
}
