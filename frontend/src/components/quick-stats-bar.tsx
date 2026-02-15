'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Stock, StockMetrics } from '@/types';

interface QuickStatsBarProps {
  stock: Stock;
  metrics?: StockMetrics;
}

// Helper to get nested metric value
function getNestedMetricValue(obj: unknown, path: string): number | undefined {
  if (!obj || typeof obj !== 'object' || obj === null) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' && isFinite(current) ? current : undefined;
}

export function QuickStatsBar({ stock, metrics }: QuickStatsBarProps) {
  const pe = getNestedMetricValue(metrics?.ratios, 'peRatioTTM');
  const ps = getNestedMetricValue(metrics?.ratios, 'priceToSalesRatioTTM');
  const evEbitda = getNestedMetricValue(metrics?.ratios, 'enterpriseValueOverEBITDATTM');
  const dividendYield = getNestedMetricValue(metrics?.ratios, 'dividendYieldTTM');
  const growthScore = metrics?.growthValueScore?.score ?? 0;
  const classification = metrics?.growthValueScore?.classification;

  return (
    <Card className="h-full border-border/30">
      <CardContent className="p-4">
        {/* Top Row: Market Cap and Growth/Value Badge */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/30">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Market Cap
            </p>
            <p className="text-2xl font-bold font-mono text-foreground">
              ${(stock.marketCap / 1_000_000_000).toFixed(2)}B
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Classification
            </p>
            <Badge
              variant={
                classification === 'GROWTH'
                  ? 'default'
                  : classification === 'VALUE'
                    ? 'secondary'
                    : 'outline'
              }
              className="text-sm font-semibold px-3 py-1.5"
            >
              {classification ?? 'N/A'} ({growthScore.toFixed(0)})
            </Badge>
          </div>
        </div>

        {/* Valuation Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {pe != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                P/E Ratio
              </p>
              <p className="text-lg font-bold font-mono text-foreground">
                {pe.toFixed(2)}
              </p>
            </div>
          )}

          {ps != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                P/S Ratio
              </p>
              <p className="text-lg font-bold font-mono text-foreground">
                {ps.toFixed(2)}
              </p>
            </div>
          )}

          {evEbitda != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                EV/EBITDA
              </p>
              <p className="text-lg font-bold font-mono text-foreground">
                {evEbitda.toFixed(2)}
              </p>
            </div>
          )}

          {dividendYield != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dividend Yield
              </p>
              <p className="text-lg font-bold font-mono text-foreground">
                {(dividendYield * 100).toFixed(2)}%
              </p>
            </div>
          )}
        </div>

        {/* Sector/Industry Footer */}
        <div className="pt-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{stock.sector}</span>
            <span className="mx-2">/</span>
            <span>{stock.industry}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


