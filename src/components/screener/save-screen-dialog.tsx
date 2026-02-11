'use client';

import { useState } from 'react';
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
import { Save } from 'lucide-react';
import { useSavedScreens } from '@/hooks/use-saved-screens';
import type { ScreenerFilters } from '@/lib/saved-screens-api';

interface SaveScreenDialogProps {
  filters: ScreenerFilters;
  onSaved?: () => void;
}

export function SaveScreenDialog({ filters, onSaved }: SaveScreenDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { save } = useSavedScreens();

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Screen name is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await save(name.trim(), filters);
      setName('');
      setOpen(false);
      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save screen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save className="mr-2 h-4 w-4" />
          Save Screen
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save Screen</DialogTitle>
          <DialogDescription>
            Save your current filter configuration for quick access later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="screen-name">Screen Name</Label>
            <Input
              id="screen-name"
              placeholder="e.g., Tech Value Stocks"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSave();
                }
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
