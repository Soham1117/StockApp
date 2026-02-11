'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Legend,
  Dot,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { RRGDataPoint } from '@/types';
import { useRRGHistory, useRRGPredictions } from '@/hooks/use-stocks';
import { format, subYears, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { triggerFileDownload } from '@/lib/export-utils';

type RRGLookback = 90 | 180 | 360 | 720 | 1800 | 3600;

const RRG_QUADRANT_DESCRIPTIONS: Record<string, string> = {
  LEADING: 'Strong and improving vs benchmark (leaders).',
  WEAKENING: 'Still strong but losing momentum (possible topping).',
  LAGGING: 'Weak and underperforming (laggards).',
  IMPROVING: 'Weak but momentum is improving (potential turnarounds).',
};

const CRITICAL_BAND = 1;

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

const QUADRANT_COLORS: Record<string, string> = {
  LEADING: '#10b981',
  WEAKENING: '#f59e0b',
  LAGGING: '#ef4444',
  IMPROVING: '#3b82f6',
};

function SectorRRGTooltip({
  active,
  payload,
  showDate,
}: {
  active?: boolean;
  payload?: any[];
  showDate?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload;

  // Extract symbol from the payload name (Line component sets this)
  const symbol = payload[0].name;
  const sector = SECTOR_ETFS.find((e) => e.symbol === symbol);
  const description = RRG_QUADRANT_DESCRIPTIONS[point.quadrant] || '';

  const isPrediction = point.date === 'prediction';

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-mono text-sm font-semibold mb-1">
        {sector ? `${sector.label} (${symbol})` : symbol}
        {isPrediction && (
          <span className="ml-2 text-[10px] text-muted-foreground">[Predicted]</span>
        )}
      </div>
      {point.date && !isPrediction && (
        <div className="text-[10px] text-muted-foreground mb-1">
          {format(parseISO(point.date), 'MMM d, yyyy')}
        </div>
      )}
      {isPrediction && (
        <div className="text-[10px] text-muted-foreground mb-1">
          30-day forecast
        </div>
      )}
      <div className="space-y-0.5">
        <div>
          <span className="text-muted-foreground">RS-Ratio: </span>
          <span>{point.rsRatio?.toFixed(1) || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">RS-Momentum: </span>
          <span>{point.rsMomentum?.toFixed(1) || 'N/A'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Quadrant: </span>
          <span className="font-medium">{point.quadrant || 'N/A'}</span>
        </div>
        {description && (
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

export function SectorRRGEnhanced() {
  const [isMounted, setIsMounted] = useState(false);
  const [lookback, setLookback] = useState<RRGLookback>(180);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]); // Empty = all sectors
  const [showPredictions, setShowPredictions] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [pipelineTopN, setPipelineTopN] = useState<number>(10);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const allSymbols = useMemo(() => SECTOR_ETFS.map((e) => e.symbol), []);
  const symbols = useMemo(
    () => (selectedSectors.length > 0 ? selectedSectors : allSymbols),
    [selectedSectors, allSymbols]
  );

  // Historical RRG data - fetch more years based on lookback
  const endDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  // For longer lookbacks, fetch more history (up to 10 years)
  // But we'll let the API return all available data and filter client-side
  const startDate = useMemo(() => {
    // Request data going back 10 years to get maximum available range
    return format(subYears(new Date(), 10), 'yyyy-MM-dd');
  }, []);
  
  const { data: historyData, isLoading: isLoadingHistory } = useRRGHistory(
    allSymbols, // Fetch all symbols for trails, filter later
    lookback,
    startDate,
    endDate,
  );

  // Predictions
  const { data: predictionsData, isLoading: isLoadingPredictions, error: predictionsError } = useRRGPredictions(
    symbols,
    30, // 30 days ahead
    lookback
  );

  // Debug predictions
  useEffect(() => {
    if (showPredictions) {
      console.log('[RRG] Predictions data:', predictionsData);
      console.log('[RRG] Predictions error:', predictionsError);
      console.log('[RRG] Predictions loading:', isLoadingPredictions);
      if (predictionsData?.missing_models && predictionsData.missing_models.length > 0) {
        console.warn('[RRG] Missing models:', predictionsData.missing_models);
      }
    }
  }, [showPredictions, predictionsData, predictionsError, isLoadingPredictions]);

  // Get available dates from history, filtered by lookback period
  const availableDates = useMemo(() => {
    if (!historyData?.data) return [];

    // Calculate the cutoff date based on lookback period
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - lookback);
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');

    // Filter dates to only include those within the lookback period
    const dates = Array.from(
      new Set(
        historyData.data
          .filter((d) => d.date >= cutoffDateStr)
          .map((d) => d.date)
      )
    ).sort();

    return dates;
  }, [historyData, lookback]);

  // Get current date to display
  const currentDisplayDate = selectedDate || availableDates[availableDates.length - 1] || null;

  // Keep selectedDate in sync with available dates when lookback/data changes.
  useEffect(() => {
    if (!isMounted) {
      return;
    }
    if (availableDates.length === 0) {
      if (selectedDate !== null) {
        setSelectedDate(null);
      }
      if (isPlaying) {
        setIsPlaying(false);
      }
      return;
    }

    if (selectedDate && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[availableDates.length - 1]);
      setIsPlaying(false);
    }
  }, [availableDates, selectedDate, isPlaying, isMounted]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Build line data for each sector (array of paths)
  const sectorPaths = useMemo(() => {
    if (!historyData?.data || !currentDisplayDate) {
      return [];
    }

    // Calculate the cutoff date based on lookback period
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - lookback);
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');

    // Determine sampling interval based on lookback period
    // For longer periods, show less frequent data points (yearly instead of monthly/weekly)
    const getSamplingInterval = (lookbackDays: number) => {
      if (lookbackDays >= 1800) return 365; // 5+ years: sample yearly
      if (lookbackDays >= 720) return 90;   // 2+ years: sample quarterly
      if (lookbackDays >= 360) return 30;   // 1+ year: sample monthly
      return 7;                              // < 1 year: sample weekly
    };

    const samplingDays = getSamplingInterval(lookback);

    const paths: Array<{
      symbol: string;
      data: Array<{ rsRatio: number; rsMomentum: number; date: string; quadrant: string }>;
    }> = [];

    for (const symbol of symbols) {
      const symbolHistory = historyData.data
        .filter((d) =>
          d.symbol === symbol &&
          d.date >= cutoffDateStr &&
          d.date <= currentDisplayDate
        )
        .sort((a, b) => a.date.localeCompare(b.date));

      if (symbolHistory.length > 0) {
        // Sample data points based on interval
        let sampledData = [];
        let lastSampledDate: Date | null = null;

        for (const point of symbolHistory) {
          const pointDate = parseISO(point.date);

          if (!lastSampledDate ||
              (pointDate.getTime() - lastSampledDate.getTime()) >= samplingDays * 24 * 60 * 60 * 1000) {
            sampledData.push({
              rsRatio: point.rsRatio,
              rsMomentum: point.rsMomentum,
              date: point.date,
              quadrant: point.quadrant,
            });
            lastSampledDate = pointDate;
          }
        }

        // Always include the last point (most recent)
        const lastPoint = symbolHistory[symbolHistory.length - 1];
        if (sampledData.length === 0 || sampledData[sampledData.length - 1].date !== lastPoint.date) {
          sampledData.push({
            rsRatio: lastPoint.rsRatio,
            rsMomentum: lastPoint.rsMomentum,
            date: lastPoint.date,
            quadrant: lastPoint.quadrant,
          });
        }

        paths.push({
          symbol,
          data: sampledData,
        });
      }
    }

    return paths;
  }, [historyData, currentDisplayDate, symbols, lookback]);

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

  const sectorLabelMap = useMemo(() => {
    return Object.fromEntries(SECTOR_ETFS.map((sector) => [sector.symbol, sector.label]));
  }, []);

  const rankedSectors = useMemo(() => {
    if (!historyData?.data || !currentDisplayDate || symbols.length === 0) {
      return [];
    }

    const rows = symbols
      .map((symbol) => {
        const latestPoint = historyData.data
          .filter((point) => point.symbol === symbol && point.date <= currentDisplayDate)
          .reduce<RRGDataPoint | null>((latest, point) => {
            if (!latest || point.date > latest.date) {
              return point;
            }
            return latest;
          }, null);

        if (!latestPoint) {
          return null;
        }

        const rsRatio = Number(latestPoint.rsRatio);
        const rsMomentum = Number(latestPoint.rsMomentum);
        const strength = (rsRatio + rsMomentum) / 2;

        return {
          symbol,
          label: sectorLabelMap[symbol] || symbol,
          rsRatio,
          rsMomentum,
          quadrant: latestPoint.quadrant,
          strength,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);

    rows.sort((a, b) => b.strength - a.strength);

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [historyData, currentDisplayDate, symbols, sectorLabelMap]);

  // Animation control
  useEffect(() => {
    if (isPlaying && availableDates.length > 0) {
      const currentIndex = availableDates.indexOf(currentDisplayDate || availableDates[0]);
      if (currentIndex >= availableDates.length - 1) {
        setIsPlaying(false);
        return;
      }
      const nextIndex = currentIndex + 1;
      const delay = 1000 / playbackSpeed; // milliseconds per step

      animationRef.current = setTimeout(() => {
        setSelectedDate(availableDates[nextIndex]);
      }, delay);
    } else if (animationRef.current) {
      clearTimeout(animationRef.current);
      animationRef.current = null;
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isPlaying, currentDisplayDate, availableDates, playbackSpeed]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStep = (direction: 'forward' | 'backward') => {
    if (!currentDisplayDate || availableDates.length === 0) return;

    const currentIndex = availableDates.indexOf(currentDisplayDate);
    let newIndex: number;

    if (direction === 'forward') {
      newIndex = Math.min(currentIndex + 1, availableDates.length - 1);
    } else {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    setSelectedDate(availableDates[newIndex]);
    setIsPlaying(false);
  };

  const hasData = !!sectorPaths && sectorPaths.length > 0;
  const showChart = isMounted && (hasData || isLoadingHistory);
  const showEmpty = isMounted && !hasData && !isLoadingHistory;

  const handleOneClick = async () => {
    setPipelineError(null);
    setIsRunningPipeline(true);
    try {
      const res = await fetch('/api/pipeline/one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookback_days: lookback,
          top_n: pipelineTopN,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Pipeline failed (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] || `industry_report_${new Date().toISOString().slice(0, 10)}.pdf`;
      triggerFileDownload(blob, filename);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Pipeline failed.');
    } finally {
      setIsRunningPipeline(false);
    }
  };

  return (
    <Card variant="dense">
      <CardHeader>
        <CardTitle className="border-b border-border pb-1">Sector Relative Rotation Graph</CardTitle>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-muted-foreground">
            Relative strength and momentum of major GICS sector ETFs vs SPY benchmark. Each point
            shows a sector&apos;s RS-Ratio (x-axis) and RS-Momentum (y-axis).
          </p>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
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
                          // When selecting a sector, uncheck "All" by adding to selection
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

            {/* One-click pipeline */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Top N:</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={pipelineTopN}
                onChange={(e) => {
                  const next = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                  setPipelineTopN(next);
                }}
                className="h-7 w-16 text-[11px] font-mono"
                disabled={isRunningPipeline}
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleOneClick}
                disabled={isRunningPipeline}
              >
                {isRunningPipeline ? 'Running.' : 'Run Full Analysis'}
              </Button>
            </div>

            {/* Time controls */}
            {availableDates.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStep('backward')}
                  disabled={!currentDisplayDate || currentDisplayDate === availableDates[0]}
                >
                  <SkipBack className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={handlePlayPause}>
                  {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStep('forward')}
                  disabled={
                    !currentDisplayDate ||
                    currentDisplayDate === availableDates[availableDates.length - 1]
                  }
                >
                  <SkipForward className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentDisplayDate ? format(parseISO(currentDisplayDate), 'MMM d, yyyy') : 'N/A'}
                </span>
                {availableDates.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({availableDates[0]} to {availableDates[availableDates.length - 1]})
                  </span>
                )}
              </div>
            )}

            {/* Toggles */}
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPredictions}
                  onChange={(e) => setShowPredictions(e.target.checked)}
                  className="h-3 w-3"
                />
                <span>Show Predictions</span>
                {predictionsError && (
                  <span className="text-[10px] text-destructive" title={predictionsError.message}>
                    (error - check console)
                  </span>
                )}
                {isLoadingPredictions && (
                  <span className="text-[10px] text-muted-foreground">(loading...)</span>
                )}
                {showPredictions && predictionsData && (
                  <>
                    <span className="text-[10px] text-muted-foreground">
                      ({predictionsData.predictions.length} predictions)
                    </span>
                    {predictionsData.missing_models && predictionsData.missing_models.length > 0 && (
                      <span className="text-[10px] text-yellow-600" title={`Missing models: ${predictionsData.missing_models.join(', ')}`}>
                        ({predictionsData.missing_models.length} models missing)
                      </span>
                    )}
                  </>
                )}
              </label>
            </div>
          </div>
          {pipelineError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {pipelineError}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {showChart ? (
          <div className="space-y-1.5">
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
            <p className="text-[11px] text-muted-foreground">
              Critical zone: within +/-{CRITICAL_BAND} of 100. Crossings often signal regime shifts.
            </p>
            <div className="relative h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis
                    type="number"
                    dataKey="rsRatio"
                    name="RS-Ratio"
                    tick={{ fill: '#888' }}
                    domain={[90, 110]}
                  />
                  <YAxis
                    type="number"
                    dataKey="rsMomentum"
                    name="RS-Momentum"
                    tick={{ fill: '#888' }}
                    domain={[90, 110]}
                  />
                  <Tooltip
                    content={
                      <SectorRRGTooltip showDate={currentDisplayDate || undefined} />
                    }
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <ReferenceArea
                    x1={100 - CRITICAL_BAND}
                    x2={100 + CRITICAL_BAND}
                    y1={90}
                    y2={110}
                    fill="rgba(148, 163, 184, 0.08)"
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    x1={90}
                    x2={110}
                    y1={100 - CRITICAL_BAND}
                    y2={100 + CRITICAL_BAND}
                    fill="rgba(148, 163, 184, 0.08)"
                    strokeOpacity={0}
                  />
                  <ReferenceLine x={100} stroke="#555" strokeWidth={2} />
                  <ReferenceLine y={100} stroke="#555" strokeWidth={2} />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value) => {
                      const sector = SECTOR_ETFS.find((e) => e.symbol === value);
                      return sector ? `${sector.label} (${value})` : value;
                    }}
                  />

                  {/* Line for each sector showing path through RRG space */}
                  {sectorPaths.map((path) => (
                    <Line
                      key={path.symbol}
                      type="monotone"
                      data={path.data}
                      dataKey="rsMomentum"
                      stroke={sectorColors[path.symbol]}
                      strokeWidth={2.5}
                      dot={(props) => {
                        const { cx, cy, index, payload } = props;
                        const isLast = index === path.data.length - 1;
                        const quadrant = payload?.quadrant;
                        const color = quadrant ? QUADRANT_COLORS[quadrant] || sectorColors[path.symbol] : sectorColors[path.symbol];

                        return (
                          <Dot
                            key={`dot-${path.symbol}-${index}`}
                            cx={cx}
                            cy={cy}
                            r={isLast ? 7 : 3}
                            fill={color}
                            stroke={isLast ? '#fff' : 'none'}
                            strokeWidth={isLast ? 2 : 0}
                          />
                        );
                      }}
                      name={path.symbol}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}

                  {/* Prediction lines - dashed lines from current position to predicted position */}
                  {showPredictions && predictionsData?.predictions && predictionsData.predictions.map((pred) => {
                    const currentSectorPath = sectorPaths.find((p) => p.symbol === pred.symbol);
                    if (!currentSectorPath || currentSectorPath.data.length === 0) return null;

                    const currentPos = currentSectorPath.data[currentSectorPath.data.length - 1];
                    const predictionLine = [
                      currentPos,
                      {
                        rsRatio: pred.predicted_rsRatio,
                        rsMomentum: pred.predicted_rsMomentum,
                        date: 'prediction',
                        quadrant: pred.predicted_quadrant,
                      },
                    ];

                    return (
                      <Line
                        key={`pred-${pred.symbol}`}
                        type="monotone"
                        data={predictionLine}
                        dataKey="rsMomentum"
                        stroke={sectorColors[pred.symbol]}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={(props) => {
                          const { cx, cy, index } = props;
                          if (index === 0) return null; // Don't show dot at current position (already shown)

                          const color = QUADRANT_COLORS[pred.predicted_quadrant] || sectorColors[pred.symbol];
                          return (
                            <Dot
                              key={`pred-dot-${pred.symbol}`}
                              cx={cx}
                              cy={cy}
                              r={6}
                              fill={color}
                              fillOpacity={0.7}
                              stroke={color}
                              strokeWidth={2}
                            />
                          );
                        }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {rankedSectors.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                  <h3 className="text-xs font-semibold text-foreground">Sector Rankings</h3>
                  {currentDisplayDate && (
                    <span className="text-[10px] text-muted-foreground">
                      As of {format(parseISO(currentDisplayDate), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
                <Table>
                  <TableCaption>
                    Ranked by average of RS-Ratio and RS-Momentum for the selected lookback.
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>ETF</TableHead>
                      <TableHead>RS-Ratio</TableHead>
                      <TableHead>RS-Momentum</TableHead>
                      <TableHead>Quadrant</TableHead>
                      <TableHead>Strength</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedSectors.map((row) => (
                      <TableRow key={row.symbol}>
                        <TableCell className="font-mono text-foreground">{row.rank}</TableCell>
                        <TableCell className="text-foreground">{row.label}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.symbol}</TableCell>
                        <TableCell>{row.rsRatio.toFixed(2)}</TableCell>
                        <TableCell>{row.rsMomentum.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor:
                                  QUADRANT_COLORS[row.quadrant] || '#94a3b8',
                              }}
                            />
                            <span>{row.quadrant}</span>
                          </span>
                        </TableCell>
                        <TableCell>{row.strength.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-muted-foreground">
              {showEmpty
                ? 'No RRG data available.'
                : 'Loading historical RRG data...'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

