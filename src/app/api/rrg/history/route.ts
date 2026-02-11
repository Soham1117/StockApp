import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RRGHistoryPoint {
  symbol: string;
  date: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: string;
  lookback_days: number;
}

interface RRGHistoryResponse {
  benchmark: string;
  lookback_days: number;
  interval: string;
  start_date: string;
  end_date: string;
  symbols: string[];
  total_points: number;
  data: RRGHistoryPoint[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const lookbackDays = searchParams.get('lookback_days') || '180';

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    // Build query params
    const params = new URLSearchParams({
      lookback_days: lookbackDays,
    });

    if (symbols) params.set('symbols', symbols);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);

    const response = await fetch(
      `${env.fastapiBaseUrl}/rrg/history?${params.toString()}`
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch RRG history: ${response.status} ${text}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as RRGHistoryResponse;
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error fetching RRG history:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch RRG history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

