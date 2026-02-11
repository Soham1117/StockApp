import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_VERSION = 'v1';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface RevenueEstimate {
  period: string;
  revenueAvg: number;
  revenueHigh: number;
  revenueLow: number;
  numberAnalysts: number;
}

/**
 * GET /api/stocks/[symbol]/revenue-estimates
 * Fetch revenue estimates from Finnhub
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

    const cacheKey = `revenue-estimates:${upperSymbol}:${CACHE_VERSION}`;
    const cached = getFromCache<RevenueEstimate[]>(cacheKey);

    if (cached) {
      return NextResponse.json({ symbol: upperSymbol, data: cached });
    }

    const fetchFromFastAPI = async (): Promise<RevenueEstimate[] | null> => {
      if (!env.fastapiBaseUrl) return null;
      try {
        const apiRes = await fetch(`${env.fastapiBaseUrl}/revenue/estimates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [upperSymbol] }),
          cache: 'no-store',
        });

        if (!apiRes.ok) return null;
        const json = await apiRes.json().catch(() => null);
        const row = (json?.estimates || []).find((e: any) => e?.symbol === upperSymbol);
        const items = Array.isArray(row?.data) ? row.data : [];

        return items
          .map((item: any): RevenueEstimate | null => {
            const period = typeof item.period === 'string' ? item.period : '';
            const revenueAvg = Number(item.revenueAvg);
            const revenueHigh = Number(item.revenueHigh);
            const revenueLow = Number(item.revenueLow);
            const numberAnalysts = Number(item.numberAnalysts);

            if (!period) return null;
            if (![revenueAvg, revenueHigh, revenueLow, numberAnalysts].every((v) => Number.isFinite(v))) {
              return null;
            }

            return {
              period,
              revenueAvg,
              revenueHigh,
              revenueLow,
              numberAnalysts,
            };
          })
          .filter((v: RevenueEstimate | null): v is RevenueEstimate => Boolean(v));
      } catch {
        return null;
      }
    };

    const url = `${FINNHUB_BASE}/stock/revenue-estimates?symbol=${upperSymbol}&token=${env.finnhubApiKey}`;
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      const text = await response.text().catch(() => '');

      // Finnhub occasionally responds with non-JSON or tier errors; prefer defeatbeta-backed data if available.
      const fallback = await fetchFromFastAPI();
      if (fallback && fallback.length > 0) {
        setCache(cacheKey, fallback, TTL.ONE_WEEK);
        return NextResponse.json({ symbol: upperSymbol, data: fallback });
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch revenue estimates',
          status: response.status,
          details: text.slice(0, 500) || response.statusText,
        },
        { status: response.status }
      );
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      const text = await response.text().catch(() => '');

      const fallback = await fetchFromFastAPI();
      if (fallback && fallback.length > 0) {
        setCache(cacheKey, fallback, TTL.ONE_WEEK);
        return NextResponse.json({ symbol: upperSymbol, data: fallback });
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch revenue estimates',
          status: 502,
          details: `Expected JSON from Finnhub but got content-type "${contentType}". Body: ${text.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }

    const rawData = await response.json().catch(async () => {
      const text = await response.text().catch(() => '');
      throw new Error(text ? `Invalid JSON from Finnhub: ${text.slice(0, 200)}` : 'Invalid JSON from Finnhub');
    });

    const data = rawData?.data || [];

    // Cache for 1 week
    setCache(cacheKey, data, TTL.ONE_WEEK);

    return NextResponse.json({ symbol: upperSymbol, data });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch revenue estimates',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
