import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_VERSION = 'v1';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface FinnhubRecommendation {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/**
 * GET /api/stocks/[symbol]/recommendations
 * Fetch analyst recommendation trends from Finnhub
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

    const cacheKey = `recommendations:${upperSymbol}:${CACHE_VERSION}`;
    const cached = getFromCache<FinnhubRecommendation[]>(cacheKey);

    if (cached) {
      return NextResponse.json({ symbol: upperSymbol, recommendations: cached });
    }

    const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${upperSymbol}&token=${env.finnhubApiKey}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch recommendations', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Cache for 1 week
    setCache(cacheKey, data, TTL.ONE_WEEK);

    return NextResponse.json({ symbol: upperSymbol, recommendations: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch recommendations',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
