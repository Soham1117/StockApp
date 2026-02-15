import { NextResponse } from 'next/server';
import { jobStore } from '@/lib/jobs';
import { getRRGHistory } from '@/services/rrg-service';
import { getIndustryStocks, analyzeIndustryBatched } from '@/services/analysis-service';
import { generateIndustryReport } from '@/services/report-service';

const SECTOR_ETFS: Array<{ symbol: string; label: string }> = [
  { symbol: 'XLK', label: 'Information Technology' },
  { symbol: 'XLF', label: 'Financials' },
  { symbol: 'XLY', label: 'Consumer Discretionary' },
  { symbol: 'XLP', label: 'Consumer Staples' },
  { symbol: 'XLI', label: 'Industrials' },
  { symbol: 'XLE', label: 'Energy' },
  { symbol: 'XLV', label: 'Health Care' },
  { symbol: 'XLB', label: 'Materials' },
  { symbol: 'XLU', label: 'Utilities' },
  { symbol: 'XLC', label: 'Communication Services' },
  { symbol: 'IYR', label: 'Real Estate' },
];

type PipelineRequest = {
  lookback_days?: number;
  top_n?: number;
  sector?: string;
  weights?: Record<string, number>;
  filters?: any;
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function runPipeline(jobId: string, body: PipelineRequest, origin: string) {
  try {
    const lookbackDays = clampInt(Number(body.lookback_days ?? 180), 30, 3600);
    const topN = clampInt(Number(body.top_n ?? 10), 1, 100);
    let selectedIndustry = typeof body.sector === 'string' ? body.sector.trim() : '';

    jobStore.updateJob(jobId, { status: 'PROCESSING', progress: 5 });

    // 1. Sector Selection (RRG)
    if (!selectedIndustry) {
      const symbolsStr = SECTOR_ETFS.map((s) => s.symbol).join(',');
      const historyData = await getRRGHistory({ 
        symbols: symbolsStr, 
        lookbackDays 
      });

      const points = historyData.data || [];
      const latestBySymbol = new Map<string, any>();
      for (const point of points) {
        const symbol = String(point.symbol).toUpperCase();
        const existing = latestBySymbol.get(symbol);
        if (!existing || point.date > existing.date) {
          latestBySymbol.set(symbol, point);
        }
      }

      const ranked = Array.from(latestBySymbol.entries())
        .map(([symbol, point]) => ({
          symbol,
          score: (Number(point.rsRatio) + Number(point.rsMomentum)) / 2
        }))
        .filter(row => Number.isFinite(row.score))
        .sort((a, b) => b.score - a.score);

      if (ranked.length === 0) throw new Error('No valid RRG scores available');
      
      const topSymbol = ranked[0].symbol;
      selectedIndustry = SECTOR_ETFS.find((s) => s.symbol === topSymbol)?.label || topSymbol;
    }

    jobStore.updateJob(jobId, { progress: 20 });

    // 2. Fetch Industry Stocks
    const stocksJson = await getIndustryStocks(selectedIndustry);
    const symbols: string[] = [
      ...(stocksJson.large || []),
      ...(stocksJson.mid || []),
      ...(stocksJson.small || []),
    ].map((s: any) => String(s.symbol || '').toUpperCase()).filter(Boolean);

    if (symbols.length === 0) throw new Error(`No symbols found for ${selectedIndustry}`);

    jobStore.updateJob(jobId, { progress: 30 });

    // 3. Batched Industry Analysis
    const analysisData = await analyzeIndustryBatched({
      industry: selectedIndustry,
      symbols,
      weights: body.weights,
      filters: body.filters,
      batchSize: 20
    }, (progress) => {
      // Scale analysis progress (30% to 70%)
      jobStore.updateJob(jobId, { progress: 30 + Math.round(progress * 0.4) });
    });

    const eligible = Array.isArray(analysisData.symbols)
      ? analysisData.symbols.filter((row: any) => row.passes_filters)
      : [];

    if (eligible.length === 0) throw new Error('No passing symbols for the selected industry.');

    const totalEligible = eligible.length;
    const rankMap: Record<string, { rank: number; total: number }> = {};
    eligible.forEach((row: any, idx: number) => {
      const symbol = String(row.symbol || '').toUpperCase();
      if (symbol) {
        rankMap[symbol] = { rank: idx + 1, total: totalEligible };
      }
    });

    const selected = eligible.slice(0, topN).map((row: any) => String(row.symbol || '').toUpperCase());

    jobStore.updateJob(jobId, { progress: 75 });

    // 4. Generate PDF Report
    const pdfBytes = await generateIndustryReport({
      industry: selectedIndustry,
      symbols: selected,
      baseUrl: origin,
      title: `Industry Report: ${selectedIndustry}`,
      rankings: rankMap
    });

    // Store PDF bytes as base64 for download
    const base64 = Buffer.from(pdfBytes).toString('base64');
    const filename = `industry_report_${selectedIndustry.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

    jobStore.completeJob(jobId, {
      pdfBase64: base64,
      filename,
      industry: selectedIndustry
    });
  } catch (error) {
    console.error(`[Pipeline Job ${jobId}] Failed:`, error);
    jobStore.failJob(jobId, error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PipelineRequest;
    const origin = new URL(request.url).origin;
    
    const jobId = jobStore.createJob();
    
    // Fire and forget (Next.js 15+ allows background tasks via `after` but for now we just don't await)
    runPipeline(jobId, body, origin);

    return NextResponse.json({ jobId });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Job creation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
