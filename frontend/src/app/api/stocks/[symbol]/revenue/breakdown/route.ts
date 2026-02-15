import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { RevenueBreakdown } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/revenue/breakdown
 * Fetch revenue breakdown for a symbol from FastAPI
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

    const apiRes = await fetch(`${env.fastapiBaseUrl}/revenue/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [upperSymbol] }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      console.error(`[API] Revenue breakdown proxy error: ${apiRes.status} ${apiRes.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch revenue breakdown' },
        { status: 500 }
      );
    }

    const data = await apiRes.json();
    const breakdowns = (data.breakdown || []) as RevenueBreakdown[];
    const result = breakdowns.find((b) => b.symbol === upperSymbol) || {
      symbol: upperSymbol,
      geography: [],
      segments: [],
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Revenue breakdown proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue breakdown' },
      { status: 500 }
    );
  }
}

