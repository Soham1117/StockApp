import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RRGPrediction {
  symbol: string;
  horizon_days: number;
  lookback_days: number;
  predicted_rsRatio: number;
  predicted_rsMomentum: number;
  predicted_quadrant: string;
  confidence: number;
  rsRatio_range: { lower: number; upper: number };
  rsMomentum_range: { lower: number; upper: number };
}

interface RRGPredictResponse {
  predictions: RRGPrediction[];
  horizon_days: number;
  lookback_days: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbols, horizon_days = 30, lookback_days = 180 } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'symbols array required' },
        { status: 400 }
      );
    }

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`${env.fastapiBaseUrl}/rrg/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols,
        horizon_days,
        lookback_days,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch predictions: ${response.status} ${text}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as RRGPredictResponse;
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error fetching RRG predictions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch RRG predictions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

