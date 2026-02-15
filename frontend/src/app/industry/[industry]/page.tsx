'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { StocksDashboard } from '@/components/stocks-dashboard';
import { useParams } from 'next/navigation';

export default function IndustryPage() {
  const params = useParams<{ industry?: string }>();
  const rawIndustry = params?.industry || '';
  const decodedIndustry = rawIndustry ? decodeURIComponent(rawIndustry) : 'Unknown';

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Industry Dashboard: {decodedIndustry}</h1>
          <p className="text-muted-foreground mt-1">
            Market-cap buckets, stock table, and relative rotation graph for this sector.
          </p>
        </div>
        {rawIndustry ? (
          <StocksDashboard industry={decodedIndustry} />
        ) : (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            No sector selected.
          </div>
        )}
      </div>
    </AppLayout>
  );
}


