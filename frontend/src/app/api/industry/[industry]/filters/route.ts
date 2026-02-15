import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ industry: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry);
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'industry';

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const apiRes = await fetch(
      `${env.fastapiBaseUrl}/filters/default/${encodeURIComponent(scope)}/${encodeURIComponent(decodedIndustry)}`
    );

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => apiRes.statusText);
      return NextResponse.json(
        { error: 'Failed to load default filters', detail },
        { status: apiRes.status }
      );
    }

    const data = await apiRes.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch default filters',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry);
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'industry';

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null) as { filters?: unknown } | null;
    if (!body || !body.filters) {
      return NextResponse.json(
        { error: 'Request body must include filters object' },
        { status: 400 }
      );
    }

    const apiRes = await fetch(
      `${env.fastapiBaseUrl}/filters/default/${encodeURIComponent(scope)}/${encodeURIComponent(decodedIndustry)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          filters: body.filters,
        }),
      }
    );

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => apiRes.statusText);
      return NextResponse.json(
        { error: 'Failed to save default filters', detail },
        { status: apiRes.status }
      );
    }

    const data = await apiRes.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save default filters',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
