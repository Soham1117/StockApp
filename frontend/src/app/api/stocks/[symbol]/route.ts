import { NextResponse } from 'next/server';
import { getStocksForSector } from '@/lib/generated-data';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';
import type { Stock, StockMetrics } from '@/types';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]
 * Fetch comprehensive stock data including basic info, metrics, and initial data
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    const cacheKey = `stock:${upperSymbol}:v1`;
    const cached = getFromCache<{
      stock: Stock;
      sector: string;
    }>(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    // Search through all sectors to find the stock
    // Load ticker universe to get sector info
    const { loadTickerUniverse } = await import('@/lib/generated-data');
    const universe = await loadTickerUniverse();
    const ticker = universe.tickers.find((t) => t.symbol === upperSymbol);

    if (!ticker) {
      return NextResponse.json(
        { error: 'Symbol not found', symbol: upperSymbol },
        { status: 404 }
      );
    }

    // Get stock from sector-stocks.json
    const sector = ticker.sector;
    const sectorStocks = await getStocksForSector(sector);

    if (!sectorStocks) {
      return NextResponse.json(
        { error: 'Sector data not found', sector },
        { status: 404 }
      );
    }

    // Find stock in any bucket
    const allStocks = [
      ...(sectorStocks.large || []),
      ...(sectorStocks.mid || []),
      ...(sectorStocks.small || []),
    ];

    const stock = allStocks.find((s) => s.symbol.toUpperCase() === upperSymbol);

    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found in sector data', symbol: upperSymbol, sector },
        { status: 404 }
      );
    }

    const result = {
      stock,
      sector,
    };

    setCache(cacheKey, result, TTL.ONE_HOUR);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error fetching stock:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch stock',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

