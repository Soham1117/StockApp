import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { loadTickerUniverse, getStocksForSector } from '@/lib/generated-data';
import type { Stock, StocksByMarketCap } from '@/types';

interface RouteContext {
  params: Promise<{ industry: string }>;
}

/**
 * GET /api/industry/[industry]/stocks
 * Returns stocks for an industry from pre-computed industry-stocks.json.
 *
 * Data is regenerated weekly via scripts/generate-universe.py using defeatbeta.
 * Industry name should match defeatbeta industry names (from /api/meta/industries).
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { industry } = await context.params;
    const decodedIndustry = decodeURIComponent(industry);

    const cacheKey = `industry:stocks:${decodedIndustry}:v2`;
    const cached = getFromCache<StocksByMarketCap>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    // Load ticker universe and filter by industry
    const universe = await loadTickerUniverse();
    const matchingTickers = universe.tickers.filter(
      (t) => t.industry === decodedIndustry
    );

    let data: StocksByMarketCap | null = null;

    if (matchingTickers.length > 0) {
      // Map tickers to Stock shape; bucket by market cap is not available here,
      // so we return all in the "large" bucket for now.
      const mapped: Stock[] = matchingTickers.map((t) => ({
        symbol: t.symbol,
        companyName: t.symbol, // Name not available from ticker-universe; caller should enrich if needed
        marketCap: 0,
        sector: t.sector,
        industry: t.industry,
      }));

      data = {
        industry: decodedIndustry,
        large: mapped,
        mid: [],
        small: [],
      };
    } else {
      // Fallback: treat decodedIndustry as a sector and use sector-stocks.json
      const sectorStocks = await getStocksForSector(decodedIndustry, false);
      if (!sectorStocks) {
        return NextResponse.json(
          {
            error: 'Industry or sector not found',
            industry: decodedIndustry,
            hint: 'Name must match defeatbeta industry or sector names. Check /api/meta/industries for available values.',
          },
          { status: 404 }
        );
      }
      data = sectorStocks;
    }

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
