import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { EarningsCalendar } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/earnings/calendar
 * Fetch earnings calendar for a symbol from FastAPI
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

    const apiRes = await fetch(`${env.fastapiBaseUrl}/earnings/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: upperSymbol }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: `FastAPI earnings calendar error: ${apiRes.status}` },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    return NextResponse.json(data as EarningsCalendar);
  } catch (error) {
    console.error('[API] Earnings calendar proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch earnings calendar' },
      { status: 500 }
    );
  }
}

