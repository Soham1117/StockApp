'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, Heart, Coins } from 'lucide-react';
import type { StockMetrics } from '@/types';

interface MetricsPanelProps {
  metrics?: StockMetrics;
  isLoading?: boolean;
}

// Helper to extract nested metric value
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

export function MetricsPanel({ metrics, isLoading }: MetricsPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No metrics available</p>
        </CardContent>
      </Card>
    );
  }

  const r = metrics.ratios;
  const c = metrics.classifications;

  const valuationMetrics: Array<{ key: string; label: string; format?: 'percent' | 'currency' }> = [
    { key: 'ttmEps', label: 'TTM EPS', format: 'currency' },
    { key: 'peRatioTTM', label: 'P/E Ratio' },
    { key: 'priceToSalesRatioTTM', label: 'P/S Ratio' },
    { key: 'priceToBookRatioTTM', label: 'P/B Ratio' },
    { key: 'enterpriseValueOverEBITTTM', label: 'EV/EBIT' },
    { key: 'enterpriseValueOverEBITDATTM', label: 'EV/EBITDA' },
    { key: 'enterpriseValueToSalesTTM', label: 'EV/Sales' },
    { key: 'dividendYieldTTM', label: 'Dividend Yield', format: 'percent' },
    { key: 'valuationExtras.forwardPE', label: 'Forward P/E' },
    { key: 'valuationExtras.pegRatio', label: 'PEG Ratio' },
  ];

  const profitabilityMetrics = [
    { key: 'profitability.roe', label: 'ROE' },
    { key: 'profitability.roa', label: 'ROA' },
    { key: 'profitability.roic', label: 'ROIC' },
    { key: 'profitability.grossMargin', label: 'Gross Margin' },
    { key: 'profitability.operatingMargin', label: 'Operating Margin' },
    { key: 'profitability.netMargin', label: 'Net Margin' },
    { key: 'profitability.ebitdaMargin', label: 'EBITDA Margin' },
  ];

  const financialHealthMetrics = [
    { key: 'financialHealth.debtToEquity', label: 'Debt/Equity' },
    { key: 'financialHealth.interestCoverage', label: 'Interest Coverage' },
    { key: 'financialHealth.currentRatio', label: 'Current Ratio' },
    { key: 'financialHealth.quickRatio', label: 'Quick Ratio' },
    { key: 'financialHealth.ocfToDebt', label: 'OCF/Debt' },
  ];

  const cashFlowMetrics = [
    { key: 'cashFlow.fcfTTM', label: 'FCF (TTM)' },
    { key: 'cashFlow.fcfMargin', label: 'FCF Margin' },
    { key: 'cashFlow.fcfYield', label: 'FCF Yield' },
    { key: 'cashFlow.ocfTTM', label: 'OCF (TTM)' },
  ];

  const growthMetrics = [
    { key: 'growth.revenueGrowthTTM', label: 'Revenue Growth (YoY)' },
    { key: 'growth.ebitGrowthTTM', label: 'EBIT Growth (YoY)' },
    { key: 'growth.epsGrowthTTM', label: 'EPS Growth (YoY)' },
    { key: 'growth.fcfGrowthTTM', label: 'FCF Growth (YoY)' },
  ];

  const renderMetricGrid = (metricList: Array<{ key: string; label: string; format?: 'percent' | 'currency' }>) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {metricList.map((metric) => {
        const value = getNestedMetricValue(r, metric.key);
        const classification = c[metric.key];

        if (value == null) {
          return null;
        }

        // Format value based on metric type
        let displayValue: string;
        if (metric.format === 'percent') {
          displayValue = (value * 100).toFixed(2) + '%';
        } else if (metric.format === 'currency') {
          displayValue = '$' + value.toFixed(2);
        } else if (typeof value === 'number' && value > 1000) {
          displayValue = value.toFixed(0);
        } else {
          displayValue = value.toFixed(2);
        }

        return (
          <div key={metric.key} className="space-y-1 p-2 rounded-md border border-border/40">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold font-mono">
                {displayValue}
              </p>
              {classification && (
                <Badge variant="outline" className="text-sm">
                  {classification.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Detailed Metrics</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="valuation" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="valuation" className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5" />
              Valuation
            </TabsTrigger>
            <TabsTrigger value="profitability" className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Profitability
            </TabsTrigger>
            <TabsTrigger value="health" className="flex items-center gap-2 text-base">
              <Heart className="h-5 w-5" />
              Financial Health
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="flex items-center gap-2 text-base">
              <Coins className="h-5 w-5" />
              Cash Flow
            </TabsTrigger>
            <TabsTrigger value="growth" className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Growth
            </TabsTrigger>
          </TabsList>

          <TabsContent value="valuation" className="mt-3">
            {renderMetricGrid(valuationMetrics)}
          </TabsContent>

          <TabsContent value="profitability" className="mt-3">
            {renderMetricGrid(profitabilityMetrics)}
          </TabsContent>

          <TabsContent value="health" className="mt-3">
            {renderMetricGrid(financialHealthMetrics)}
          </TabsContent>

          <TabsContent value="cashflow" className="mt-3">
            {renderMetricGrid(cashFlowMetrics)}
          </TabsContent>

          <TabsContent value="growth" className="mt-3">
            {renderMetricGrid(growthMetrics)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

