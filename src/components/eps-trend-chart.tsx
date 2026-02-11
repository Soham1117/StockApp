'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { EarningsHistory } from '@/types';

interface EPSChartProps {
  symbol: string;
}

export function EPSTrendChart({ symbol }: EPSChartProps) {
  const [data, setData] = useState<EarningsHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/stocks/${symbol}/earnings/history`);
        if (res.ok) {
          const history = await res.json();
          setData(history);
        }
      } catch (error) {
        // Failed to fetch EPS trend data
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();
  }, [symbol]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // If no historical data but we have TTM EPS, show it prominently
  if (!data || !data.history || data.history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            EPS Trend
            {data?.ttmEps != null && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (TTM: ${data.ttmEps.toFixed(2)})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.ttmEps != null ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <p className="text-3xl font-bold text-primary font-mono">
                ${data.ttmEps.toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">Trailing Twelve Months EPS</p>
              <p className="text-xs text-muted-foreground mt-4">
                Historical quarterly EPS data not available
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No EPS data available</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data - take last 20 quarters for readability
  const chartData = data.history
    .slice(0, 20)
    .map((point) => {
      let dateLabel = '';
      if (point.date) {
        try {
          const date = parseISO(point.date);
          dateLabel = format(date, 'MMM yyyy');
        } catch {
          dateLabel = point.date;
        }
      }
      return {
        date: dateLabel,
        eps: point.eps,
        quarter: point.quarter,
      };
    })
    .reverse(); // Reverse to show chronological order

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5" />
          EPS Trend
          {data.ttmEps != null && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              (TTM: ${data.ttmEps.toFixed(2)})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="w-full" style={{ minHeight: '300px' }}>
        <ResponsiveContainer width="100%" height={300} minHeight={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'EPS']}
            />
            <Line
              type="monotone"
              dataKey="eps"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            {data.ttmEps != null && (
              <ReferenceLine
                y={data.ttmEps}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                label={{ value: 'TTM', position: 'right' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

