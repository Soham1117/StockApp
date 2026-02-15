import fs from 'fs';
import path from 'path';
import type { Stock } from '@/types';

interface RawStockRow {
  symbol: string;
  name: string;
  marketCap: string;
  country: string;
  sector: string;
  industry: string;
}

interface RawStocksJson {
  data?: {
    rows?: RawStockRow[];
  };
}

export interface UniverseStock {
  symbol: string;
  name: string;
  marketCap: number;
  country: string;
  sector: string;
  industry: string;
}

let universeCache: UniverseStock[] | null = null;

function parseMarketCap(value: string | null | undefined): number {
  if (!value) return 0;
  const num = Number(value.replace(/[\$,]/g, '').trim());
  return Number.isFinite(num) ? num : 0;
}

export function getStockUniverse(): UniverseStock[] {
  if (universeCache) {
    return universeCache;
  }

  const filePath = path.join(process.cwd(), 'stocks.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const json: RawStocksJson = JSON.parse(raw);
  const rows = json.data?.rows ?? [];

  const universe: UniverseStock[] = rows
    .filter((row) => row.symbol && row.symbol.trim().length > 0)
    .map((row) => ({
      symbol: row.symbol.trim().toUpperCase(),
      name: row.name?.trim() ?? row.symbol.trim().toUpperCase(),
      marketCap: parseMarketCap(row.marketCap),
      country: row.country?.trim() ?? '',
      sector: row.sector?.trim() ?? '',
      industry: row.industry?.trim() ?? '',
    }));

  universeCache = universe;
  return universe;
}

export function getIndustriesAndSectors(): { industries: string[]; sectors: string[] } {
  const universe = getStockUniverse();

  const industriesSet = new Set<string>();
  const sectorsSet = new Set<string>();

  for (const stock of universe) {
    if (stock.industry) {
      industriesSet.add(stock.industry);
    }
    if (stock.sector) {
      sectorsSet.add(stock.sector);
    }
  }

  return {
    industries: Array.from(industriesSet).sort(),
    sectors: Array.from(sectorsSet).sort(),
  };
}

export function getStocksForIndustry(industry: string, country: string = 'United States'): UniverseStock[] {
  const universe = getStockUniverse();
  const target = industry.trim().toLowerCase();

  return universe.filter((stock) => {
    if (!stock.industry) return false;
    if (country && stock.country !== country) return false;
    return stock.industry.trim().toLowerCase() === target;
  });
}

export function findStockBySymbol(symbol: string): UniverseStock | null {
  const universe = getStockUniverse();
  const target = symbol.trim().toUpperCase();
  return universe.find((stock) => stock.symbol === target) ?? null;
}

export function toAppStock(row: UniverseStock): Stock {
  return {
    symbol: row.symbol,
    companyName: row.name,
    marketCap: row.marketCap,
    sector: row.sector || 'Unknown',
    industry: row.industry || '',
    price: undefined,
    exchange: '',
    country: row.country || '',
  };
}


