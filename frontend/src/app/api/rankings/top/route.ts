import { NextResponse } from 'next/server';
import type { IndustryMetrics, StockMetrics, ValuationRatios, Stock } from '@/types';
import { loadSectorStocks } from '@/lib/generated-data';
import {
  loadPrecomputedSectorMetrics,
  buildIndustryMetricsFromRatios,
} from '@/app/api/sector/[sector]/metrics/route';

type Bucket = 'large' | 'mid' | 'small';

interface TopRankingQuery {
  sector?: string | null;
  bucket?: Bucket | null;
  limit?: number | null;
}

interface RankedStock {
  symbol: string;
  companyName: string;
  bucket: Bucket;
  score: number;
  classification: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorParam = searchParams.get('sector');
    const bucketParam = searchParams.get('bucket') as Bucket | null;
    const limitParam = searchParams.get('limit');

    if (!sectorParam) {
      return NextResponse.json(
        { error: 'sector query parameter is required' },
        { status: 400 }
      );
    }

    const limit = Math.max(
      1,
      Math.min(parseInt(limitParam || '10', 10) || 10, 50)
    );

    const sectorName = decodeURIComponent(sectorParam);
    const bucket: Bucket | null =
      bucketParam && ['large', 'mid', 'small'].includes(bucketParam)
        ? bucketParam
        : null;

    // Load sector stocks (buckets)
    const sectorStocksData = await loadSectorStocks(false);
    const sectorBuckets = (sectorStocksData as any)[sectorName] as {
      large: Stock[];
      mid: Stock[];
      small: Stock[];
    } | undefined;

    if (!sectorBuckets) {
      return NextResponse.json(
        { error: 'Sector not found in sector-stocks.json', sector: sectorName },
        { status: 404 }
      );
    }

    const bucketsToUse: Bucket[] = bucket
      ? [bucket]
      : (['large', 'mid', 'small'] as Bucket[]);

    const selectedStocks: Array<{ bucket: Bucket; stock: Stock }> = [];
    for (const b of bucketsToUse) {
      const list = sectorBuckets[b] || [];
      for (const s of list) {
        selectedStocks.push({ bucket: b, stock: s });
      }
    }

    if (!selectedStocks.length) {
      return NextResponse.json(
        {
          error: 'No stocks found in requested sector/buckets',
          sector: sectorName,
          bucket,
        },
        { status: 404 }
      );
    }

    const symbols = Array.from(
      new Set(selectedStocks.map((s) => s.stock.symbol.toUpperCase()))
    );

    // Load precomputed metrics for the sector
    const precomputed = await loadPrecomputedSectorMetrics();
    const sectorEntry = precomputed?.[sectorName];
    if (!sectorEntry?.metrics?.length) {
      return NextResponse.json(
        {
          error: 'No precomputed metrics for sector',
          sector: sectorName,
        },
        { status: 500 }
      );
    }

    const symbolToMetrics = new Map<string, ValuationRatios>();
    for (const m of sectorEntry.metrics) {
      const s = (m.symbol || '').toUpperCase();
      if (!s) continue;
      symbolToMetrics.set(s, {
        symbol: s,
        marketCap: typeof m.marketCap === 'number' ? m.marketCap : undefined,
        sharesOutstanding:
          typeof m.sharesOutstanding === 'number' ? m.sharesOutstanding : undefined,
        peRatioTTM: typeof m.peRatioTTM === 'number' ? m.peRatioTTM : undefined,
        priceToSalesRatioTTM:
          typeof m.priceToSalesRatioTTM === 'number' ? m.priceToSalesRatioTTM : undefined,
        priceToBookRatioTTM:
          typeof m.priceToBookRatioTTM === 'number' ? m.priceToBookRatioTTM : undefined,
        enterpriseValueOverEBITTTM:
          typeof m.enterpriseValueOverEBITTTM === 'number'
            ? m.enterpriseValueOverEBITTTM
            : undefined,
        enterpriseValueOverEBITDATTM:
          typeof m.enterpriseValueOverEBITDATTM === 'number'
            ? m.enterpriseValueOverEBITDATTM
            : undefined,
        enterpriseValueToSalesTTM:
          typeof m.enterpriseValueToSalesTTM === 'number'
            ? m.enterpriseValueToSalesTTM
            : undefined,
        dividendYieldTTM:
          typeof m.dividendYieldTTM === 'number' ? m.dividendYieldTTM : undefined,
        revenueGrowthTTM:
          typeof m.revenueGrowthTTM === 'number'
            ? m.revenueGrowthTTM
            : typeof (m as any).growth?.revenueGrowthTTM === 'number'
              ? (m as any).growth.revenueGrowthTTM
              : undefined,
        profitability: (m as any).profitability,
        financialHealth: (m as any).financialHealth,
        cashFlow: (m as any).cashFlow,
        growth: (m as any).growth,
        valuationExtras: (m as any).valuationExtras,
      });
    }

    const ratios: ValuationRatios[] = symbols
      .map((s) => symbolToMetrics.get(s))
      .filter((v): v is ValuationRatios => Boolean(v));

    if (!ratios.length) {
      return NextResponse.json(
        {
          error: 'No metrics available for selected symbols',
          sector: sectorName,
          symbols,
        },
        { status: 500 }
      );
    }

    const industryMetrics: IndustryMetrics = buildIndustryMetricsFromRatios(
      sectorName,
      ratios,
      ratios
    );

    const stocksWithScores: RankedStock[] = [];
    for (const { bucket: b, stock } of selectedStocks) {
      const metrics = industryMetrics.stocks.find(
        (m) => m.symbol === stock.symbol.toUpperCase()
      );
      if (!metrics) continue;
      const score = metrics.growthValueScore?.score ?? 0;
      const classification = metrics.growthValueScore?.classification ?? 'BLEND';
      stocksWithScores.push({
        symbol: stock.symbol.toUpperCase(),
        companyName: stock.companyName,
        bucket: b,
        score,
        classification,
      });
    }

    if (!stocksWithScores.length) {
      return NextResponse.json(
        {
          error: 'No scores computed for selected stocks',
          sector: sectorName,
          bucket,
        },
        { status: 500 }
      );
    }

    const byBucket: Record<Bucket, RankedStock[]> = {
      large: [],
      mid: [],
      small: [],
    };

    for (const s of stocksWithScores) {
      byBucket[s.bucket].push(s);
    }

    for (const b of ['large', 'mid', 'small'] as Bucket[]) {
      byBucket[b].sort((a, b2) => b2.score - a.score);
    }

    const resultBuckets = bucket ? [bucket] : (['large', 'mid', 'small'] as Bucket[]);

    const result: Record<string, RankedStock[]> = {};
    for (const b of resultBuckets) {
      result[b] = byBucket[b].slice(0, limit);
    }

    return NextResponse.json({
      sector: sectorName,
      bucket: bucket ?? null,
      limit,
      rankings: result,
    });
  } catch (error) {
    console.error('[API] Error computing rankings:', error);
    return NextResponse.json(
      {
        error: 'Failed to compute rankings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


