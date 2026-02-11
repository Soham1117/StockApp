'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useRRGHistory } from '@/hooks/use-stocks';
import { format, subYears, parseISO } from 'date-fns';

type RRGLookback = 90 | 180 | 360 | 720 | 1800 | 3600;

const SECTOR_ETFS: { symbol: string; label: string }[] = [
  { symbol: 'XLK', label: 'Information Technology' },
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
];

interface TimeSeriesDataPoint {
  date: string;
  [key: string]: number | string;
}

function SectorTimeSeriesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold mb-2">
        {label ? format(parseISO(label), 'MMM d, yyyy') : 'N/A'}
      </div>
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const sector = SECTOR_ETFS.find((e) => e.symbol === entry.name);
          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-0.5"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">
                {sector?.label || entry.name}:
              </span>
              <span className="font-medium">{entry.value?.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SectorTimeSeries() {
  const [lookback, setLookback] = useState<RRGLookback>(180);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]); // Empty = all sectors
  const [metricType, setMetricType] = useState<'rsRatio' | 'rsMomentum'>('rsMomentum');

  const allSymbols = useMemo(() => SECTOR_ETFS.map((e) => e.symbol), []);
  const symbols = useMemo(
    () => (selectedSectors.length > 0 ? selectedSectors : allSymbols),
    [selectedSectors, allSymbols]
  );

  // Historical RRG data
  const endDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const startDate = useMemo(() => {
    return format(subYears(new Date(), 10), 'yyyy-MM-dd');
  }, []);

  const { data: historyData, isLoading: isLoadingHistory } = useRRGHistory(
    allSymbols,
    lookback,
    startDate,
    endDate
  );

  // Transform data for time-series chart
  const timeSeriesData = useMemo(() => {
    if (!historyData?.data) return [];

    // Calculate the cutoff date based on lookback period
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - lookback);
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');

    // Group by date
    const dateMap = new Map<string, TimeSeriesDataPoint>();

    const filteredData = historyData.data.filter(
      (d) => d.date >= cutoffDateStr && symbols.includes(d.symbol)
    );

    for (const point of filteredData) {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      const dateEntry = dateMap.get(point.date)!;
      dateEntry[point.symbol] = metricType === 'rsRatio' ? point.rsRatio : point.rsMomentum;
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [historyData, lookback, symbols, metricType]);

  // Define colors for each sector
  const sectorColors = useMemo(() => {
    const colors = [
      '#10b981', // green
      '#3b82f6', // blue
      '#f59e0b', // orange
      '#ef4444', // red
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#84cc16', // lime
      '#f97316', // orange-red
      '#6366f1', // indigo
      '#14b8a6', // teal
    ];

    const colorMap: Record<string, string> = {};
    symbols.forEach((symbol, index) => {
      colorMap[symbol] = colors[index % colors.length];
    });

    return colorMap;
  }, [symbols]);

  const hasData = !!timeSeriesData && timeSeriesData.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sector Performance Over Time</CardTitle>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Track how sector {metricType === 'rsRatio' ? 'relative strength' : 'momentum'} changes over time.
          </p>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Sector Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Sectors:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSectors.length === 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSectors([]);
                      }
                    }}
                    className="h-3 w-3"
                  />
                  <span>All</span>
                </label>
                {SECTOR_ETFS.map((sector) => (
                  <label key={sector.symbol} className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSectors.includes(sector.symbol)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSectors([...selectedSectors, sector.symbol]);
                        } else {
                          const newSelection = selectedSectors.filter((s) => s !== sector.symbol);
                          setSelectedSectors(newSelection);
                        }
                      }}
                      className="h-3 w-3"
                    />
                    <span>{sector.symbol}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Lookback selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Lookback:</span>
              <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                {[90, 180, 360, 720, 1800, 3600].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`px-2 py-1 rounded-sm ${
                      lookback === d
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onClick={() => setLookback(d as RRGLookback)}
                  >
                    {d < 365 ? `${d}d` : `${Math.round(d / 365)}y`}
                  </button>
                ))}
              </div>
            </div>

            {/* Metric Type */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Metric:</span>
              <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  className={`px-2 py-1 rounded-sm ${
                    metricType === 'rsMomentum'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  onClick={() => setMetricType('rsMomentum')}
                >
                  RS-Momentum
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 rounded-sm ${
                    metricType === 'rsRatio'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  onClick={() => setMetricType('rsRatio')}
                >
                  RS-Ratio
                </button>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="relative h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#888', fontSize: 11 }}
                  tickFormatter={(date) => format(parseISO(date), 'MMM yyyy')}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fill: '#888' }}
                  label={{
                    value: metricType === 'rsRatio' ? 'RS-Ratio' : 'RS-Momentum',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#888',
                  }}
                  domain={[90, 110]}
                />
                <Tooltip content={<SectorTimeSeriesTooltip />} />
                <ReferenceLine y={100} stroke="#555" strokeWidth={2} strokeDasharray="3 3" />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(value) => {
                    const sector = SECTOR_ETFS.find((e) => e.symbol === value);
                    return sector ? `${sector.label} (${value})` : value;
                  }}
                />

                {/* Line for each sector */}
                {symbols.map((symbol) => (
                  <Line
                    key={symbol}
                    type="monotone"
                    dataKey={symbol}
                    stroke={sectorColors[symbol]}
                    strokeWidth={2}
                    dot={false}
                    name={symbol}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[500px] items-center justify-center">
            <p className="text-muted-foreground">
              {isLoadingHistory
                ? 'Loading sector time-series data...'
                : 'No data available.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
