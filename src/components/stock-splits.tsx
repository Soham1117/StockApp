'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Scissors } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { StockSplit } from '@/types';

interface StockSplitsProps {
  symbol: string;
}

export function StockSplits({ symbol }: StockSplitsProps) {
  const [data, setData] = useState<{ symbol: string; splits: StockSplit[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSplits() {
      try {
        const res = await fetch(`/api/stocks/${symbol}/splits`);
        if (res.ok) {
          const splits = await res.json();
          setData(splits);
        }
      } catch (error) {
        // Failed to fetch stock splits
      } finally {
        setIsLoading(false);
      }
    }

    fetchSplits();
  }, [symbol]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.splits || data.splits.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Scissors className="h-6 w-6" />
            Stock Splits
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-base text-muted-foreground">No stock split history available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Scissors className="h-6 w-6" />
          Stock Splits
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {data.splits.map((split, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1">
                {split.date && (
                  <p className="text-base font-medium">
                    {format(parseISO(split.date), 'MMM dd, yyyy')}
                  </p>
                )}
                {split.ratio && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Split Ratio: {split.ratio}
                  </p>
                )}
              </div>
              <div className="text-right">
                {split.from && split.to && (
                  <p className="text-base font-mono">
                    {split.from}:{split.to}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

