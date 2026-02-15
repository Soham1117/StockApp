import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { EarningsHistory } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/earnings/history
 * Fetch historical EPS data for a symbol from FastAPI
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

    const apiRes = await fetch(`${env.fastapiBaseUrl}/earnings/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [upperSymbol] }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: `FastAPI earnings history error: ${apiRes.status}` },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    const earnings = (data.earnings || []) as EarningsHistory[];
    const result = earnings.find((e) => e.symbol === upperSymbol) || {
      symbol: upperSymbol,
      history: [],
      ttmEps: undefined,
    };

    return NextResponse.json(result as EarningsHistory);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch earnings history' },
      { status: 500 }
    );
  }
}

