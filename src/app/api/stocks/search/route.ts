import { NextResponse } from 'next/server';
import { loadTickerUniverse, getStocksForSector } from '@/lib/generated-data';
import { env } from '@/lib/env';
import type { Stock } from '@/types';

/**
 * GET /api/stocks/search?q=query
 * Search stocks by symbol or company name
 * Uses ticker-universe.json for initial search, then enriches with full data from sector-stocks.json and FastAPI
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ results: [] });
    }

    const universe = await loadTickerUniverse();
    const lowerQuery = query.toLowerCase().trim();
    const matches: Array<{ ticker: any; score: number }> = [];

    // Step 1: Search ticker-universe.json for matching symbols
    for (const ticker of universe.tickers) {
      const symbolMatch = ticker.symbol.toLowerCase().includes(lowerQuery);
      if (!symbolMatch) continue;

      let score = 0;
      if (symbolMatch) score += 100;
      if (ticker.symbol.toLowerCase() === lowerQuery) score += 200; // Exact symbol match
      if (ticker.symbol.toLowerCase().startsWith(lowerQuery)) score += 50; // Starts with

      matches.push({ ticker, score });
    }

    // Sort and get top 10 matches
    const topMatches = matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Step 2: Enrich with full stock data from sector-stocks.json
    const enrichedResults: Stock[] = [];
    const sectorCache = new Map<string, any>(); // Cache sector data to avoid loading multiple times

    for (const { ticker } of topMatches) {
      try {
        // Try to get full stock info from sector-stocks.json
        let stock: Stock | null = null;

        if (!sectorCache.has(ticker.sector)) {
          const sectorStocks = await getStocksForSector(ticker.sector, false);
          if (sectorStocks) {
            sectorCache.set(ticker.sector, sectorStocks);
          }
        }

        const sectorStocks = sectorCache.get(ticker.sector);
        if (sectorStocks) {
          // Search in all buckets (large, mid, small)
          const allStocks = [
            ...(sectorStocks.large || []),
            ...(sectorStocks.mid || []),
            ...(sectorStocks.small || []),
          ];
          stock = allStocks.find(
            (s) => s.symbol.toUpperCase() === ticker.symbol.toUpperCase()
          ) || null;
        }

        if (stock) {
          // Found in sector-stocks.json - use full data
          enrichedResults.push(stock);
        } else {
          // Not found in sector-stocks.json - create basic entry and try to get metadata from FastAPI
          const basicStock: Stock = {
            symbol: ticker.symbol,
            companyName: ticker.symbol, // Fallback
            marketCap: 0,
            sector: ticker.sector,
            industry: ticker.industry,
          };

          // Try to get metadata from FastAPI if configured
          if (env.fastapiBaseUrl) {
            try {
              const metadataRes = await fetch(`${env.fastapiBaseUrl}/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: [ticker.symbol] }),
              });

              if (metadataRes.ok) {
                const metadataData = await metadataRes.json();
                const symbolMetadata = metadataData.symbols?.[0];
                if (symbolMetadata) {
                  basicStock.marketCap = symbolMetadata.marketCap || 0;
                  // Metadata doesn't have company name, so we keep the symbol fallback
                }
              }
            } catch (error) {
              // Silently fail - use basic data
            }
          }

          enrichedResults.push(basicStock);
        }
      } catch (error) {
        // If sector loading fails, create basic entry
        enrichedResults.push({
          symbol: ticker.symbol,
          companyName: ticker.symbol,
          marketCap: 0,
          sector: ticker.sector,
          industry: ticker.industry,
        });
      }
    }

    // Step 3: Also search by company name in sector-stocks.json if we have loaded sectors
    // This allows searching by company name, not just symbol
    if (lowerQuery.length >= 2) {
      // Only search by name if query is at least 2 characters
      for (const [sector, sectorStocks] of sectorCache.entries()) {
        const allStocks = [
          ...(sectorStocks.large || []),
          ...(sectorStocks.mid || []),
          ...(sectorStocks.small || []),
        ];

        for (const stock of allStocks) {
          const nameMatch = stock.companyName?.toLowerCase().includes(lowerQuery);
          if (nameMatch) {
            // Check if already in results
            const alreadyAdded = enrichedResults.some(
              (s) => s.symbol.toUpperCase() === stock.symbol.toUpperCase()
            );
            if (!alreadyAdded) {
              enrichedResults.push(stock);
              // Limit total results to 10
              if (enrichedResults.length >= 10) break;
            }
          }
        }
        if (enrichedResults.length >= 10) break;
      }
    }

    // Limit to top 10 results
    const results = enrichedResults.slice(0, 10);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[API] Error searching stocks:', error);
    return NextResponse.json(
      {
        error: 'Failed to search stocks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
