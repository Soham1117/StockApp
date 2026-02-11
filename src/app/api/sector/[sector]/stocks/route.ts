import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { getStocksForSector } from '@/lib/generated-data';
import type { StocksByMarketCap } from '@/types';

interface RouteContext {
  params: Promise<{ sector: string }>;
}

/**
 * GET /api/sector/[sector]/stocks
 * Returns stocks for a sector from:
 * - Full universe: data/sector-stocks.json            (default)
 * - Top 30 (10 per bucket): data/sector-stocks-top30.json, when ?topOnly=true
 *
 * Data is regenerated via:
 * - scripts/generate-universe.py       (base universe)
 * - scripts/select-top-stocks.py       (top-30 selection)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { sector } = await context.params;
    const decodedSector = decodeURIComponent(sector);

    const { searchParams } = new URL(request.url);
    const topOnly = searchParams.get('topOnly') === 'true';

    const cacheKey = `sector:stocks:${decodedSector}:topOnly=${topOnly ? '1' : '0'}:v2`;
    const cached = getFromCache<StocksByMarketCap>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    // Load pre-computed stocks for this sector
    const stocksData = await getStocksForSector(decodedSector, topOnly);

    if (!stocksData) {
      return NextResponse.json(
        {
          error: 'Sector not found',
          sector: decodedSector,
          topOnly,
          hint: 'Sector name must match defeatbeta sector names. Check /api/meta/industries for available sectors.',
        },
        { status: 404 }
      );
    }

    // Data is already bucketed and sorted from the generation script
    const data: StocksByMarketCap = {
      industry: decodedSector, // Keep field name for compatibility
      large: stocksData.large || [],
      mid: stocksData.mid || [],
      small: stocksData.small || [],
    };

    // Cache for 24 hours
    setCache(cacheKey, data, TTL.ONE_DAY);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch stocks',
        details:
          error instanceof Error
            ? error.message
            : 'Unknown error. Run scripts/generate-universe.py to generate data files.',
      },
      { status: 500 }
    );
  }
}

