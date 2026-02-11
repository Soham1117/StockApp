'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import type { PortfolioHolding } from '@/lib/portfolio-api';

interface EditHoldingDialogProps {
  holding: PortfolioHolding;
  onDelete?: () => void;
}

export function EditHoldingDialog({ holding, onDelete }: EditHoldingDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    shares: holding.shares,
    averageCost: holding.averageCost,
    purchaseDate: holding.purchaseDate,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { update, remove } = usePortfolio();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.shares <= 0) {
      setError('Shares must be greater than 0');
      return;
    }

    if (form.averageCost <= 0) {
      setError('Average cost must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      await update(holding.symbol, {
        shares: form.shares,
        averageCost: form.averageCost,
        purchaseDate: form.purchaseDate,
      });
      setOpen(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update holding');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${holding.symbol} from portfolio?`)) {
      return;
    }

    setLoading(true);
    try {
      await remove(holding.symbol);
      setOpen(false);
      if (onDelete) {
        onDelete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Holding - {holding.symbol}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Shares */}
          <div className="space-y-2">
            <Label htmlFor="shares">Number of Shares</Label>
            <Input
              id="shares"
              type="number"
              min="0"
              step="0.01"
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

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
