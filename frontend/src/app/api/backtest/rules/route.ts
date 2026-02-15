import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * GET /api/backtest/rules
 *
 * Proxies to FastAPI:
 *   GET {FASTAPI_BASE_URL}/api/backtest/rules
 *
 * Query params are forwarded directly to FastAPI.
 */
export async function GET(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const apiUrl = `${env.fastapiBaseUrl}/api/backtest/rules${queryString ? `?${queryString}` : ''}`;

    const apiRes = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => apiRes.statusText);
      return NextResponse.json(
        { error: 'FastAPI backtest rules error', status: apiRes.status, detail },
        { status: 502 }
      );
    }

    const data = await apiRes.json();

    // Cache for 5 minutes since data is precomputed and static
    const resp = NextResponse.json(data);
    resp.headers.set('cache-control', 'public, max-age=300');
    return resp;
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch backtest rules', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
