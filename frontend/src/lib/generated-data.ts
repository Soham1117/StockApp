/**
 * Loaders for generated data files (ticker-universe.json, sector-stocks.json)
 * These files are regenerated weekly via scripts/generate-universe.py
 */

import type { Stock, StocksByMarketCap } from '@/types';

interface TickerUniverseData {
  industries: string[];
  sectors: string[];
  tickers: Array<{
    symbol: string;
    industry: string;
    sector: string;
  }>;
}

interface SectorStocksData {
  [sector: string]: {
    large: Stock[];
    mid: Stock[];
    small: Stock[];
  };
}

let tickerUniverseCache: TickerUniverseData | null = null;
let sectorStocksCache: SectorStocksData | null = null;

/**
 * Resolve the data directory. Tries multiple paths to work in dev, production,
 * and serverless (Netlify) environments.
 */
async function resolveDataDir(): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const cwd = process.cwd();

  const candidates = [
    path.join(cwd, '..', 'data'),       // running from frontend/ (dev)
    path.join(cwd, 'data'),             // running from repo root
    path.join(cwd, 'data-generated'),   // copied by prebuild (Netlify/production)
  ];

  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'ticker-universe.json'));
      return dir;
    } catch {
      // try next
    }
  }

  throw new Error('Cannot find data directory with ticker-universe.json');
}

/**
 * Load ticker-universe.json
 */
export async function loadTickerUniverse(): Promise<TickerUniverseData> {
  if (tickerUniverseCache) {
    return tickerUniverseCache;
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataDir = await resolveDataDir();
    const filePath = path.join(dataDir, 'ticker-universe.json');
    const content = await fs.readFile(filePath, 'utf-8');
    tickerUniverseCache = JSON.parse(content) as TickerUniverseData;
    return tickerUniverseCache;
  } catch (error) {
    throw new Error('Failed to load ticker universe data. Run scripts/generate-universe.py first.');
  }
}

/**
 * Load sector-stocks.json or sector-stocks-top30.json
 *
 * @param topOnly - when true, load the pre-selected top-30-per-sector file.
 */
export async function loadSectorStocks(topOnly: boolean = false): Promise<SectorStocksData> {
  // Keep separate caches so full universe and top-30 can coexist
  if (!topOnly && sectorStocksCache) {
    return sectorStocksCache;
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataDir = await resolveDataDir();
    const fileName = topOnly ? 'sector-stocks-top30.json' : 'sector-stocks.json';
    const filePath = path.join(dataDir, fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as SectorStocksData;

    if (topOnly) {
      // Do not cache into sectorStocksCache to avoid mixing universes
      return parsed;
    }

    sectorStocksCache = parsed;
    return sectorStocksCache;
  } catch (error) {
    throw new Error(
      'Failed to load sector stocks data. Run scripts/generate-universe.py and select-top-stocks.py first.'
    );
  }
}

/**
 * Get stocks for a sector (defeatbeta sector name)
 *
 * @param topOnly - when true, use the top-30-per-sector selection file.
 */
export async function getStocksForSector(
  sector: string,
  topOnly: boolean = false
): Promise<StocksByMarketCap | null> {
  const data = await loadSectorStocks(topOnly);
  const buckets = data[sector];

  if (!buckets) {
    return null;
  }

  return {
    industry: sector, // Keep field name for compatibility with StocksByMarketCap type
    large: buckets.large || [],
    mid: buckets.mid || [],
    small: buckets.small || [],
  };
}

/**
 * Get all available industries from generated data
 */
export async function getIndustriesAndSectors(): Promise<{
  industries: string[];
  sectors: string[];
}> {
  const universe = await loadTickerUniverse();
  return {
    industries: universe.industries,
    sectors: universe.sectors,
  };
}

