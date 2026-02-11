'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScreenCard } from '@/components/saved-screens/screen-card';
import { useSavedScreens } from '@/hooks/use-saved-screens';
import { useScreenerFilters } from '@/hooks/use-screener-filters';
import { Plus } from 'lucide-react';

export default function SavedScreensPage() {
  const router = useRouter();
  const { screens, remove, update } = useSavedScreens();
  const { filters, updateFilter } = useScreenerFilters();
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({ open: false, id: '', name: '' });

  const handleLoad = async (screenId: string) => {
    const screen = screens.find((s) => s.id === screenId);
    const industry = screen?.filters?.industry || 'Technology';
    router.push(`/industry/${encodeURIComponent(industry)}/analysis?screen=${screenId}`);
  };

  const handleRename = (id: string, currentName: string) => {
    setRenameDialog({ open: true, id, name: currentName });
  };

  const handleRenameSave = async () => {
    if (!renameDialog.name.trim()) return;

    await update(renameDialog.id, { name: renameDialog.name.trim() });
    setRenameDialog({ open: false, id: '', name: '' });
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Saved Screens</h1>
            <p className="text-muted-foreground mt-1">
              Manage your saved screener filter configurations
            </p>
          </div>
          <Button onClick={() => router.push('/industry/Technology/analysis')}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Screen
          </Button>
        </div>

        {/* Screens Grid */}
        {screens.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No saved screens yet.</p>
            <p className="text-sm text-muted-foreground mb-6">
              Create filter configurations in the screener and save them for quick access.
            </p>
            <Button onClick={() => router.push('/industry/Technology/analysis')}>
              <Plus className="mr-2 h-4 w-4" />
              Go to Screener
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {screens.map((screen) => (
              <ScreenCard
                key={screen.id}
                screen={screen}
                onLoad={() => handleLoad(screen.id)}
                onDelete={remove}
                onRename={handleRename}
              />
            ))}
          </div>
        )}

        {/* Rename Dialog */}
        <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Screen</DialogTitle>
              <DialogDescription>Enter a new name for this screen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                value={renameDialog.name}
                onChange={(e) => setRenameDialog({ ...renameDialog, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSave();
                  }
                }}
                placeholder="Screen name"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRenameDialog({ ...renameDialog, open: false })}>
                  Cancel
                </Button>
                <Button onClick={handleRenameSave} disabled={!renameDialog.name.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
