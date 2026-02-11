'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddStockToPortfolioDialog } from '@/components/portfolio/add-stock-dialog';
import { HoldingsList } from '@/components/portfolio/holdings-list';
import { PortfolioOverviewCard } from '@/components/portfolio/portfolio-overview-card';
import { PortfolioNewsSection } from '@/components/portfolio/portfolio-news-section';
import { usePortfolio } from '@/hooks/use-portfolio';

export default function PortfolioPage() {
  const { holdings } = usePortfolio();

  return (
    <AppLayout>
      <div className="w-full px-2 py-2 space-y-1.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Portfolio</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Track your stock holdings and performance
            </p>
          </div>
          <AddStockToPortfolioDialog />
        </div>

        {/* Portfolio Overview */}
        <PortfolioOverviewCard />

        {/* Holdings List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Holdings</span>
              <span className="text-sm font-normal text-muted-foreground">
                {holdings.length} {holdings.length === 1 ? 'stock' : 'stocks'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HoldingsList key={holdings.map(h => `${h.symbol}-${h.shares}`).join(',')} />
          </CardContent>
        </Card>

        {/* Portfolio News */}
        <PortfolioNewsSection />
      </div>
    </AppLayout>
  );
}
