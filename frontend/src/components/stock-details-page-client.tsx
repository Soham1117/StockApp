'use client';

import dynamic from 'next/dynamic';
import type { Stock } from '@/types';

// Dynamically import StockDetailsPage with SSR disabled to prevent hydration mismatches
// This is necessary because Radix UI components (Tabs, DropdownMenu) generate random IDs
// that differ between server and client renders, causing hydration errors
const StockDetailsPage = dynamic(
  () => import('./stock-details-page').then((mod) => ({ default: mod.StockDetailsPage })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading stock details...</p>
        </div>
      </div>
    ),
  }
);

interface StockDetailsPageClientProps {
  symbol: string;
  initialStock: Stock;
  sector: string;
}

export function StockDetailsPageClient({ symbol, initialStock, sector }: StockDetailsPageClientProps) {
  return <StockDetailsPage symbol={symbol} initialStock={initialStock} sector={sector} />;
}
