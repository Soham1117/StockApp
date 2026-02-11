'use client';

import { useRouter } from 'next/navigation';
import { StockDetailsHeader } from './stock-details-header';
import { HealthStatusBar } from './health-status-bar';
import { QuickStatsBar } from './quick-stats-bar';
import { OverviewPanel } from './overview-panel';
import { MetricsPanel } from './metrics-panel';
import { HealthDashboard } from './health-dashboard';
import { ResearchReportPanel } from './research-report-panel';
import { NewsFeed } from './news-feed';
import { PriceChart } from './price-chart';
import { EPSTrendChart } from './eps-trend-chart';
import { RevenueBreakdown } from './revenue-breakdown';
import { useIndustryMetrics } from '@/hooks/use-stocks';
import type { Stock, StockMetrics } from '@/types';

interface StockDetailsPageProps {
  symbol: string;
  initialStock: Stock;
  sector: string;
}

export function StockDetailsPage({ symbol, initialStock, sector }: StockDetailsPageProps) {
  const router = useRouter();

  // Fetch metrics for this symbol
  const { data: metricsData, isLoading: isLoadingMetrics } = useIndustryMetrics(sector, [symbol]);
  const metrics: StockMetrics | undefined = metricsData?.stocks.find((m) => m.symbol === symbol);

  const handleBack = () => {
    router.push(`/?sector=${encodeURIComponent(sector)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <StockDetailsHeader
        stock={initialStock}
        sector={sector}
        onBack={handleBack}
      />

      {/* Health Status Bar and Quick Stats Bar - Side by Side (1/3 and 2/3) */}
      <div className="w-full px-3 py-2">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <HealthStatusBar metrics={metrics} />
          </div>
          <div className="lg:col-span-2">
            <QuickStatsBar stock={initialStock} metrics={metrics} />
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="w-full px-3 py-2">
        {/* Detailed Metrics Panel - Moved Up */}
        <div className="mb-3">
          <MetricsPanel metrics={metrics} isLoading={isLoadingMetrics} />
        </div>

        {/* Bento-style Grid Layout - Uses all available space */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Left Column - Overview (4 columns) */}
          <div className="lg:col-span-4">
            <OverviewPanel stock={initialStock} metrics={metrics} />
          </div>

          {/* Right Column - Price Chart (8 columns) */}
          <div className="lg:col-span-8">
            <PriceChart symbol={symbol} />
          </div>
        </div>

        {/* Health Dashboard and EPS Trend - Side by Side */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 mt-3">
          <HealthDashboard metrics={metrics} />
          <EPSTrendChart symbol={symbol} />
        </div>

        {/* News */}
        <div className="mt-3">
          <NewsFeed symbol={symbol} />
        </div>

        {/* Revenue Breakdown - Full Width at Bottom */}
        <div className="mt-3">
          <RevenueBreakdown symbol={symbol} />
        </div>

        {/* Research Report - Full Width */}
        <div className="mt-3">
          <ResearchReportPanel symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

