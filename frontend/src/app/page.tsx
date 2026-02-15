'use client';

import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { SectorRRGEnhanced } from '@/components/sector-rrg-enhanced';
import { SectorTimeSeries } from '@/components/sector-timeseries';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <AppLayout>
      <div className="w-full px-2 py-2 space-y-1.5">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold">Market Overview</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              GICS sector rotation and sector performance overview.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/industry/Technology/analysis">Industry Analysis</Link>
            </Button>
          </div>
        </div>

        {/* Sector RRG always visible before diving into industries or screener */}
        <SectorRRGEnhanced />

        {/* Time-series chart showing sector performance over time */}
        <SectorTimeSeries />
      </div>
    </AppLayout>
  );
}
