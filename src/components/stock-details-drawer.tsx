'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStockNews } from '@/hooks/use-stocks';
import { useExportStock } from '@/hooks/use-export';
import type { Stock, StockMetrics } from '@/types';
import { ExternalLink, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo } from 'react';

interface RedFlag {
  severity: 'high' | 'medium' | 'low';
  message: string;
}

function detectRedFlags(metrics?: StockMetrics): RedFlag[] {
  const flags: RedFlag[] = [];
  if (!metrics) return flags;

  const r = metrics.ratios;

  // High P/S + Low Growth
  const psRatio = r.priceToSalesRatioTTM;
  const revenueGrowth = r.revenueGrowthTTM ?? r.growth?.revenueGrowthTTM;
  if (psRatio != null && revenueGrowth != null) {
    if (psRatio > 10 && revenueGrowth < 0.05) {
      flags.push({
        severity: 'high',
        message: `High P/S ratio (${psRatio.toFixed(1)}) with low revenue growth (${(revenueGrowth * 100).toFixed(1)}%) - potential overvaluation`,
      });
    } else if (psRatio > 5 && revenueGrowth < 0.1) {
      flags.push({
        severity: 'medium',
        message: `Elevated P/S ratio (${psRatio.toFixed(1)}) with modest growth (${(revenueGrowth * 100).toFixed(1)}%)`,
      });
    }
  }

  // High Leverage
  const debtToEquity = r.financialHealth?.debtToEquity;
  if (debtToEquity != null) {
    if (debtToEquity > 2.0) {
      flags.push({
        severity: 'high',
        message: `High debt-to-equity ratio (${debtToEquity.toFixed(2)}) - elevated financial risk`,
      });
    } else if (debtToEquity > 1.0) {
      flags.push({
        severity: 'medium',
        message: `Moderate leverage (debt-to-equity: ${debtToEquity.toFixed(2)})`,
      });
    }
  }

  // Negative FCF
  const fcfYield = r.cashFlow?.fcfYield;
  const fcfTTM = r.cashFlow?.fcfTTM;
  if (fcfYield != null && fcfYield < 0) {
    flags.push({
      severity: 'high',
      message: `Negative FCF yield (${(fcfYield * 100).toFixed(1)}%) - company burning cash`,
    });
  } else if (fcfTTM != null && fcfTTM < 0) {
    flags.push({
      severity: 'high',
      message: `Negative free cash flow ($${Math.abs(fcfTTM / 1_000_000).toFixed(1)}M) - cash burn concern`,
    });
  }

  // Low Interest Coverage
  const interestCoverage = r.financialHealth?.interestCoverage;
  if (interestCoverage != null) {
    if (interestCoverage < 1.0) {
      flags.push({
        severity: 'high',
        message: `Interest coverage below 1.0 (${interestCoverage.toFixed(2)}) - cannot cover interest payments`,
      });
    } else if (interestCoverage < 2.0) {
      flags.push({
        severity: 'medium',
        message: `Low interest coverage (${interestCoverage.toFixed(2)}) - limited margin of safety`,
      });
    }
  }

  // Declining Margins (if we have historical data, this would be better)
  // For now, we'll flag very low margins
  const operatingMargin = r.profitability?.operatingMargin;
  if (operatingMargin != null && operatingMargin < 0) {
    flags.push({
      severity: 'high',
      message: `Negative operating margin (${(operatingMargin * 100).toFixed(1)}%) - unprofitable operations`,
    });
  }

  return flags;
}

interface StockDetailsDrawerProps {
  stock: Stock;
  metrics?: StockMetrics;
  open: boolean;
  onClose: () => void;
}

export function StockDetailsDrawer({ stock, metrics, open, onClose }: StockDetailsDrawerProps) {
  const { data: newsData, isLoading: isLoadingNews } = useStockNews(stock.symbol);

  // Separate hooks for JSON and Excel exports
  const {
    exportStock: exportJson,
    isLoading: isExportingJson,
    error: exportJsonError,
  } = useExportStock({
    symbol: stock.symbol,
    sector: stock.sector,
    format: 'json',
  });

  const {
    exportStock: exportExcel,
    isLoading: isExportingExcel,
    error: exportExcelError,
  } = useExportStock({
    symbol: stock.symbol,
    sector: stock.sector,
    format: 'xlsx',
  });

  // Filter news into recent (3 months) and older (rest of year)
  // Calculate dynamically so it updates if drawer stays open
  const { recentNews, olderNews } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const threeMonthsAgo = now - 90 * 24 * 60 * 60;
    const articles = newsData?.articles || [];
    return {
      recentNews: articles.filter((a) => a.datetime > threeMonthsAgo),
      olderNews: articles.filter((a) => a.datetime <= threeMonthsAgo),
    };
  }, [newsData?.articles]);

  const redFlags = detectRedFlags(metrics);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">{stock.symbol}</span>
              <span className="text-lg text-muted-foreground">{stock.companyName}</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportJson}
                disabled={isExportingJson}
                className="inline-flex items-center rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {isExportingJson ? 'Exporting…' : 'Export JSON'}
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={isExportingExcel}
                className="inline-flex items-center rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {isExportingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
            </div>
          </div>
          {(exportJsonError || exportExcelError) && (
            <p className="mt-1 text-xs text-red-500">
              Export failed:{' '}
              {(exportJsonError ?? exportExcelError)?.message}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] pr-4">
          {/* Red Flags Alert */}
          {redFlags.length > 0 && (
            <Card className="mb-4 border-red-500/30 bg-red-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  Red Flags ({redFlags.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {redFlags.map((flag, idx) => (
                    <div
                      key={idx}
                      className={`rounded-md border p-2 text-sm ${
                        flag.severity === 'high'
                          ? 'border-red-500/30 bg-red-500/10 text-red-400'
                          : flag.severity === 'medium'
                            ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {flag.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="news">News</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Investment Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Sector / Industry</p>
                    <p className="font-medium">
                      {stock.sector} / {stock.industry}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Market Cap</p>
                    <p className="text-xl font-bold text-primary">
                      ${(stock.marketCap / 1_000_000_000).toFixed(2)}B
                    </p>
                  </div>

                  {metrics && (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Classification</p>
                        <Badge
                          variant={
                            metrics.growthValueScore.classification === 'GROWTH'
                              ? 'default'
                              : metrics.growthValueScore.classification === 'VALUE'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="text-base px-4 py-2"
                        >
                          {metrics.growthValueScore.classification}
                        </Badge>
                        <p className="mt-2 text-sm">
                          Score: {metrics.growthValueScore.score.toFixed(0)} / 100
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Key Insights</p>
                        <ul className="space-y-1">
                          {metrics.growthValueScore.reasons.map((reason, i) => (
                            <li key={i} className="text-sm">
                              • {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Metrics Tab */}
            <TabsContent value="metrics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Valuation Ratios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics ? (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'peRatioTTM', label: 'P/E Ratio' },
                        { key: 'priceToSalesRatioTTM', label: 'P/S Ratio' },
                        { key: 'priceToBookRatioTTM', label: 'P/B Ratio' },
                        { key: 'enterpriseValueOverEBITTTM', label: 'EV/EBIT' },
                        { key: 'enterpriseValueOverEBITDATTM', label: 'EV/EBITDA' },
                        { key: 'dividendYieldTTM', label: 'Dividend Yield' },
                      ].map((metric) => {
                        const value = metrics.ratios[metric.key as keyof typeof metrics.ratios];
                        const classification = metrics.classifications[metric.key];

                        return (
                          <div key={metric.key} className="space-y-1">
                            <p className="text-sm text-muted-foreground">{metric.label}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-lg font-semibold">
                                {value != null && typeof value === 'number' ? value.toFixed(2) : 'N/A'}
                              </p>
                              {classification && (
                                <Badge variant="outline" className="text-xs">
                                  {classification.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No metrics available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* News Tab */}
            <TabsContent value="news" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent News (Last 3 Months)</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-auto">
                  {isLoadingNews ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : recentNews.length > 0 ? (
                    <div className="space-y-3">
                      {recentNews.slice(0, 6).map((article, i) => (
                        <a
                          key={i}
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm mb-1 group-hover:text-accent-foreground">{article.headline}</h4>
                              <p className="text-xs text-muted-foreground group-hover:text-accent-foreground/80">
                                {article.source} ·{' '}
                                {format(new Date(article.datetime * 1000), 'MMM dd, yyyy')}
                              </p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground flex-shrink-0 transition-colors" />
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No recent news available</p>
                  )}
                </CardContent>
              </Card>
              {olderNews.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Older Headlines</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-auto">
                    <div className="space-y-2">
                      {olderNews.slice(0, 6).map((article, i) => (
                        <a
                          key={i}
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors text-sm group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex-1 truncate group-hover:text-accent-foreground">{article.headline}</span>
                            <span className="text-xs text-muted-foreground group-hover:text-accent-foreground/80 whitespace-nowrap">
                              {format(new Date(article.datetime * 1000), 'MMM dd')}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
