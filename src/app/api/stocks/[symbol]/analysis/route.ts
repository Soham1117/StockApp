import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { ComprehensiveAnalysis } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/analysis
 * Fetch comprehensive analysis (DCF, factor scores, investment signal) from FastAPI
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

    const apiRes = await fetch(`${env.fastapiBaseUrl}/analysis/comprehensive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [upperSymbol] }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text().catch(() => '');
      console.error(`[API] Comprehensive analysis error for ${upperSymbol}: ${apiRes.status} ${errorText}`);
      return NextResponse.json(
        { error: `FastAPI comprehensive analysis error: ${apiRes.status}` },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    const symbolData = data.analysis?.[0] as ComprehensiveAnalysis | undefined;

    if (!symbolData) {
      return NextResponse.json(
        { error: 'No analysis data returned' },
        { status: 404 }
      );
    }

    return NextResponse.json(symbolData);
  } catch (error) {
    console.error('[API] Comprehensive analysis proxy error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch comprehensive analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
