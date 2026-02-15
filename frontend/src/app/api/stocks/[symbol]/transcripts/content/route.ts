import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/transcripts/content?year=YYYY&quarter=Q
 * Fetch full earnings call transcript paragraphs for a specific quarter.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const quarterParam = searchParams.get('quarter');

    if (!yearParam || !quarterParam) {
      return NextResponse.json(
        { error: 'year and quarter query parameters are required' },
        { status: 400 }
      );
    }

    const fiscal_year = Number(yearParam);
    const fiscal_quarter = Number(quarterParam);

    if (!Number.isFinite(fiscal_year) || !Number.isFinite(fiscal_quarter)) {
      return NextResponse.json(
        { error: 'year and quarter must be numeric' },
        { status: 400 }
      );
    }

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const apiRes = await fetch(`${env.fastapiBaseUrl}/transcripts/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: upperSymbol,
        fiscal_year,
        fiscal_quarter,
      }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      console.error(
        `[API] Transcripts content proxy error: ${apiRes.status} ${apiRes.statusText}`
      );
      return NextResponse.json(
        { error: 'Failed to fetch transcript content' },
        { status: 500 }
      );
    }

    const data = await apiRes.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Transcripts content proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript content' },
      { status: 500 }
    );
  }
}


