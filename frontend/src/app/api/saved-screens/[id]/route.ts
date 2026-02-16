import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

function getUserId(request: Request): string {
  return request.headers.get('X-User-ID') || 'default';
}

/**
 * GET /api/saved-screens/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const { id } = await params;
    const res = await fetch(`${env.fastapiBaseUrl}/saved-screens/${id}`, {
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error fetching screen:', error);
    return NextResponse.json(
      { error: 'Failed to fetch screen', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/saved-screens/[id]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const { id } = await params;
    const body = await request.json();
    const res = await fetch(`${env.fastapiBaseUrl}/saved-screens/${id}`, {
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
    console.error('[API] Error updating screen:', error);
    return NextResponse.json(
      { error: 'Failed to update screen', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/saved-screens/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }
    const { id } = await params;
    const res = await fetch(`${env.fastapiBaseUrl}/saved-screens/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-ID': getUserId(request) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[API] Error deleting screen:', error);
    return NextResponse.json(
      { error: 'Failed to delete screen', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
