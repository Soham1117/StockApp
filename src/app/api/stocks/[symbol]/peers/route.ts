import { NextResponse } from 'next/server';
import type { IndustryMetrics, StockMetrics, ValuationRatios } from '@/types';
import { loadTickerUniverse } from '@/lib/generated-data';
import {
  loadPrecomputedSectorMetrics,
  buildIndustryMetricsFromRatios,
} from '@/app/api/sector/[sector]/metrics/route';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

interface PeerSummary {
  symbol: string;
  score: number;
  classification: string;
}

interface MetricRank {
  metric: string;
  rank: number;
  total: number;
  percentile: number;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    // Load universe to get sector/industry
    const universe = await loadTickerUniverse();
    const ticker = universe.tickers.find((t) => t.symbol === upperSymbol);

    if (!ticker) {
      return NextResponse.json(
        { error: 'Symbol not found in ticker universe', symbol: upperSymbol },
        { status: 404 }
      );
    }

    const sector = ticker.sector;
    const industry = ticker.industry;

    // Build peer universe: same industry, or fallback to sector
    const sameIndustry = universe.tickers.filter(
      (t) => t.industry === industry && t.sector === sector
    );
    const basePeers =
      sameIndustry.length >= 5
        ? sameIndustry
        : universe.tickers.filter((t) => t.sector === sector);

    const peerSymbols = Array.from(
      new Set(basePeers.map((t) => t.symbol.toUpperCase()))
    );

    if (!peerSymbols.includes(upperSymbol)) {
      peerSymbols.push(upperSymbol);
    }

    // Load precomputed metrics for the sector
    const precomputed = await loadPrecomputedSectorMetrics();
    const sectorEntry = precomputed?.[sector];
    if (!sectorEntry?.metrics?.length) {
      return NextResponse.json(
        {
          error: 'No precomputed metrics for sector',
          sector,
        },
        { status: 500 }
      );
    }

    const symbolToMetrics = new Map<string, ValuationRatios>();
    for (const m of sectorEntry.metrics) {
      const s = (m.symbol || '').toUpperCase();
      if (!s) continue;
      symbolToMetrics.set(s, {
        symbol: s,
        marketCap: typeof m.marketCap === 'number' ? m.marketCap : undefined,
        sharesOutstanding:
          typeof m.sharesOutstanding === 'number' ? m.sharesOutstanding : undefined,
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
            : typeof (m as any).growth?.revenueGrowthTTM === 'number'
              ? (m as any).growth.revenueGrowthTTM
              : undefined,
        profitability: (m as any).profitability,
        financialHealth: (m as any).financialHealth,
        cashFlow: (m as any).cashFlow,
        growth: (m as any).growth,
        valuationExtras: (m as any).valuationExtras,
      });
    }

    const peerRatios: ValuationRatios[] = peerSymbols
      .map((s) => symbolToMetrics.get(s))
      .filter((v): v is ValuationRatios => Boolean(v));

    if (!peerRatios.length) {
      return NextResponse.json(
        {
          error: 'No metrics available for peers',
          sector,
          peers: peerSymbols,
        },
        { status: 500 }
      );
    }

    const industryMetrics: IndustryMetrics = buildIndustryMetricsFromRatios(
      industry || sector,
      peerRatios,
      peerRatios
    );

    const stocks = industryMetrics.stocks;
    const focal = stocks.find((s) => s.symbol === upperSymbol);

    if (!focal) {
      return NextResponse.json(
        {
          error: 'Metrics not found for focal symbol in peer group',
          symbol: upperSymbol,
        },
        { status: 500 }
      );
    }

    // Build simple evaluation score from growthValueScore
    // Include all stocks that have metrics (stocks array from industryMetrics)
    const peersWithScores: PeerSummary[] = stocks
      .map((s) => ({
        symbol: s.symbol,
        score: s.growthValueScore?.score ?? 0,
        classification: s.growthValueScore?.classification ?? 'BLEND',
      }))
      .sort((a, b) => b.score - a.score);

    const totalPeers = peersWithScores.length;
    const focalIndex = peersWithScores.findIndex((p) => p.symbol === upperSymbol);

    // Rank is 1-based: index 0 = rank 1, index 17 = rank 18, index 18 = rank 19
    // If TSLA is last (index = length - 1), rank should equal length
    const focalRank = focalIndex >= 0 ? focalIndex + 1 : null;

    const betterPeers = peersWithScores.filter(
      (p) => p.symbol !== upperSymbol && p.score >= focal.growthValueScore.score + 10
    );

    // Compute ranks for a few key metrics
    const metricsToRank: Array<{ key: string; path: string }> = [
      { key: 'peRatioTTM', path: 'ratios.peRatioTTM' },
      { key: 'priceToSalesRatioTTM', path: 'ratios.priceToSalesRatioTTM' },
      { key: 'growth.revenueGrowthTTM', path: 'ratios.growth.revenueGrowthTTM' },
      { key: 'profitability.roic', path: 'ratios.profitability.roic' },
      { key: 'cashFlow.fcfYield', path: 'ratios.cashFlow.fcfYield' },
      { key: 'financialHealth.debtToEquity', path: 'ratios.financialHealth.debtToEquity' },
    ];

    const getNested = (obj: any, path: string): number | null => {
      const parts = path.split('.');
      let cur: any = obj;
      for (const p of parts) {
        if (cur == null) return null;
        cur = cur[p];
      }
      return typeof cur === 'number' && isFinite(cur) ? cur : null;
    };

    const ranks: MetricRank[] = [];

    for (const spec of metricsToRank) {
      const values: Array<{ symbol: string; value: number }> = [];
      for (const s of stocks) {
        const v = getNested(s, spec.path);
        if (v != null) {
          values.push({ symbol: s.symbol, value: v });
        }
      }
      if (!values.length) continue;

      // Determine whether higher or lower is better based on metric
      const lowerBetterKeys = new Set([
        'peRatioTTM',
        'priceToSalesRatioTTM',
        'financialHealth.debtToEquity',
      ]);
      const higherIsBetter = !lowerBetterKeys.has(spec.key);

      values.sort((a, b) =>
        higherIsBetter ? b.value - a.value : a.value - b.value
      );

      const idx = values.findIndex((v) => v.symbol === upperSymbol);
      if (idx === -1) continue;

      const rank = idx + 1;
      const total = values.length;
      const percentile = total > 1 ? (1 - idx / (total - 1)) * 100 : 50;

      ranks.push({
        metric: spec.key,
        rank,
        total,
        percentile,
      });
    }

    return NextResponse.json({
      symbol: upperSymbol,
      sector,
      industry,
      peers: peersWithScores,
      focal: {
        symbol: upperSymbol,
        score: focal.growthValueScore.score,
        classification: focal.growthValueScore.classification,
        rank: focalRank,
        total: totalPeers,
      },
      betterPeers,
      ranks,
    });
  } catch (error) {
    console.error('[API] Error computing peer analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to compute peer analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


