import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { TranscriptMetadata } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/transcripts
 * Fetch earnings call transcripts metadata for a symbol from FastAPI with pagination
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    if (!env.fastapiBaseUrl) {
      return NextResponse.json(
        { error: 'FASTAPI_BASE_URL not configured' },
        { status: 500 }
      );
    }

    const apiRes = await fetch(`${env.fastapiBaseUrl}/transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        symbols: [upperSymbol],
        page,
        limit,
      }),
      cache: 'no-store',
    });

    if (!apiRes.ok) {
      console.error(`[API] Transcripts proxy error: ${apiRes.status} ${apiRes.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch transcripts' },
        { status: 500 }
      );
    }

    const data = await apiRes.json();
    
    // Filter transcripts for this symbol and return with pagination
    const allTranscripts = (data.transcripts || []) as Array<TranscriptMetadata & { symbol?: string }>;
    const symbolTranscripts = allTranscripts.filter((t) => t.symbol === upperSymbol);

    return NextResponse.json({
      symbol: upperSymbol,
      transcripts: symbolTranscripts,
      pagination: data.pagination || {
        page,
        limit,
        total: symbolTranscripts.length,
        totalPages: Math.ceil(symbolTranscripts.length / limit),
        hasMore: false,
      },
    });
  } catch (error) {
    console.error('[API] Transcripts proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

