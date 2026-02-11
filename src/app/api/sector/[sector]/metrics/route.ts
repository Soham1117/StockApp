import { NextResponse } from 'next/server';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { calculateStats, classifyMetric, classifyGrowthValue } from '@/lib/classification';
import { env } from '@/lib/env';
import type {
  IndustryMetrics,
  StockMetrics,
  ValuationRatios,
  IndustryStats,
  MetricClassification,
} from '@/types';

interface RouteContext {
  params: Promise<{ sector: string }>;
}

type PrecomputedSectorMetrics = Record<
  string,
  {
    metrics: Array<Partial<ValuationRatios> & { symbol: string }>;
    updated_at?: string; // ISO timestamp string
    schema_version?: string;
  }
>;

let precomputedSectorMetrics: PrecomputedSectorMetrics | null = null;

export async function loadPrecomputedSectorMetrics(): Promise<PrecomputedSectorMetrics | null> {
  if (precomputedSectorMetrics) {
    return precomputedSectorMetrics;
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'data', 'sector-metrics.json');
    const content = await fs.readFile(filePath, 'utf-8');
    precomputedSectorMetrics = JSON.parse(content) as PrecomputedSectorMetrics;
    return precomputedSectorMetrics;
  } catch (error) {
    return null;
  }
}

export function buildIndustryMetricsFromRatios(
  decodedSector: string,
  allRatios: ValuationRatios[],
  universeRatios?: ValuationRatios[]
): IndustryMetrics {
  // Flat valuation metrics
  const metricsList = [
    'peRatioTTM',
    'priceToSalesRatioTTM',
    'priceToBookRatioTTM',
    'enterpriseValueOverEBITTTM',
    'enterpriseValueOverEBITDATTM',
    'enterpriseValueToSalesTTM',
    'dividendYieldTTM',
    'revenueGrowthTTM',
  ];
  const invertedFlat = new Set([
    'peRatioTTM',
    'priceToSalesRatioTTM',
    'priceToBookRatioTTM',
    'enterpriseValueOverEBITTTM',
    'enterpriseValueOverEBITDATTM',
    'enterpriseValueToSalesTTM',
  ]);

  // Nested metrics (profitability, financialHealth, cashFlow, growth, valuationExtras)
  const nestedMetricsList = [
    // Profitability
    { path: 'profitability.roe', key: 'profitability.roe' },
    { path: 'profitability.roa', key: 'profitability.roa' },
    { path: 'profitability.roic', key: 'profitability.roic' },
    { path: 'profitability.grossMargin', key: 'profitability.grossMargin' },
    { path: 'profitability.operatingMargin', key: 'profitability.operatingMargin' },
    { path: 'profitability.netMargin', key: 'profitability.netMargin' },
    { path: 'profitability.ebitdaMargin', key: 'profitability.ebitdaMargin' },
    // Financial Health
    { path: 'financialHealth.debtToEquity', key: 'financialHealth.debtToEquity' },
    { path: 'financialHealth.interestCoverage', key: 'financialHealth.interestCoverage' },
    { path: 'financialHealth.currentRatio', key: 'financialHealth.currentRatio' },
    { path: 'financialHealth.quickRatio', key: 'financialHealth.quickRatio' },
    { path: 'financialHealth.ocfToDebt', key: 'financialHealth.ocfToDebt' },
    // Cash Flow
    { path: 'cashFlow.fcfTTM', key: 'cashFlow.fcfTTM' },
    { path: 'cashFlow.fcfMargin', key: 'cashFlow.fcfMargin' },
    { path: 'cashFlow.fcfYield', key: 'cashFlow.fcfYield' },
    { path: 'cashFlow.ocfTTM', key: 'cashFlow.ocfTTM' },
    // Growth
    { path: 'growth.revenueGrowthTTM', key: 'growth.revenueGrowthTTM' },
    { path: 'growth.ebitGrowthTTM', key: 'growth.ebitGrowthTTM' },
    { path: 'growth.epsGrowthTTM', key: 'growth.epsGrowthTTM' },
    { path: 'growth.fcfGrowthTTM', key: 'growth.fcfGrowthTTM' },
    // Valuation Extras
    { path: 'valuationExtras.forwardPE', key: 'valuationExtras.forwardPE' },
    { path: 'valuationExtras.pegRatio', key: 'valuationExtras.pegRatio' },
  ];

  const industryStats: Record<string, IndustryStats> = {};
  const baseRatios = universeRatios && universeRatios.length > 0 ? universeRatios : allRatios;

  // Process flat metrics
  for (const metric of metricsList) {
    const values = baseRatios
      .map((r) => r[metric as keyof ValuationRatios])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v));

    if (values.length > 0) {
      const stats = calculateStats(values);
      stats.metric = metric;
      industryStats[metric] = stats;
    }
  }

  // Process nested metrics
  for (const { path, key } of nestedMetricsList) {
    const [parent, child] = path.split('.');
    const values = baseRatios
      .map((r) => {
        const parentObj = r[parent as keyof ValuationRatios] as Record<string, unknown> | undefined;
        return parentObj?.[child] as number | undefined;
      })
      .filter((v): v is number => v != null && !isNaN(v) && isFinite(v));

    if (values.length > 0) {
      const stats = calculateStats(values);
      stats.metric = key;
      industryStats[key] = stats;
    }
  }

  // Classify each stock
  const stockMetrics: StockMetrics[] = allRatios.map((ratios) => {
    const classifications: Record<string, MetricClassification> = {};

    // Classify flat metrics
    for (const metric of metricsList) {
      const value = ratios[metric as keyof ValuationRatios];
      if (value != null && typeof value === 'number' && industryStats[metric]) {
        classifications[metric] = classifyMetric(
          value,
          industryStats[metric],
          invertedFlat.has(metric)
        );
      }
    }

    // Classify nested metrics
    for (const { path, key } of nestedMetricsList) {
      const [parent, child] = path.split('.');
      const parentObj = ratios[parent as keyof ValuationRatios] as Record<string, unknown> | undefined;
      const value = parentObj?.[child] as number | undefined;
      if (value != null && industryStats[key]) {
        // Metrics where lower is better (inverted)
        const invertedMetrics = [
          'financialHealth.debtToEquity',
          'financialHealth.ocfToDebt',
          'valuationExtras.forwardPE',
          'valuationExtras.pegRatio',
        ];
        const inverted = invertedMetrics.includes(key);
        classifications[key] = classifyMetric(value, industryStats[key], inverted);
      }
    }

    const growthValueScore = classifyGrowthValue(ratios, industryStats);

    return {
      symbol: ratios.symbol,
      ratios,
      classifications,
      growthValueScore,
    };
  });

  return {
    industry: decodedSector, // Keep field name for compatibility
    stocks: stockMetrics,
    industryStats,
  };
}

/**
 * GET /api/sector/[sector]/metrics
 * Fetch valuation metrics from FastAPI for all stocks in a sector
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { sector } = await context.params;
    const decodedSector = decodeURIComponent(sector);

    // Get symbols from query params
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'symbols query parameter required' },
        { status: 400 }
      );
    }

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
    const symbolSet = new Set(symbols);

    // Check for cache bypass parameter
    const bypassCache = searchParams.get('bypassCache') === 'true';
    const useLiveSource =
      searchParams.get('useLive') === 'true' || searchParams.get('source') === 'live';

    const cacheKey = `sector:metrics:${decodedSector}:${symbols.join(',')}:v5`; // bump version for expanded metrics support
    const cached = getFromCache<IndustryMetrics>(cacheKey);

    if (cached && !bypassCache) {
      return NextResponse.json(cached);
    }

    // Try precomputed file first (unless explicitly told to use live)
    let ratiosFromFile: ValuationRatios[] = [];
    let isPrecomputedDataFresh = false;
    if (!useLiveSource && !bypassCache) {
      const precomputed = await loadPrecomputedSectorMetrics();
      const sectorEntry = precomputed?.[decodedSector];

      // Check if precomputed data is fresh (updated within last 24 hours)
      if (sectorEntry?.updated_at) {
        try {
          const updatedAt = new Date(sectorEntry.updated_at);
          const now = new Date();
          const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
          isPrecomputedDataFresh = hoursSinceUpdate < 48; // 2 days = 48 hours
        } catch {
          isPrecomputedDataFresh = false;
        }
      }

      if (sectorEntry?.metrics?.length) {
        const symbolToMetrics = new Map<string, ValuationRatios>();
        for (const m of sectorEntry.metrics) {
          const symbol = (m.symbol || '').toUpperCase();
          symbolToMetrics.set(symbol, {
            symbol,
            marketCap: typeof m.marketCap === 'number' ? m.marketCap : undefined,
            sharesOutstanding: typeof m.sharesOutstanding === 'number' ? m.sharesOutstanding : undefined,
            peRatioTTM: typeof m.peRatioTTM === 'number' ? m.peRatioTTM : undefined,
            priceToSalesRatioTTM:
              typeof m.priceToSalesRatioTTM === 'number' ? m.priceToSalesRatioTTM : undefined,
            priceToBookRatioTTM:
              typeof m.priceToBookRatioTTM === 'number' ? m.priceToBookRatioTTM : undefined,
            enterpriseValueOverEBITTTM:
              typeof m.enterpriseValueOverEBITTTM === 'number' ? m.enterpriseValueOverEBITTTM : undefined,
            enterpriseValueOverEBITDATTM:
              typeof m.enterpriseValueOverEBITDATTM === 'number' ? m.enterpriseValueOverEBITDATTM : undefined,
            enterpriseValueToSalesTTM:
              typeof m.enterpriseValueToSalesTTM === 'number' ? m.enterpriseValueToSalesTTM : undefined,
            dividendYieldTTM: typeof m.dividendYieldTTM === 'number' ? m.dividendYieldTTM : undefined,
            revenueGrowthTTM:
              typeof m.revenueGrowthTTM === 'number'
                ? m.revenueGrowthTTM
                : typeof m.growth?.revenueGrowthTTM === 'number'
                  ? m.growth.revenueGrowthTTM
                  : undefined,
            profitability: m.profitability,
            financialHealth: m.financialHealth,
            cashFlow: m.cashFlow,
            growth: m.growth,
            valuationExtras: m.valuationExtras,
          });
        }

        ratiosFromFile = symbols
          .map((sym) => symbolToMetrics.get(sym))
          .filter((v): v is ValuationRatios => Boolean(v));

        if (ratiosFromFile.length) {
        }
      }
    }

    // CHANGED: Skip FastAPI entirely unless explicitly requested with useLiveSource or bypassCache
    // Always use precomputed JSON data when available
    const symbolsNeedingFetch = useLiveSource || bypassCache
      ? symbols.filter((sym) => {
          const precomputed = ratiosFromFile.find((r) => r.symbol === sym);
          // Only fetch if symbol is completely missing from precomputed data
          return !precomputed;
        })
      : []; // Skip FastAPI fetch entirely in normal operation

    const missingSymbols = symbolsNeedingFetch;


    let ratiosFromApi: ValuationRatios[] = [];

    if (missingSymbols.length > 0) {
      if (!env.fastapiBaseUrl) {
        // Don't error out - just skip the missing symbols
      } else {

        const apiRes = await fetch(`${env.fastapiBaseUrl}/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missingSymbols }),
        });

        if (!apiRes.ok) {
          // Don't throw - just continue with precomputed data
        } else {
          const payload = await apiRes.json();
          const toNumber = (v: unknown): number | undefined =>
            typeof v === 'number' && isFinite(v) ? v : undefined;

          ratiosFromApi = (payload.metrics || []).map((m: Record<string, unknown>) => {
            const profitabilityRaw = (m.profitability || {}) as Record<string, unknown>;
            const financialHealthRaw = (m.financialHealth || {}) as Record<string, unknown>;
            const cashFlowRaw = (m.cashFlow || {}) as Record<string, unknown>;
            const growthRaw = (m.growth || {}) as Record<string, unknown>;
            const valuationExtrasRaw = (m.valuationExtras || {}) as Record<string, unknown>;

            const symbol = (m.symbol as string).toUpperCase();
            const dividendYield = toNumber(m.dividendYieldTTM);

            return {
              symbol,
              marketCap: toNumber(m.marketCap),
              sharesOutstanding: toNumber(m.sharesOutstanding),
              ttmEps: toNumber(m.ttmEps),
              peRatioTTM: toNumber(m.peRatioTTM),
              priceToSalesRatioTTM: toNumber(m.priceToSalesRatioTTM),
              priceToBookRatioTTM: toNumber(m.priceToBookRatioTTM),
              enterpriseValueOverEBITTTM: toNumber(m.enterpriseValueOverEBITTTM),
              enterpriseValueOverEBITDATTM: toNumber(m.enterpriseValueOverEBITDATTM),
              enterpriseValueToSalesTTM: toNumber(m.enterpriseValueToSalesTTM),
              dividendYieldTTM: dividendYield,
              revenueGrowthTTM: toNumber(m.revenueGrowthTTM) ?? toNumber(growthRaw.revenueGrowthTTM),
              profitability: {
                roe: toNumber(profitabilityRaw.roe),
                roa: toNumber(profitabilityRaw.roa),
                roic: toNumber(profitabilityRaw.roic),
                grossMargin: toNumber(profitabilityRaw.grossMargin),
                operatingMargin: toNumber(profitabilityRaw.operatingMargin),
                netMargin: toNumber(profitabilityRaw.netMargin),
                ebitdaMargin: toNumber(profitabilityRaw.ebitdaMargin),
              },
              financialHealth: {
                debtToEquity: toNumber(financialHealthRaw.debtToEquity),
                interestCoverage: toNumber(financialHealthRaw.interestCoverage),
                currentRatio: toNumber(financialHealthRaw.currentRatio),
                quickRatio: toNumber(financialHealthRaw.quickRatio),
                ocfToDebt: toNumber(financialHealthRaw.ocfToDebt),
              },
              cashFlow: {
                fcfTTM: toNumber(cashFlowRaw.fcfTTM),
                fcfMargin: toNumber(cashFlowRaw.fcfMargin),
                fcfYield: toNumber(cashFlowRaw.fcfYield),
                ocfTTM: toNumber(cashFlowRaw.ocfTTM),
              },
              growth: {
                revenueGrowthTTM: toNumber(growthRaw.revenueGrowthTTM),
                ebitGrowthTTM: toNumber(growthRaw.ebitGrowthTTM),
                epsGrowthTTM: toNumber(growthRaw.epsGrowthTTM),
                fcfGrowthTTM: toNumber(growthRaw.fcfGrowthTTM),
              },
              valuationExtras: {
                forwardPE: toNumber(valuationExtrasRaw.forwardPE),
                pegRatio: toNumber(valuationExtrasRaw.pegRatio),
              },
            };
          });
        }
      }
    }

    // Merge precomputed and API data, preferring API data for symbols that were fetched
    const allRatios: ValuationRatios[] = [];
    const apiSymbols = new Set(ratiosFromApi.map((r) => r.symbol));
    
    for (const symbol of symbols) {
      if (apiSymbols.has(symbol)) {
        // Use API data (has dividend yield)
        const apiRatio = ratiosFromApi.find((r) => r.symbol === symbol);
        if (apiRatio) {
          allRatios.push(apiRatio);
        }
      } else {
        // Use precomputed data (but might be missing dividend yield)
        const precomputedRatio = ratiosFromFile.find((r) => r.symbol === symbol);
        if (precomputedRatio) {
          allRatios.push(precomputedRatio);
        }
      }
    }

    // Debug: Check if dividend yield is in the final ratios
    const msftRatio = allRatios.find((r) => r.symbol === 'MSFT');
    if (msftRatio) {
      console.log(`[API Metrics] MSFT final ratio - dividendYieldTTM:`, msftRatio.dividendYieldTTM);
      console.log(`[API Metrics] MSFT final ratio - source:`, apiSymbols.has('MSFT') ? 'API' : 'precomputed');
    }

    if (allRatios.length === 0) {
      console.warn(
        `[Metrics] No metrics available for any requested symbols in sector ${decodedSector}. ` +
        `Requested: ${symbols.length}, From file: ${ratiosFromFile.length}, From API: ${ratiosFromApi.length}`
      );
      return NextResponse.json(
        {
          error: 'No metrics available for requested symbols',
          sector: decodedSector,
          symbols,
          message: 'Symbols not found in precomputed data. Use ?useLive=true to fetch from FastAPI.',
        },
        { status: 404 }
      );
    }

    // When precomputed data is available, use the full sector universe for stats,
    // but only return metrics for the requested symbols. This avoids degenerate
    // industryStats when the caller requests a single symbol.
    let universeRatios: ValuationRatios[] | undefined;
    if (!useLiveSource && !bypassCache) {
      const precomputed = await loadPrecomputedSectorMetrics();
      const sectorEntry = precomputed?.[decodedSector];
      if (sectorEntry?.metrics?.length) {
        universeRatios = sectorEntry.metrics
          .map((m: any) => {
            const symbol = (m.symbol || '').toUpperCase();
            return {
              symbol,
              marketCap: typeof m.marketCap === 'number' ? m.marketCap : undefined,
              sharesOutstanding:
                typeof m.sharesOutstanding === 'number' ? m.sharesOutstanding : undefined,
              ttmEps: typeof m.ttmEps === 'number' ? m.ttmEps : undefined,
              peRatioTTM: typeof m.peRatioTTM === 'number' ? m.peRatioTTM : undefined,
              priceToSalesRatioTTM:
                typeof m.priceToSalesRatioTTM === 'number' ? m.priceToSalesRatioTTM : undefined,
              priceToBookRatioTTM:
                typeof m.priceToBookRatioTTM === 'number' ? m.priceToBookRatioTTM : undefined,
              enterpriseValueOverEBITTTM:
                typeof m.enterpriseValueOverEBITTTM === 'number'
                  ? m.enterpriseValueOverEBITTTM
                  : undefined,
              enterpriseValueOverEBITDATTM:
                typeof m.enterpriseValueOverEBITDATTM === 'number'
                  ? m.enterpriseValueOverEBITDATTM
                  : undefined,
              enterpriseValueToSalesTTM:
                typeof m.enterpriseValueToSalesTTM === 'number'
                  ? m.enterpriseValueToSalesTTM
                  : undefined,
              dividendYieldTTM:
                typeof m.dividendYieldTTM === 'number' ? m.dividendYieldTTM : undefined,
              revenueGrowthTTM:
                typeof m.revenueGrowthTTM === 'number'
                  ? m.revenueGrowthTTM
                  : typeof m.growth?.revenueGrowthTTM === 'number'
                    ? m.growth.revenueGrowthTTM
                    : undefined,
              profitability: m.profitability,
              financialHealth: m.financialHealth,
              cashFlow: m.cashFlow,
              growth: m.growth,
              valuationExtras: m.valuationExtras,
            } as ValuationRatios;
          })
          .filter((r: ValuationRatios | undefined) => Boolean(r)) as ValuationRatios[];
      }
    }

    const result = buildIndustryMetricsFromRatios(decodedSector, allRatios, universeRatios);

    // Cache for 12 hours
    setCache(cacheKey, result, TTL.TWELVE_HOURS);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
