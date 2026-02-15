'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { X, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { Stock, StockMetrics } from '@/types';

interface StocksTableProps {
  stocks: Stock[];
  metrics: StockMetrics[];
  isLoading: boolean;
  onSelectStock: (stock: Stock) => void;
  onRemoveStock?: (symbol: string) => void;
  customStockSymbols?: string[];
}

type SortField = 'symbol' | 'marketCap' | 'score' | 'pe' | 'pb';
type SortDirection = 'asc' | 'desc' | null;

function formatMarketCap(marketCap: number): string {
  if (marketCap >= 1_000_000_000_000) {
    return `$${(marketCap / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (marketCap >= 1_000_000_000) {
    return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
  }
  if (marketCap >= 1_000_000) {
    return `$${(marketCap / 1_000_000).toFixed(2)}M`;
  }
  return `$${marketCap.toFixed(0)}`;
}

function getClassificationBadge(classification: string) {
  if (classification === 'GROWTH') {
    return <Badge variant="default">Growth</Badge>;
  }
  if (classification === 'VALUE') {
    return <Badge variant="secondary">Value</Badge>;
  }
  return <Badge variant="outline">Blend</Badge>;
}

const STOCKS_PER_PAGE = 10;

export function StocksTable({
  stocks,
  metrics,
  isLoading,
  onSelectStock,
  onRemoveStock,
  customStockSymbols = [],
}: StocksTableProps) {
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const prevStocksLengthRef = useRef(stocks.length);

  // Reset to page 1 when stocks change (using ref to track and defer update)
  useEffect(() => {
    if (prevStocksLengthRef.current !== stocks.length) {
      prevStocksLengthRef.current = stocks.length;
      // Defer state update to next tick to avoid synchronous setState warning
      queueMicrotask(() => {
        setCurrentPage(1);
      });
    }
  }, [stocks.length]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: desc -> asc -> null
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortDirection(null);
        setSortField('score'); // Reset to default
      } else {
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    }
    if (sortDirection === 'desc') {
      return <ArrowDown className="h-3 w-3 ml-1" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1" />;
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
  };

  const sortedStocks = useMemo(() => {
    if (!sortDirection || !sortField) {
      return stocks;
    }

    return [...stocks].sort((a, b) => {
      const aMetrics = metrics.find((m) => m.symbol === a.symbol);
      const bMetrics = metrics.find((m) => m.symbol === b.symbol);

      let aValue: number | string | undefined;
      let bValue: number | string | undefined;

      switch (sortField) {
        case 'symbol':
          aValue = a.symbol;
          bValue = b.symbol;
          break;
        case 'marketCap':
          aValue = a.marketCap;
          bValue = b.marketCap;
          break;
        case 'score':
          aValue = aMetrics?.growthValueScore?.score ?? -1;
          bValue = bMetrics?.growthValueScore?.score ?? -1;
          break;
        case 'pe':
          aValue = aMetrics?.ratios?.peRatioTTM ?? Infinity;
          bValue = bMetrics?.ratios?.peRatioTTM ?? Infinity;
          break;
        case 'pb':
          aValue = aMetrics?.ratios?.priceToBookRatioTTM ?? Infinity;
          bValue = bMetrics?.ratios?.priceToBookRatioTTM ?? Infinity;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'desc'
          ? bValue.localeCompare(aValue)
          : aValue.localeCompare(bValue);
      }

      const aNum = typeof aValue === 'number' ? aValue : 0;
      const bNum = typeof bValue === 'number' ? bValue : 0;

      return sortDirection === 'desc' ? bNum - aNum : aNum - bNum;
    });
  }, [stocks, metrics, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedStocks.length / STOCKS_PER_PAGE);
  const startIndex = (currentPage - 1) * STOCKS_PER_PAGE;
  const endIndex = startIndex + STOCKS_PER_PAGE;
  const paginatedStocks = sortedStocks.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">No stocks found</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {paginatedStocks.map((stock) => {
          const stockMetrics = metrics.find((m) => m.symbol === stock.symbol);
          const isRemovable = onRemoveStock && customStockSymbols.includes(stock.symbol);

          return (
            <button
              key={stock.symbol}
              className="w-full text-left rounded-lg border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/40"
              onClick={() => onSelectStock(stock)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-mono font-semibold">{stock.symbol}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{stock.companyName}</p>
                </div>
                {stockMetrics?.growthValueScore?.classification
                  ? getClassificationBadge(stockMetrics.growthValueScore.classification)
                  : <span className="text-xs text-muted-foreground">-</span>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Market Cap</p>
                  <p className="font-mono font-semibold">{formatMarketCap(stock.marketCap)}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-muted-foreground">Score</p>
                  <p className="font-mono font-semibold">
                    {stockMetrics?.growthValueScore?.score != null
                      ? stockMetrics.growthValueScore.score.toFixed(0)
                      : '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">P/E</p>
                  <p className="font-mono">
                    {stockMetrics?.ratios?.peRatioTTM?.toFixed(2) || '-'}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-muted-foreground">P/B</p>
                  <p className="font-mono">
                    {stockMetrics?.ratios?.priceToBookRatioTTM?.toFixed(2) || '-'}
                  </p>
                </div>
              </div>

              {isRemovable && (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStock(stock.symbol);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </button>
          );
        })}
        </div>

        {/* Pagination Controls - Mobile */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
    <div className="overflow-auto rounded-md border border-border custom-scrollbar">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-transparent text-[11px]"
                onClick={() => handleSort('symbol')}
              >
                Symbol
                {getSortIcon('symbol')}
              </Button>
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-transparent ml-auto text-[11px]"
                onClick={() => handleSort('marketCap')}
              >
                Market Cap
                {getSortIcon('marketCap')}
              </Button>
            </TableHead>
            <TableHead>Classification</TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-transparent ml-auto text-[11px]"
                onClick={() => handleSort('score')}
              >
                Score
                {getSortIcon('score')}
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-transparent ml-auto text-[11px]"
                onClick={() => handleSort('pe')}
              >
                P/E
                {getSortIcon('pe')}
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-transparent ml-auto text-[11px]"
                onClick={() => handleSort('pb')}
              >
                P/B
                {getSortIcon('pb')}
              </Button>
            </TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
            {paginatedStocks.map((stock) => {
            const stockMetrics = metrics.find((m) => m.symbol === stock.symbol);

            return (
              <TableRow
                key={stock.symbol}
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                onClick={() => onSelectStock(stock)}
              >
                <TableCell className="font-mono font-medium">{stock.symbol}</TableCell>
                <TableCell className="max-w-[200px] truncate">{stock.companyName}</TableCell>
                <TableCell className="text-right">{formatMarketCap(stock.marketCap)}</TableCell>
                <TableCell>
                  {stockMetrics?.growthValueScore?.classification
                    ? getClassificationBadge(stockMetrics.growthValueScore.classification)
                    : <span className="text-muted-foreground text-sm">-</span>}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {stockMetrics?.growthValueScore?.score != null
                    ? stockMetrics.growthValueScore.score.toFixed(0)
                    : '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {stockMetrics?.ratios?.peRatioTTM?.toFixed(2) || '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {stockMetrics?.ratios?.priceToBookRatioTTM?.toFixed(2) || '-'}
                </TableCell>
                <TableCell>
                  {onRemoveStock && customStockSymbols.includes(stock.symbol) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveStock(stock.symbol);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* Pagination Controls - Desktop */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Page {currentPage} of {totalPages} ({sortedStocks.length} stocks)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

