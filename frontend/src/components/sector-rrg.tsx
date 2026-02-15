'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { RRGDataPoint } from '@/types';
import { useRRG } from '@/hooks/use-stocks';

type RRGLookback = 90 | 180 | 360;

const RRG_QUADRANT_DESCRIPTIONS: Record<string, string> = {
  LEADING: 'Strong and improving vs benchmark (leaders).',
  WEAKENING: 'Still strong but losing momentum (possible topping).',
  LAGGING: 'Weak and underperforming (laggards).',
  IMPROVING: 'Weak but momentum is improving (potential turnarounds).',
};

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

function SectorRRGTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: any[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as RRGDataPoint;
  const sector = SECTOR_ETFS.find((e) => e.symbol === point.symbol);
  const description = RRG_QUADRANT_DESCRIPTIONS[point.quadrant] || '';

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-mono text-sm font-semibold mb-1">
        {sector ? `${sector.label} (${point.symbol})` : point.symbol}
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

// Legacy component - use SectorRRGEnhanced instead
export function SectorRRG() {
  const [lookback, setLookback] = useState<RRGLookback>(180);
  const symbols = useMemo(() => SECTOR_ETFS.map((e) => e.symbol), []);
  const { data: rrgData } = useRRG(symbols, 'SPY', lookback);

  const hasData = !!rrgData && Array.isArray(rrgData.data) && rrgData.data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sector Relative Rotation Graph</CardTitle>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Relative strength and momentum of major GICS sector ETFs vs SPY benchmark. Each point
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
                    lookback === d
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  onClick={() => setLookback(d as RRGLookback)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
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
                    content={<SectorRRGTooltip />}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <ReferenceLine x={100} stroke="#555" />
                  <ReferenceLine y={100} stroke="#555" />
                  <Scatter data={rrgData!.data} fill="#ff9f40">
                    {rrgData!.data.map((entry, index) => {
                      let color = '#888';
                      if (entry.quadrant === 'LEADING') color = '#10b981';
                      if (entry.quadrant === 'WEAKENING') color = '#f59e0b';
                      if (entry.quadrant === 'LAGGING') color = '#ef4444';
                      if (entry.quadrant === 'IMPROVING') color = '#3b82f6';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="flex h-[500px] items-center justify-center">
            <p className="text-muted-foreground">
              {!rrgData ? 'Loading sector RRG data...' : 'No RRG data available.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


