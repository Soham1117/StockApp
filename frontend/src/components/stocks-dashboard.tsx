'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIndustryStocks, useIndustryMetrics } from '@/hooks/use-stocks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StocksTable } from '@/components/stocks-table';
import { MetricsCharts } from '@/components/metrics-charts';
import { AddStockDialog } from '@/components/add-stock-dialog';
import type { Stock, MarketCapBucket } from '@/types';

interface StocksDashboardProps {
  industry: string; // Actually sector now, keeping prop name for compatibility
}

export function StocksDashboard({ industry }: StocksDashboardProps) {
  // industry prop is actually a sector now
  const sector = industry;
  const router = useRouter();
  const [selectedBucket, setSelectedBucket] = useState<MarketCapBucket>('large');
  const [customStocks, setCustomStocks] = useState<Stock[]>([]);

  const { data: stocksData, isLoading: isLoadingStocks } = useIndustryStocks(sector);

  // Get all symbols for metrics fetching
  const allSymbols = useMemo(() => {
    if (!stocksData) return [];
    const stocks = [...stocksData.large, ...stocksData.mid, ...stocksData.small, ...customStocks];
    return stocks.map((s) => s.symbol);
  }, [stocksData, customStocks]);

  const { data: metricsData, isLoading: isLoadingMetrics } = useIndustryMetrics(
    sector,
    allSymbols
  );

  // Get stocks for current bucket
  const currentStocks = useMemo(() => {
    if (!stocksData) return [];
    const bucketStocks = stocksData[selectedBucket] || [];
    // Add custom stocks to the selected bucket view
    return [...bucketStocks, ...customStocks];
  }, [stocksData, selectedBucket, customStocks]);

  const handleSelectStock = (stock: Stock) => {
    router.push(`/stocks/${stock.symbol}`);
  };

  if (isLoadingStocks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!stocksData) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">No data available for this sector</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Multi-pane Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Panel: Market Cap Buckets */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-4 text-lg font-semibold">Market Cap</h3>
          <Tabs value={selectedBucket} onValueChange={(v) => setSelectedBucket(v as MarketCapBucket)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="large">Large</TabsTrigger>
              <TabsTrigger value="mid">Mid</TabsTrigger>
              <TabsTrigger value="small">Small</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {selectedBucket === 'large' && 'Market Cap > $10B'}
                {selectedBucket === 'mid' && 'Market Cap $2B - $10B'}
                {selectedBucket === 'small' && 'Market Cap $300M - $2B'}
              </p>
              <p className="mt-1 text-sm font-medium">
                {currentStocks.length} stocks
              </p>
            </div>

            <AddStockDialog
              onAddStock={(stock) => {
                setCustomStocks((prev) => [...prev, stock]);
              }}
            />
          </div>
        </Card>

        {/* Middle Panel: Stocks Table */}
        <Card className="lg:col-span-2">
          <StocksTable
            stocks={currentStocks}
            metrics={metricsData?.stocks || []}
            isLoading={isLoadingMetrics}
            onSelectStock={handleSelectStock}
            onRemoveStock={(symbol) => {
              setCustomStocks((prev) => prev.filter((s) => s.symbol !== symbol));
            }}
            customStockSymbols={customStocks.map((s) => s.symbol)}
          />
        </Card>
      </div>

      {/* Bottom Panel: Charts */}
      {metricsData && (
        <MetricsCharts
          metricsData={metricsData}
          selectedBucket={selectedBucket}
          stocksData={stocksData}
        />
      )}

    </div>
  );
}
