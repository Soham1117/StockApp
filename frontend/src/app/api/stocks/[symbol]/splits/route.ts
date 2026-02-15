import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { StockSplit } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/splits
 * Fetch stock split history for a symbol from FastAPI
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const apiRes = await fetch(`${env.fastapiBaseUrl}/splits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [upperSymbol] }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      console.error(`[API] Splits proxy error: ${apiRes.status} ${apiRes.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch stock splits' },
        { status: 500 }
      );
    }

    const data = await apiRes.json();
    const splits = (data.splits || []) as Array<{ symbol: string; splits: StockSplit[] }>;
    const result = splits.find((s) => s.symbol === upperSymbol) || {
      symbol: upperSymbol,
      splits: [],
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Splits proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock splits' },
      { status: 500 }
    );
  }
}

