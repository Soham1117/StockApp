import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_VERSION = 'v1';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface FinnhubPriceTarget {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
}

/**
 * GET /api/stocks/[symbol]/price-target
 * Fetch analyst price targets from Finnhub
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

    const cacheKey = `price-target:${upperSymbol}:${CACHE_VERSION}`;
    const cached = getFromCache<FinnhubPriceTarget>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    const url = `${FINNHUB_BASE}/stock/price-target?symbol=${upperSymbol}&token=${env.finnhubApiKey}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch price target', status: response.status },
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
        error: 'Failed to fetch price target',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
