'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import type { Stock, StockMetrics } from '@/types';

interface OverviewPanelProps {
  stock: Stock;
  metrics?: StockMetrics;
}

export function OverviewPanel({ stock, metrics }: OverviewPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <TrendingUp className="h-6 w-6" />
          Investment Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div>
          <p className="text-base text-muted-foreground">Sector / Industry</p>
          <p className="text-lg font-medium">
            {stock.sector} / {stock.industry}
          </p>
        </div>

        <div>
          <p className="text-base text-muted-foreground">Market Cap</p>
          <p className="text-3xl font-bold text-primary font-mono">
            ${(stock.marketCap / 1_000_000_000).toFixed(2)}B
          </p>
        </div>

        {metrics && (
          <div>
            <p className="text-base text-muted-foreground mb-1">Score</p>
            <p className="text-2xl font-semibold">
              {metrics.growthValueScore.score.toFixed(0)} / 100
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

