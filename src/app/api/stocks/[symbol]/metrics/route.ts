import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_VERSION = 'v1';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface FinnhubMetrics {
  metric: {
    '52WeekHigh': number;
    '52WeekLow': number;
    beta: number;
    dividendYieldIndicatedAnnual?: number;
    epsInclExtraItemsTTM?: number;
    peInclExtraTTM?: number;
    pbAnnual?: number;
    peExclExtraAnnual?: number;
    marketCapitalization?: number;
    [key: string]: any;
  };
  series?: {
    annual: Record<string, any>;
    quarterly: Record<string, any>;
  };
}

/**
 * GET /api/stocks/[symbol]/metrics
 * Fetch financial metrics including beta, dividend yield, and valuation ratios from Finnhub
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    if (!env.finnhubApiKey) {
      return NextResponse.json(
        { error: 'Finnhub API key not configured' },
        { status: 503 }
      );
    }

    const cacheKey = `metrics:${upperSymbol}:${CACHE_VERSION}`;
    const cached = getFromCache<FinnhubMetrics>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    const url = `${FINNHUB_BASE}/stock/metric?symbol=${upperSymbol}&metric=all&token=${env.finnhubApiKey}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch metrics', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Cache for 24 hours
    setCache(cacheKey, data, TTL.ONE_DAY);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
