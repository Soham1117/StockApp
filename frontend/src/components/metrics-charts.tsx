'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ScatterChart,
  Scatter,
  Cell,
} from 'recharts';
import type { IndustryMetrics, StocksByMarketCap, MarketCapBucket, RRGDataPoint } from '@/types';
import { useRRG } from '@/hooks/use-stocks';

interface MetricsChartsProps {
  metricsData: IndustryMetrics;
  selectedBucket: MarketCapBucket;
  stocksData: StocksByMarketCap;
}

const valuationMetricConfig = [
  { key: 'peRatioTTM', label: 'P/E Ratio' },
  { key: 'priceToSalesRatioTTM', label: 'P/S Ratio' },
  { key: 'priceToBookRatioTTM', label: 'P/B Ratio' },
  { key: 'enterpriseValueOverEBITTTM', label: 'EV/EBIT' },
  { key: 'enterpriseValueOverEBITDATTM', label: 'EV/EBITDA' },
  { key: 'enterpriseValueToSalesTTM', label: 'EV/Sales' },
];

const qualityMetricConfig = [
  { key: 'profitability.roe', label: 'ROE', nested: true },
  { key: 'profitability.roic', label: 'ROIC', nested: true },
  { key: 'profitability.operatingMargin', label: 'Operating Margin', nested: true },
  { key: 'profitability.netMargin', label: 'Net Margin', nested: true },
  { key: 'financialHealth.debtToEquity', label: 'Debt-to-Equity', nested: true, inverted: true },
  { key: 'financialHealth.interestCoverage', label: 'Interest Coverage', nested: true },
  { key: 'cashFlow.fcfYield', label: 'FCF Yield', nested: true },
  { key: 'cashFlow.fcfMargin', label: 'FCF Margin', nested: true },
];

type RRGLookback = 90 | 180 | 360;

const RRG_QUADRANT_DESCRIPTIONS: Record<string, string> = {
  LEADING: 'Strong and improving vs benchmark (leaders).',
  WEAKENING: 'Still strong but losing momentum (possible topping).',
  LAGGING: 'Weak and underperforming (laggards).',
  IMPROVING: 'Weak but momentum is improving (potential turnarounds).',
};

function RRGTooltip({
  active,
  payload,
  etfLabels,
}: {
  active?: boolean;
  payload?: any[];
  etfLabels: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as RRGDataPoint;
  const description = RRG_QUADRANT_DESCRIPTIONS[point.quadrant] || '';
  const label = etfLabels[point.symbol] || point.symbol;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-mono text-sm font-semibold mb-1">
        {label} ({point.symbol})
      </div>
      <div className="space-y-0.5">
        <div>
          <span className="text-muted-foreground">RS-Ratio: </span>
          <span>{point.rsRatio.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">RS-Momentum: </span>
          <span>{point.rsMomentum.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Quadrant: </span>
          <span className="font-medium">{point.quadrant}</span>
        </div>
        {description && (
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

export function MetricsCharts({ metricsData, selectedBucket, stocksData }: MetricsChartsProps) {
  const bucketStocks = stocksData[selectedBucket] || [];
  const allSymbols = bucketStocks.map((s) => s.symbol);

  const [rrgLookback, setRrgLookback] = useState<RRGLookback>(180);

  // Sector/industry RRG uses ETF symbols (predefined universe), not individual stocks
  const SECTOR_ETFS: { symbol: string; label: string }[] = useMemo(
    () => [
      { symbol: 'XLK', label: 'Technology' },
      { symbol: 'XLF', label: 'Financials' },
      { symbol: 'XLY', label: 'Consumer Discretionary' },
      { symbol: 'XLP', label: 'Consumer Staples' },
      { symbol: 'XLI', label: 'Industrials' },
      { symbol: 'XLE', label: 'Energy' },
      { symbol: 'XLV', label: 'Health Care' },
      { symbol: 'XLB', label: 'Materials' },
      { symbol: 'XLU', label: 'Utilities' },
      { symbol: 'XLC', label: 'Communication Services' },
      { symbol: 'IYR', label: 'Real Estate' },
    ],
    []
  );

  const etfSymbols = useMemo(() => SECTOR_ETFS.map((e) => e.symbol), [SECTOR_ETFS]);
  const { data: rrgData } = useRRG(etfSymbols, 'SPY', rrgLookback);

  const getNestedValue = (stock: any, key: string): number | null => {
    const [parent, child] = key.split('.');
    const parentObj = stock.ratios[parent];
    if (!parentObj) return null;
    const value = parentObj[child];
    return value != null && isFinite(value) ? value : null;
  };

  const renderMetricChart = (
    metric: { key: string; label: string; nested?: boolean; inverted?: boolean },
    stats: any
  ) => {
    const chartData = metricsData.stocks
      .filter((s) => allSymbols.includes(s.symbol))
      .map((stock) => {
        const value = metric.nested
          ? getNestedValue(stock, metric.key)
          : (stock.ratios[metric.key as keyof typeof stock.ratios] as number | undefined);
        return {
          symbol: stock.symbol,
          value: value != null && isFinite(value) ? value : null,
        };
      })
      .filter((d) => d.value !== null)
      .sort((a, b) => (metric.inverted ? (a.value ?? 0) - (b.value ?? 0) : (b.value ?? 0) - (a.value ?? 0)))
      .slice(0, 15);

    if (chartData.length === 0) {
      return (
        <Card key={metric.key}>
          <CardHeader>
            <CardTitle className="text-base">{metric.label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sector Avg: {stats.mean.toFixed(2)}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              No data points available for selected stocks
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={metric.key}>
        <CardHeader>
          <CardTitle className="text-base">{metric.label}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sector Avg: {stats.mean.toFixed(2)} ({chartData.length} stocks)
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="symbol"
                tick={{ fill: '#888', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                }}
              />
              <ReferenceLine y={stats.mean} stroke="#ff9f40" strokeDasharray="3 3" />
              <Bar dataKey="value" fill="#ff9f40" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const rrgHasData = useMemo(
    () => !!rrgData && Array.isArray(rrgData.data) && rrgData.data.length > 0,
    [rrgData]
  );

  const etfLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const { symbol, label } of SECTOR_ETFS) {
      map[symbol] = label;
    }
    return map;
  }, [SECTOR_ETFS]);

  return (
    <Tabs defaultValue="valuations" className="w-full">
      <TabsList>
        <TabsTrigger value="valuations">Valuation Metrics</TabsTrigger>
        <TabsTrigger value="quality">Quality & Health</TabsTrigger>
        <TabsTrigger value="rrg">Relative Rotation Graph</TabsTrigger>
      </TabsList>

      <TabsContent value="valuations" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {valuationMetricConfig.map((metric) => {
            const stats = metricsData.industryStats[metric.key];
            if (!stats || stats.mean === 0) {
              return (
                <Card key={metric.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{metric.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">No data available</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                      No metrics data available for this chart
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return renderMetricChart(metric, stats);
          })}
        </div>
      </TabsContent>

      <TabsContent value="quality" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {qualityMetricConfig.map((metric) => {
            const stats = metricsData.industryStats[metric.key];
            if (!stats || stats.mean === 0) {
              return (
                <Card key={metric.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{metric.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">No data available</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                      No metrics data available for this chart
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return renderMetricChart(metric, stats);
          })}
        </div>
      </TabsContent>

      <TabsContent value="rrg">
        <Card>
          <CardHeader>
            <CardTitle>Sector Relative Rotation Graph</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Relative strength and momentum of major sector ETFs vs SPY benchmark. Each point
                shows a sector&apos;s RS-Ratio (x-axis) and RS-Momentum (y-axis).
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Lookback:</span>
                <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                  {[90, 180, 360].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`px-2 py-1 rounded-sm ${
                        rrgLookback === d
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                      onClick={() => setRrgLookback(d as RRGLookback)}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rrgHasData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-xs text-muted-foreground md:grid-cols-4">
                  <div>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-foreground">Leading</span>
                    </span>
                    <p>Strong and improving vs benchmark.</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-f59e0b" />
                      <span className="font-semibold text-foreground">Weakening</span>
                    </span>
                    <p>Strong but momentum is fading.</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-ef4444" />
                      <span className="font-semibold text-foreground">Lagging</span>
                    </span>
                    <p>Weak and underperforming.</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-3b82f6" />
                      <span className="font-semibold text-foreground">Improving</span>
                    </span>
                    <p>Weak but momentum is improving.</p>
                  </div>
                </div>
                <div className="relative h-[500px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        type="number"
                        dataKey="rsRatio"
                        name="RS-Ratio"
                        tick={{ fill: '#888' }}
                        label={{
                          value: 'RS-Ratio (Relative Strength)',
                          position: 'bottom',
                          fill: '#888',
                        }}
                        domain={[90, 110]}
                      />
                      <YAxis
                        type="number"
                        dataKey="rsMomentum"
                        name="RS-Momentum"
                        tick={{ fill: '#888' }}
                        label={{
                          value: 'RS-Momentum',
                          angle: -90,
                          position: 'left',
                          fill: '#888',
                        }}
                        domain={[90, 110]}
                      />
                      <Tooltip
                        content={<RRGTooltip etfLabels={etfLabelMap} />}
                        cursor={{ strokeDasharray: '3 3' }}
                      />
                      <ReferenceLine x={100} stroke="#555" />
                      <ReferenceLine y={100} stroke="#555" />
                      <Scatter data={rrgData!.data} fill="#ff9f40">
                        {rrgData!.data.map((entry, index) => {
                          let color = '#888';
                          if (entry.quadrant === 'LEADING') color = '#10b981'; // green
                          if (entry.quadrant === 'WEAKENING') color = '#f59e0b'; // orange
                          if (entry.quadrant === 'LAGGING') color = '#ef4444'; // red
                          if (entry.quadrant === 'IMPROVING') color = '#3b82f6'; // blue

                          return <Cell key={`cell-${index}`} fill={color} />;
                        })}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="flex w-full justify-between px-4">
                      <span>Lagging</span>
                      <span>Leading</span>
                    </div>
                    <div className="absolute inset-y-0 left-1/2 flex flex-col justify-between py-4">
                      <span className="-rotate-90 origin-left">Weakening</span>
                      <span className="-rotate-90 origin-left">Improving</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[500px] items-center justify-center">
                <p className="text-muted-foreground">
                  {rrgData && rrgData.data && rrgData.data.length === 0
                    ? 'No RRG data available for selected stocks'
                    : 'Loading RRG data...'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
