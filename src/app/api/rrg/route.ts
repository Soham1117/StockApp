import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { RRGData, RRGDataPoint } from '@/types';

/**
 * GET /api/rrg
 * Calculate Relative Rotation Graph data
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    const benchmark = searchParams.get('benchmark') || 'SPY';
    const daysParam = searchParams.get('days');
    // Support extended lookback up to 20 years (7300 days)
    const days = daysParam ? Math.max(30, Math.min(7300, Number(daysParam) || 180)) : 180;

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'symbols query parameter required' },
        { status: 400 }
      );
    }

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      symbols: symbols.join(','),
      benchmark,
      days: String(days),
    });

    const res = await fetch(`${env.fastapiBaseUrl}/rrg?${params.toString()}`);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Failed to fetch RRG snapshot: ${res.status} ${res.statusText}`,
          details: text,
        },
        { status: res.status }
      );
    }

    const result = (await res.json()) as RRGData;
    return NextResponse.json(result);

  } catch (error) {
    console.error('[API] Error calculating RRG:', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate RRG',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
