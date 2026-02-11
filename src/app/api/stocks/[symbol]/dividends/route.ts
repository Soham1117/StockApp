import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface Dividend {
  date: string;
  amount: number;
  frequency?: string;
}

/**
 * GET /api/stocks/[symbol]/dividends
 * Fetch dividend history for a symbol from FastAPI
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

    const apiRes = await fetch(`${env.fastapiBaseUrl}/dividends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [upperSymbol] }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: `FastAPI dividends error: ${apiRes.status}` },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    const symbolData = data.dividends?.[0] || { symbol: upperSymbol, dividends: [] };

    return NextResponse.json(symbolData);
  } catch (error) {
    console.error('[API] Dividends proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dividends' },
      { status: 500 }
    );
  }
}
