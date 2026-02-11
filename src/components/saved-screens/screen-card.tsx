'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Play, Trash2, Edit } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { SavedScreen } from '@/lib/saved-screens-api';

interface ScreenCardProps {
  screen: SavedScreen;
  onLoad: (screenId: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onRename?: (id: string, newName: string) => void;
}

export function ScreenCard({ screen, onLoad, onDelete, onRename }: ScreenCardProps) {
  const router = useRouter();

  const handleLoad = async () => {
    // Pass screen ID to onLoad, which will navigate to screener with the ID in URL
    await onLoad(screen.id);
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${screen.name}"?`)) {
      await onDelete(screen.id);
    }
  };

  const getFilterSummary = (): string => {
    const parts: string[] = [];

    if (screen.filters.country) {
      parts.push(screen.filters.country);
    }

    if (screen.filters.industry) {
      parts.push(screen.filters.industry);
    }

    if (screen.filters.cap && screen.filters.cap !== 'all') {
      const capLabels: Record<string, string> = {
        large: 'Large Cap',
        mid: 'Mid Cap',
        small: 'Small Cap',
      };
      parts.push(capLabels[screen.filters.cap]);
    }

    if (screen.filters.customRules && screen.filters.customRules.length > 0) {
      const activeRules = screen.filters.customRules.filter((r) => r.enabled).length;
      if (activeRules > 0) {
        parts.push(`${activeRules} custom rule${activeRules > 1 ? 's' : ''}`);
      }
    }

    return parts.length > 0 ? parts.join(' • ') : 'All filters';
  };

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{screen.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1 truncate">{getFilterSummary()}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLoad}>
                <Play className="mr-2 h-4 w-4" />
                Load Screen
              </DropdownMenuItem>
              {onRename && (
                <DropdownMenuItem onClick={() => onRename(screen.id, screen.name)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {screen.filters.country && (
              <Badge variant="outline">{screen.filters.country}</Badge>
            )}
            {screen.filters.industry && (
              <Badge variant="outline">{screen.filters.industry}</Badge>
            )}
            {screen.filters.cap && screen.filters.cap !== 'all' && (
              <Badge variant="outline">{screen.filters.cap}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(screen.lastUsed), { addSuffix: true })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
