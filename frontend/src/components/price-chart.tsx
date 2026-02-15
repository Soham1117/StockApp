'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PriceChartProps {
  symbol: string;
}

type Timeframe = '1M' | '3M' | '6M' | '1Y' | '5Y';

const timeframeDays: Record<Timeframe, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '5Y': 1825,
};

export function PriceChart({ symbol }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [prices, setPrices] = useState<Array<{ date: string; close: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const days = timeframeDays[timeframe];
        // Use Next.js API route as proxy to FastAPI
        const res = await fetch(`/api/stocks/${symbol}/prices?days=${days}`);

        if (!res.ok) {
          throw new Error('Failed to fetch prices');
        }

        const data = await res.json();
        const closes = data.closes || [];

        // Create chart data (simplified - in real app, you'd have dates)
        const chartData = closes.map((price: number, index: number) => ({
          date: `Day ${index + 1}`,
          close: price,
        }));

        setPrices(chartData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load price data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
  }, [symbol, timeframe]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Price Chart</CardTitle>
          <div className="flex gap-2">
            {(['1M', '3M', '6M', '1Y', '5Y'] as Timeframe[]).map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : error ? (
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            <p>Error loading chart: {error}</p>
          </div>
        ) : prices.length === 0 ? (
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            <p>No price data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={prices}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#888', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 11 }}
                domain={['dataMin', 'dataMax']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                }}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#ff9f40"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

