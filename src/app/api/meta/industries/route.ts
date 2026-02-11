import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { getIndustriesAndSectors } from '@/lib/generated-data';

interface IndustriesResponse {
  industries: string[];
  sectors?: string[];
}

/**
 * GET /api/meta/industries
 * Returns available industries/sectors from generated data files.
 * Now primarily returns sectors (11 total) for sector-based grouping.
 *
 * Data is regenerated weekly via scripts/generate-universe.py using defeatbeta.
 */
export async function GET() {
  const cacheKey = 'meta:industries:v6';

  // 1) Try cache first
  try {
    const cached = getFromCache<IndustriesResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  } catch (error) {
    console.error('[API] Cache error in /api/meta/industries:', error);
  }

  // 2) Load industries/sectors from generated data files
  try {
    const { industries, sectors } = await getIndustriesAndSectors();
    const data: IndustriesResponse = { industries, sectors };

    try {
      setCache(cacheKey, data, TTL.ONE_DAY);
    } catch (cacheError) {
      console.error('[API] Cache write error in /api/meta/industries:', cacheError);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error loading industries from generated data:', error);
    return NextResponse.json(
      {
        error: 'Failed to load industries',
        details:
          error instanceof Error
            ? error.message
            : 'Unknown error. Run scripts/generate-universe.py to generate data files.',
      },
      { status: 500 }
    );
  }
}