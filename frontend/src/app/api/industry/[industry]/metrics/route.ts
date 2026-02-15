import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { calculateStats, classifyMetric, classifyGrowthValue } from '@/lib/classification';
import { env } from '@/lib/env';
import type {
  IndustryMetrics,
  StockMetrics,
  ValuationRatios,
  IndustryStats,
  MetricClassification,
} from '@/types';

interface RouteContext {
  params: Promise<{ industry: string }>;
}

/**
 * GET /api/industry/[industry]/metrics
 * Fetch valuation metrics for all stocks in an industry
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry);

    // Get symbols from query params
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'symbols query parameter required' },
        { status: 400 }
      );
    }

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());

    const cacheKey = `industry:metrics:${decodedIndustry}:${symbols.join(',')}:dfb1`;
    const cached = getFromCache<IndustryMetrics>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }

    const apiRes = await fetch(`${env.fastapiBaseUrl}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });

    if (!apiRes.ok) {
      throw new Error(`FastAPI metrics error: ${apiRes.status} ${apiRes.statusText}`);
    }

    const payload = await apiRes.json();
    const allRatios: ValuationRatios[] = (payload.metrics || []).map((m: Record<string, unknown>) => ({
      symbol: m.symbol,
      peRatioTTM: m.peRatioTTM,
      priceToSalesRatioTTM: m.priceToSalesRatioTTM,
      priceToBookRatioTTM: m.priceToBookRatioTTM,
      enterpriseValueOverEBITTTM: m.enterpriseValueOverEBITTTM,
      enterpriseValueOverEBITDATTM: m.enterpriseValueOverEBITDATTM,
      enterpriseValueToSalesTTM: m.enterpriseValueToSalesTTM,
      dividendYieldTTM: m.dividendYieldTTM,
      revenueGrowthTTM: m.revenueGrowthTTM,
    }));

    // Calculate industry statistics for each metric
    const metrics = [
      'peRatioTTM',
      'priceToSalesRatioTTM',
      'priceToBookRatioTTM',
      'enterpriseValueOverEBITTTM',
      'enterpriseValueOverEBITDATTM',
      'enterpriseValueToSalesTTM',
      'dividendYieldTTM',
      'revenueGrowthTTM',
    ];

    const industryStats: Record<string, IndustryStats> = {};

    for (const metric of metrics) {
      const values = allRatios
        .map((r) => r[metric as keyof ValuationRatios])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v));

      const stats = calculateStats(values);
      stats.metric = metric;
      industryStats[metric] = stats;
    }

    // Classify each stock
    const stockMetrics: StockMetrics[] = allRatios.map((ratios) => {
      const classifications: Record<string, MetricClassification> = {};

      for (const metric of metrics) {
        const value = ratios[metric as keyof ValuationRatios];
        if (value != null && typeof value === 'number' && industryStats[metric]) {
          classifications[metric] = classifyMetric(value, industryStats[metric]);
        }
      }

      const growthValueScore = classifyGrowthValue(ratios, industryStats);

      return {
        symbol: ratios.symbol,
        ratios,
        classifications,
        growthValueScore,
      };
    });

    const result: IndustryMetrics = {
      industry: decodedIndustry,
      stocks: stockMetrics,
      industryStats,
    };

    // Cache for 12 hours
    setCache(cacheKey, result, TTL.TWELVE_HOURS);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error fetching metrics:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
