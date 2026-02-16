import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

function getUserId(request: Request): string {
  return request.headers.get('X-User-ID') || 'default';
}

/**
 * PUT /api/portfolio/holdings/[symbol]
 * Update a holding
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const { symbol } = await params;
    const body = await request.json();
    const res = await fetch(`${env.fastapiBaseUrl}/portfolio/holdings/${encodeURIComponent(symbol)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-ID': getUserId(request) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error updating holding:', error);
    return NextResponse.json(
      { error: 'Failed to update holding', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/holdings/[symbol]
 * Remove a holding
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const { symbol } = await params;
    const res = await fetch(`${env.fastapiBaseUrl}/portfolio/holdings/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error removing holding:', error);
    return NextResponse.json(
      { error: 'Failed to remove holding', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
