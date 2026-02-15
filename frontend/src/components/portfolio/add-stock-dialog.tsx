'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { cn } from '@/lib/utils';

interface AddStockForm {
  symbol: string;
  shares: number;
  averageCost: number;
  purchaseDate: string;
}

interface StockInfo {
  symbol: string;
  companyName: string;
  currentPrice?: number;
  sector?: string;
}

export function AddStockToPortfolioDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddStockForm>({
    symbol: '',
    shares: 0,
    averageCost: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
  });
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { add, hasHolding } = usePortfolio();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Search for stock when symbol changes
  useEffect(() => {
    if (!form.symbol.trim() || form.symbol.length < 1) {
      setStockInfo(null);
      return;
    }

    const searchStock = async () => {
      setSearching(true);
      setError('');
      try {
        // Search for stock
        const searchRes = await fetch(`/api/stocks/search?q=${encodeURIComponent(form.symbol)}`);
        if (searchRes.ok) {
          const data = await searchRes.json();
          const results = data.results || [];
          const match = results.find(
            (s: any) => s.symbol.toUpperCase() === form.symbol.toUpperCase()
          );

          if (match) {
            // Fetch current price
            try {
              const priceRes = await fetch(`/api/stocks/${match.symbol}/prices?days=1`);
              if (priceRes.ok) {
                const priceData = await priceRes.json();
                const closes = priceData.closes || [];
                const currentPrice = closes.length > 0 ? closes[closes.length - 1] : undefined;

                setStockInfo({
                  symbol: match.symbol,
                  companyName: match.name,
                  currentPrice,
                  sector: match.sector,
                });
              } else {
                setStockInfo({
                  symbol: match.symbol,
                  companyName: match.name,
                  sector: match.sector,
                });
              }
            } catch {
              setStockInfo({
                symbol: match.symbol,
                companyName: match.name,
                sector: match.sector,
              });
            }
          } else {
            setStockInfo(null);
            setError('Stock not found');
          }
        }
      } catch (err) {
        setError('Failed to search for stock');
        setStockInfo(null);
      } finally {
        setSearching(false);
      }
    };

    const timeoutId = setTimeout(searchStock, 500);
    return () => clearTimeout(timeoutId);
  }, [form.symbol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!stockInfo) {
      setError('Please search for a valid stock symbol');
      return;
    }

    if (form.shares <= 0) {
      setError('Shares must be greater than 0');
      return;
    }

    if (form.averageCost <= 0) {
      setError('Average cost must be greater than 0');
      return;
    }

    // Check if holding already exists
    if (hasHolding(form.symbol)) {
      setError('This stock is already in your portfolio. Use Edit instead.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const symbol = form.symbol.toUpperCase();
      await add({
        symbol,
        shares: form.shares,
        averageCost: form.averageCost,
        purchaseDate: form.purchaseDate,
      });

      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Invalidate prices query to trigger refetch with new symbols
      // The add() function already refreshes the portfolio state
      await queryClient.invalidateQueries({ queryKey: ['portfolio-prices'] });
      
      // Force a refetch of the portfolio prices with the new symbol
      await queryClient.refetchQueries({ queryKey: ['portfolio-prices'] });

      setOpen(false);
      setForm({
        symbol: '',
        shares: 0,
        averageCost: 0,
        purchaseDate: new Date().toISOString().split('T')[0],
      });
      setStockInfo(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stock to portfolio');
    } finally {
      setLoading(false);
    }
  };

  const totalInvestment = form.shares * form.averageCost;
  const unrealizedPL = stockInfo?.currentPrice
    ? form.shares * (stockInfo.currentPrice - form.averageCost)
    : null;
  const unrealizedPLPercent = stockInfo?.currentPrice && form.averageCost > 0
    ? ((stockInfo.currentPrice - form.averageCost) / form.averageCost) * 100
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Stock to Portfolio
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Stock to Portfolio</DialogTitle>
          <DialogDescription>
            Add a stock to your portfolio by entering the symbol, shares, and cost basis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol Search */}
          <div className="space-y-2">
            <Label htmlFor="symbol">Stock Symbol</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="symbol"
                placeholder="e.g., AAPL"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                className="flex-1"
              />
              {searching && (
                <div className="flex items-center px-3">
                  <Search className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {stockInfo && (
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-semibold">{stockInfo.symbol}</p>
                    <p className="text-sm text-muted-foreground">{stockInfo.companyName}</p>
                    {stockInfo.sector && (
                      <p className="text-xs text-muted-foreground">{stockInfo.sector}</p>
                    )}
                  </div>
                  {stockInfo.currentPrice && (
                    <div className="text-right">
                      <p className="font-mono font-semibold">${stockInfo.currentPrice.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Current Price</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Shares */}
          <div className="space-y-2">
            <Label htmlFor="shares">Number of Shares</Label>
            <Input
              id="shares"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={form.shares || ''}
              onChange={(e) => setForm({ ...form, shares: parseFloat(e.target.value) || 0 })}
              required
            />
          </div>

          {/* Average Cost */}
          <div className="space-y-2">
            <Label htmlFor="averageCost">Average Cost per Share ($)</Label>
            <Input
              id="averageCost"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.averageCost || ''}
              onChange={(e) => setForm({ ...form, averageCost: parseFloat(e.target.value) || 0 })}
              required
            />
          </div>

          {/* Purchase Date */}
          <div className="space-y-2">
            <Label htmlFor="purchaseDate">Purchase Date</Label>
            <Input
              id="purchaseDate"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Preview */}
          {form.shares > 0 && form.averageCost > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Investment:</span>
                <span className="font-mono font-semibold">${totalInvestment.toFixed(2)}</span>
              </div>
              {stockInfo?.currentPrice && unrealizedPL !== null && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Value:</span>
                    <span className="font-mono font-semibold">
                      ${(form.shares * stockInfo.currentPrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unrealized P&L:</span>
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'
                      )}
                    >
                      {unrealizedPL >= 0 ? (
                        <TrendingUp className="inline h-4 w-4 mr-1" />
                      ) : (
                        <TrendingDown className="inline h-4 w-4 mr-1" />
                      )}
                      ${Math.abs(unrealizedPL).toFixed(2)} (
                      {unrealizedPLPercent !== null && (
                        <span>{unrealizedPLPercent >= 0 ? '+' : ''}{unrealizedPLPercent.toFixed(2)}%</span>
                      )}
                      )
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setForm({
                  symbol: '',
                  shares: 0,
                  averageCost: 0,
                  purchaseDate: new Date().toISOString().split('T')[0],
                });
                setStockInfo(null);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !stockInfo || form.shares <= 0 || form.averageCost <= 0}>
              {loading ? 'Adding...' : 'Add to Portfolio'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
