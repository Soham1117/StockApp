import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

function getUserId(request: Request): string {
  return request.headers.get('X-User-ID') || 'default';
}

/**
 * GET /api/saved-screens
 * List saved screens
 */
export async function GET(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const res = await fetch(`${env.fastapiBaseUrl}/saved-screens`, {
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error fetching saved screens:', error);
    return NextResponse.json(
      { error: 'Failed to fetch saved screens', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/saved-screens
 * Create a saved screen
 */
export async function POST(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const body = await request.json();
    const res = await fetch(`${env.fastapiBaseUrl}/saved-screens`, {
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
    console.error('[API] Error saving screen:', error);
    return NextResponse.json(
      { error: 'Failed to save screen', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
