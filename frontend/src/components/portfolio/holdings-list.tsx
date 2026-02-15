'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EditHoldingDialog } from './edit-holding-dialog';
import { usePortfolio } from '@/hooks/use-portfolio';
import type { PortfolioHolding } from '@/lib/portfolio-api';

interface HoldingWithPrice extends PortfolioHolding {
  currentPrice?: number;
  currentValue?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
}

export function HoldingsList() {
  const { holdings, refresh } = usePortfolio();
  const [holdingsWithPrices, setHoldingsWithPrices] = useState<HoldingWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch prices for all holdings
  useEffect(() => {
    const fetchPrices = async () => {
      if (holdings.length === 0) {
        setHoldingsWithPrices([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const symbols = holdings.map(h => h.symbol);
        
        // Fetch prices in batch via API route
        const res = await fetch('/api/portfolio/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols }),
        });

        if (res.ok) {
          const data = await res.json();
          const pricesMap = new Map<string, number>();
          
          // Extract latest price for each symbol
          (data.prices || []).forEach((p: { symbol: string; closes: number[] }) => {
            if (p.closes && p.closes.length > 0) {
              pricesMap.set(p.symbol.toUpperCase(), p.closes[p.closes.length - 1]);
            }
          });

          // Calculate values
          const holdingsWithPrices: HoldingWithPrice[] = holdings.map(holding => {
            const currentPrice = pricesMap.get(holding.symbol.toUpperCase());
            const currentValue = currentPrice ? holding.shares * currentPrice : undefined;
            const unrealizedPL = currentPrice
              ? holding.shares * (currentPrice - holding.averageCost)
              : undefined;
            const unrealizedPLPercent = currentPrice && holding.averageCost > 0
              ? ((currentPrice - holding.averageCost) / holding.averageCost) * 100
              : undefined;

            return {
              ...holding,
              currentPrice,
              currentValue,
              unrealizedPL,
              unrealizedPLPercent,
            };
          });

          setHoldingsWithPrices(holdingsWithPrices);
        } else {
          // Fallback: holdings without prices
          setHoldingsWithPrices(holdings.map(h => ({ ...h })));
        }
      } catch (error) {
        // Error fetching prices
        // Fallback: holdings without prices
        setHoldingsWithPrices(holdings.map(h => ({ ...h })));
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
  }, [holdings]); // Dependencies: holdings array - will re-run when holdings change

  const handleRowClick = (symbol: string) => {
    router.push(`/stocks/${symbol}`);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (holdingsWithPrices.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No holdings in your portfolio yet.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Add stocks to start tracking your portfolio.
        </p>
      </div>
    );
  }

  const totalValue = holdingsWithPrices.reduce((sum, h) => sum + (h.currentValue || 0), 0);
  const totalCost = holdingsWithPrices.reduce((sum, h) => sum + (h.shares * h.averageCost), 0);
  const totalPL = holdingsWithPrices.reduce((sum, h) => sum + (h.unrealizedPL || 0), 0);

  return (
    <div className="space-y-4">
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Shares</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdingsWithPrices.map((holding) => (
              <TableRow
                key={holding.symbol}
                className="cursor-pointer hover:bg-accent"
                onClick={() => handleRowClick(holding.symbol)}
              >
                <TableCell className="font-mono font-medium">{holding.symbol}</TableCell>
                <TableCell>{holding.shares.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">
                  ${holding.averageCost.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {holding.currentPrice ? `$${holding.currentPrice.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {holding.currentValue ? `$${holding.currentValue.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {holding.unrealizedPL !== undefined ? (
                    <span
                      className={
                        holding.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'
                      }
                    >
                      {holding.unrealizedPL >= 0 ? '+' : ''}
                      ${holding.unrealizedPL.toFixed(2)}
                      {holding.unrealizedPLPercent !== undefined && (
                        <span className="ml-1">
                          ({holding.unrealizedPLPercent >= 0 ? '+' : ''}
                          {holding.unrealizedPLPercent.toFixed(2)}%)
                        </span>
                      )}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <EditHoldingDialog 
                    holding={holding} 
                    onDelete={async () => {
                      await refresh();
                    }} 
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
