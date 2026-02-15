'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { IndustryAnalysisPanel } from '@/components/industry-analysis-panel';
import { IndustrySelector } from '@/components/industry-selector';

export default function IndustryAnalysisPage() {
  const router = useRouter();
  const params = useParams<{ industry?: string }>();
  const rawIndustry = params?.industry || '';
  const decodedIndustry = rawIndustry ? decodeURIComponent(rawIndustry) : '';
  const [selectedIndustry, setSelectedIndustry] = useState<string>(decodedIndustry);

  const handleIndustryChange = (sector: string) => {
    setSelectedIndustry(sector);
    router.push(`/industry/${encodeURIComponent(sector)}/analysis`);
  };

  return (
    <AppLayout>
      <div className="w-full px-2 py-2">
        <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between border-b border-border pb-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Industry Analysis: {decodedIndustry || 'Unknown'}
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Valuation-based ranking for all stocks in this industry, using your chosen weights.
            </p>
          </div>
          <div className="w-full max-w-[240px]">
            <IndustrySelector selectedIndustry={selectedIndustry || null} onSelectIndustry={handleIndustryChange} />
          </div>
        </div>
        <IndustryAnalysisPanel industry={decodedIndustry || undefined} capFilter="all" />
      </div>
    </AppLayout>
  );
}

