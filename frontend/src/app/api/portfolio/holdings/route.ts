import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

function getUserId(request: Request): string {
  return request.headers.get('X-User-ID') || 'default';
}

/**
 * GET /api/portfolio/holdings
 * Fetch portfolio holdings from FastAPI
 */
export async function GET(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const res = await fetch(`${env.fastapiBaseUrl}/portfolio/holdings`, {
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error fetching portfolio holdings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch holdings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio/holdings
 * Add a holding
 */
export async function POST(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const body = await request.json();
    const res = await fetch(`${env.fastapiBaseUrl}/portfolio/holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-ID': getUserId(request) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error adding holding:', error);
    return NextResponse.json(
      { error: 'Failed to add holding', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/holdings
 * Clear all holdings
 */
export async function DELETE(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const res = await fetch(`${env.fastapiBaseUrl}/portfolio/holdings`, {
      method: 'DELETE',
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error clearing holdings:', error);
    return NextResponse.json(
      { error: 'Failed to clear holdings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
