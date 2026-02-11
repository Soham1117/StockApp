import { env } from '@/lib/env';
import { loadTickerUniverse, getStocksForSector } from '@/lib/generated-data';
import type { Stock, StocksByMarketCap } from '@/types';

/**
 * Fetch stocks for an industry/sector
 */
export async function getIndustryStocks(industry: string): Promise<StocksByMarketCap> {
  const decodedIndustry = decodeURIComponent(industry);

  // Load ticker universe and filter by industry
  const universe = await loadTickerUniverse();
  const matchingTickers = universe.tickers.filter(
    (t) => t.industry === decodedIndustry
  );

  if (matchingTickers.length > 0) {
    const mapped: Stock[] = matchingTickers.map((t) => ({
      symbol: t.symbol,
      companyName: t.symbol,
      marketCap: 0,
      sector: t.sector,
      industry: t.industry,
    }));

    return {
      industry: decodedIndustry,
      large: mapped,
      mid: [],
      small: [],
    };
  }

  // Fallback: treat decodedIndustry as a sector
  const sectorStocks = await getStocksForSector(decodedIndustry, false);
  if (!sectorStocks) {
    throw new Error(`Industry or sector not found: ${decodedIndustry}`);
  }
  return sectorStocks;
}

/**
 * Perform comprehensive industry analysis via FastAPI
 */
export async function analyzeIndustry(params: {
  industry: string;
  symbols: string[];
  weights?: Record<string, number>;
  filters?: any;
  exclude_symbols?: string[];
}): Promise<any> {
  if (!env.fastapiBaseUrl) {
    throw new Error('FASTAPI_BASE_URL not configured');
  }

  const payload = {
    symbols: params.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
    weights: params.weights,
    filters: params.filters,
    exclude_symbols: params.exclude_symbols,
  };

  const response = await fetch(
    `${env.fastapiBaseUrl}/api/industry/${encodeURIComponent(params.industry)}/analysis`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FastAPI industry analysis error: ${response.status} ${text}`);
  }

  return await response.json();
}

/**
 * Analyze industry in batches to improve reliability
 */
export async function analyzeIndustryBatched(params: {
  industry: string;
  symbols: string[];
  batchSize?: number;
  weights?: Record<string, number>;
  filters?: any;
}, onProgress?: (progress: number) => void): Promise<any> {
  const { symbols, batchSize = 10 } = params;
  const results = [];
  const total = symbols.length;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = symbols.slice(i, i + batchSize);
    const chunkResult = await analyzeIndustry({
      industry: params.industry,
      symbols: chunk,
      weights: params.weights,
      filters: params.filters
    });
    
    // Merge results logic (depends on FastAPI response shape)
    // For now, we assume we return combined symbols list
    results.push(...(chunkResult.symbols || []));
    
    if (onProgress) {
      onProgress(Math.round(((i + chunk.length) / total) * 100));
    }
  }

  return { symbols: results };
}
