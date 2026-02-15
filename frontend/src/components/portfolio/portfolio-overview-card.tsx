'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { usePortfolioPrices } from '@/hooks/use-portfolio-prices';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function PortfolioOverviewCard() {
  const { holdings, refresh: refreshPortfolio } = usePortfolio();
  const { pricesMap, refetch: refetchPrices, isLoading, isFetching, lastUpdated } = usePortfolioPrices();

  const stats = useMemo(() => {
    if (holdings.length === 0) {
      return {
        totalCost: 0,
        totalValue: 0,
        totalPL: 0,
        totalPLPercent: 0,
        bestPerformer: null as { symbol: string; pl: number; plPercent: number } | null,
        worstPerformer: null as { symbol: string; pl: number; plPercent: number } | null,
      };
    }

    let totalCost = 0;
    let totalValue = 0;
    const performers: Array<{ symbol: string; pl: number; plPercent: number }> = [];

    holdings.forEach(holding => {
      const cost = holding.shares * holding.averageCost;
      totalCost += cost;

      const currentPrice = pricesMap.get(holding.symbol.toUpperCase());
      if (currentPrice && !isNaN(currentPrice) && isFinite(currentPrice)) {
        const value = holding.shares * currentPrice;
        totalValue += value;
        const pl = value - cost;
        const plPercent = cost > 0 ? (pl / cost) * 100 : 0;
        performers.push({ symbol: holding.symbol, pl, plPercent });
      } else {
        // If no price available, still count the cost but not the value
        // This ensures totalCost is always accurate
      }
    });

    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    // Find best and worst performers
    const sortedPerformers = [...performers].sort((a, b) => b.plPercent - a.plPercent);
    const bestPerformer = sortedPerformers.length > 0 ? sortedPerformers[0] : null;
    const worstPerformer = sortedPerformers.length > 0 ? sortedPerformers[sortedPerformers.length - 1] : null;

    return {
      totalCost,
      totalValue,
      totalPL,
      totalPLPercent,
      bestPerformer,
      worstPerformer,
    };
  }, [holdings, pricesMap]);

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatTimeAgo = () => {
    if (!lastUpdated) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastUpdated), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Add stocks to your portfolio to see overview statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Portfolio Overview</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              // Refresh portfolio first to get latest holdings
              await refreshPortfolio();
              // Then refetch prices with the updated holdings
              await refetchPrices();
            }}
            disabled={isFetching || isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={cn('h-4 w-4', (isFetching || isLoading) && 'animate-spin')} />
          </Button>
        </div>
        {lastUpdated > 0 && (
          <p className="text-xs text-muted-foreground">
            Updated {formatTimeAgo()}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Value */}
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Total Value</p>
              <p className="text-2xl font-bold font-mono">
                {formatCurrency(stats.totalValue)}
              </p>
            </div>

            {/* P&L */}
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
              <div className="flex items-baseline gap-1">
                {stats.totalPL >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <p
                  className={cn(
                    'text-xl font-bold font-mono',
                    stats.totalPL >= 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {stats.totalPL >= 0 ? '+' : ''}
                  {formatCurrency(stats.totalPL)}
                </p>
              </div>
              <p
                className={cn(
                  'text-sm font-semibold mt-1',
                  stats.totalPLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                )}
              >
                {stats.totalPLPercent >= 0 ? '+' : ''}
                {stats.totalPLPercent.toFixed(2)}%
              </p>
            </div>

            {/* Cost Basis */}
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Cost Basis</p>
              <p className="text-2xl font-bold font-mono">
                {formatCurrency(stats.totalCost)}
              </p>
            </div>

            {/* Best/Worst Performers Combined */}
            {(stats.bestPerformer || stats.worstPerformer) && (
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Top Performers</p>
                <div className="space-y-2">
                  {stats.bestPerformer && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono font-semibold">{stats.bestPerformer.symbol}</p>
                      <p className="text-sm text-green-500 font-mono font-semibold">
                        +{stats.bestPerformer.plPercent.toFixed(2)}%
                      </p>
                    </div>
                  )}
                  {stats.worstPerformer && stats.worstPerformer.symbol !== stats.bestPerformer?.symbol && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-mono font-semibold">{stats.worstPerformer.symbol}</p>
                      <p className="text-sm text-red-500 font-mono font-semibold">
                        {stats.worstPerformer.plPercent.toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
