'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import type { Stock } from '@/types';

interface AddStockDialogProps {
  onAddStock: (stock: Stock) => void;
}

export function AddStockDialog({ onAddStock }: AddStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!symbol.trim()) {
      setError('Please enter a stock symbol');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Fetch basic stock info via our API
      const response = await fetch(`/api/stocks/search?symbol=${symbol.toUpperCase()}`);

      if (!response.ok) {
        throw new Error('Stock not found');
      }

      const newStock: Stock = await response.json();
      onAddStock(newStock);
      setOpen(false);
      setSymbol('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Custom Stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="symbol" className="text-sm font-medium">
              Stock Symbol
            </label>
            <Input
              id="symbol"
              placeholder="e.g., AAPL"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? 'Searching...' : 'Add Stock'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
