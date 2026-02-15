import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/prices
 * Proxy to FastAPI /prices endpoint
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '365', 10);

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FastAPI not configured' },
        { status: 500 }
      );
    }

    const res = await fetch(`${env.fastapiBaseUrl}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: upperSymbol, days }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch prices from FastAPI' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error fetching prices:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch prices',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

