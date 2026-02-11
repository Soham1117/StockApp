import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * POST /api/portfolio/prices
 * Fetch prices for multiple symbols (batch)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbols } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'symbols array required' },
        { status: 400 }
      );
    }

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FastAPI not configured' },
        { status: 500 }
      );
    }

    // Call FastAPI /prices/batch endpoint
    const res = await fetch(`${env.fastapiBaseUrl}/prices/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
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
    console.error('[API] Error fetching portfolio prices:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch prices',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
