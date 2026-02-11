import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ industry: string }>;
}

/**
 * POST /api/industry/[industry]/analysis
 *
 * Thin proxy to the FastAPI industry analysis endpoint:
 *   POST {FASTAPI_BASE_URL}/api/industry/{industry}/analysis
 *
 * Body:
 *   {
 *     symbols: string[];
 *     weights?: {
 *       pe?: number;
 *       ps?: number;
 *       pb?: number;
 *       ev_ebit?: number;
 *       ev_ebitda?: number;
 *     }
 *   }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry);

    if (!decodedIndustry.trim()) {
      return NextResponse.json(
        { error: 'Industry path parameter must be non-empty' },
        { status: 400 }
      );
    }

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null) as {
      symbols?: unknown;
      weights?: Record<string, number>;
      filters?: unknown;
      exclude_symbols?: unknown;
    } | null;

    if (!body || !Array.isArray(body.symbols) || body.symbols.length === 0) {
      return NextResponse.json(
        { error: 'Request body must include non-empty "symbols" array' },
        { status: 400 }
      );
    }

    const payload = {
      symbols: body.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
      weights: body.weights ?? undefined,
      filters: body.filters ?? undefined,
      exclude_symbols: Array.isArray(body.exclude_symbols)
        ? body.exclude_symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
        : undefined,
    };

    const apiRes = await fetch(
      `${env.fastapiBaseUrl}/api/industry/${encodeURIComponent(decodedIndustry)}/analysis`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!apiRes.ok) {
      const errorText = await apiRes.text().catch(() => apiRes.statusText);
      return NextResponse.json(
        {
          error: 'FastAPI industry analysis error',
          status: apiRes.status,
          details: errorText,
        },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error in industry analysis route:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform industry analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

