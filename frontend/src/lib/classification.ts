import type {
  ValuationRatios,
  MetricClassification,
  StockClassification,
  IndustryStats,
} from '@/types';

/**
 * Calculate industry statistics for a set of values
 */
export function calculateStats(values: number[]): IndustryStats {
  const validValues = values.filter((v) => v != null && !isNaN(v) && isFinite(v));

  if (validValues.length === 0) {
    return {
      metric: '',
      mean: 0,
      median: 0,
      stdDev: 0,
      p25: 0,
      p75: 0,
      min: 0,
      max: 0,
    };
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;

  const median = sorted[Math.floor(sorted.length / 2)];
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];

  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  return {
    metric: '',
    mean,
    median,
    stdDev,
    p25,
    p75,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Classify a metric value relative to industry distribution
 * @param value - The metric value to classify
 * @param stats - Industry statistics for the metric
 * @param inverted - If true, lower values are better (e.g., debt-to-equity, P/E for value)
 */
export function classifyMetric(
  value: number,
  stats: IndustryStats,
  inverted: boolean = false
): MetricClassification {
  if (value == null || isNaN(value) || !isFinite(value)) {
    return 'AVERAGE';
  }

  const { p25, p75, mean } = stats;
  const iqr = p75 - p25;

  if (inverted) {
    // For inverted metrics (lower is better), flip the logic
    // Way above (bad): > P75 + IQR
    if (value > p75 + iqr) {
      return 'WAY_ABOVE';
    }
    // Above (bad): > P75
    if (value > p75) {
      return 'ABOVE';
    }
    // Way below (good): < P25 - IQR
    if (value < p25 - iqr) {
      return 'WAY_BELOW';
    }
    // Below (good): < P25
    if (value < p25) {
      return 'BELOW';
    }
  } else {
    // Standard logic (higher is better for most metrics)
    // Way below: < P25 - IQR
    if (value < p25 - iqr) {
      return 'WAY_BELOW';
    }
    // Below: < P25
    if (value < p25) {
      return 'BELOW';
    }
    // Way above: > P75 + IQR
    if (value > p75 + iqr) {
      return 'WAY_ABOVE';
    }
    // Above: > P75
    if (value > p75) {
      return 'ABOVE';
    }
  }

  // Average
  return 'AVERAGE';
}

/**
 * Growth vs Value classification algorithm
 *
 * Scoring system:
 * - Growth indicators: high P/E, high P/S, low dividend, high growth → positive score
 * - Value indicators: low P/E, low P/B, high dividend, low growth → negative score
 * - Score range: -100 (strong value) to +100 (strong growth)
 */
export function classifyGrowthValue(
  ratios: ValuationRatios,
  industryStats: Record<string, IndustryStats>
): {
  classification: StockClassification;
  score: number;
  reasons: string[];
} {
  type MetricSpec = {
    key: string; // key in industryStats
    path: string; // path in ratios
    higherIsBetter: boolean;
    weight: number;
  };

  const metricSpecs: MetricSpec[] = [
    // Valuation (cheaper is better)
    { key: 'peRatioTTM', path: 'peRatioTTM', higherIsBetter: false, weight: 1.0 },
    {
      key: 'priceToSalesRatioTTM',
      path: 'priceToSalesRatioTTM',
      higherIsBetter: false,
      weight: 0.7,
    },
    {
      key: 'priceToBookRatioTTM',
      path: 'priceToBookRatioTTM',
      higherIsBetter: false,
      weight: 0.7,
    },
    {
      key: 'enterpriseValueOverEBITTTM',
      path: 'enterpriseValueOverEBITTTM',
      higherIsBetter: false,
      weight: 1.0,
    },
    {
      key: 'enterpriseValueOverEBITDATTM',
      path: 'enterpriseValueOverEBITDATTM',
      higherIsBetter: false,
      weight: 0.7,
    },
    {
      key: 'enterpriseValueToSalesTTM',
      path: 'enterpriseValueToSalesTTM',
      higherIsBetter: false,
      weight: 0.5,
    },
    // Dividend yield: higher is better, modest weight
    {
      key: 'dividendYieldTTM',
      path: 'dividendYieldTTM',
      higherIsBetter: true,
      weight: 0.4,
    },
    // PEG: lower is better
    {
      key: 'valuationExtras.pegRatio',
      path: 'valuationExtras.pegRatio',
      higherIsBetter: false,
      weight: 0.7,
    },
    // Growth: higher is better
    {
      key: 'growth.revenueGrowthTTM',
      path: 'growth.revenueGrowthTTM',
      higherIsBetter: true,
      weight: 1.0,
    },
    {
      key: 'growth.epsGrowthTTM',
      path: 'growth.epsGrowthTTM',
      higherIsBetter: true,
      weight: 1.0,
    },
    {
      key: 'growth.ebitGrowthTTM',
      path: 'growth.ebitGrowthTTM',
      higherIsBetter: true,
      weight: 0.7,
    },
    {
      key: 'growth.fcfGrowthTTM',
      path: 'growth.fcfGrowthTTM',
      higherIsBetter: true,
      weight: 0.5,
    },
    // Quality / profitability
    {
      key: 'profitability.roic',
      path: 'profitability.roic',
      higherIsBetter: true,
      weight: 1.0,
    },
    {
      key: 'profitability.roe',
      path: 'profitability.roe',
      higherIsBetter: true,
      weight: 0.5,
    },
    {
      key: 'profitability.operatingMargin',
      path: 'profitability.operatingMargin',
      higherIsBetter: true,
      weight: 0.7,
    },
    {
      key: 'profitability.netMargin',
      path: 'profitability.netMargin',
      higherIsBetter: true,
      weight: 0.5,
    },
    // Financial health
    {
      key: 'financialHealth.debtToEquity',
      path: 'financialHealth.debtToEquity',
      higherIsBetter: false,
      weight: 0.7,
    },
    {
      key: 'financialHealth.interestCoverage',
      path: 'financialHealth.interestCoverage',
      higherIsBetter: true,
      weight: 0.7,
    },
    // Cash-flow & yield
    {
      key: 'cashFlow.fcfMargin',
      path: 'cashFlow.fcfMargin',
      higherIsBetter: true,
      weight: 0.7,
    },
    {
      key: 'cashFlow.fcfYield',
      path: 'cashFlow.fcfYield',
      higherIsBetter: true,
      weight: 1.0,
    },
    {
      key: 'financialHealth.ocfToDebt',
      path: 'financialHealth.ocfToDebt',
      higherIsBetter: true,
      weight: 0.5,
    },
  ];

  const getValue = (path: string): number | undefined => {
    const parts = path.split('.');
    let cur: any = ratios as any;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return typeof cur === 'number' && isFinite(cur) ? cur : undefined;
  };

  const metricScores: Record<string, number> = {};
  const symbol = (ratios as any).symbol ?? 'UNKNOWN';
  let totalWeight = 0;
  let weightedSum = 0;
  const reasons: string[] = [];

  for (const spec of metricSpecs) {
    const stats = industryStats[spec.key];
    if (!stats) continue;

    const value = getValue(spec.path);
    if (value == null || !isFinite(value)) continue;

    const p25 = stats.p25;
    const p75 = stats.p75;
    const range = p75 - p25;
    if (!isFinite(range) || range === 0) continue;

    // Normalized position 0..1 relative to interquartile range
    let pos =
      spec.higherIsBetter ? (value - p25) / range : (p75 - value) / range;

    // Clamp to [0, 1]
    if (!isFinite(pos)) continue;
    pos = Math.min(1, Math.max(0, pos));

    metricScores[spec.key] = pos;
    weightedSum += pos * spec.weight;
    totalWeight += spec.weight;

    // Build human-readable reasons for particularly strong/weak signals
    const label = spec.key;
    if (pos >= 0.75) {
      reasons.push(`${label} is strong vs sector peers`);
    } else if (pos <= 0.25) {
      reasons.push(`${label} is weak vs sector peers`);
    }
  }

  if (totalWeight === 0) {
    if (process.env.NODE_ENV !== 'production') {
    }

    return {
      classification: 'BLEND',
      score: 0,
      reasons: ['Insufficient data to compute composite score'],
    };
  }

  const rawScore = (weightedSum / totalWeight) * 100;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Derive Growth / Value classification from tilt between growth and value factors
  const growthKeys = [
    'growth.revenueGrowthTTM',
    'growth.epsGrowthTTM',
    'growth.ebitGrowthTTM',
    'growth.fcfGrowthTTM',
    'profitability.roic',
    'profitability.operatingMargin',
    'profitability.netMargin',
  ];
  const valueKeys = [
    'peRatioTTM',
    'priceToSalesRatioTTM',
    'priceToBookRatioTTM',
    'enterpriseValueOverEBITTTM',
    'enterpriseValueOverEBITDATTM',
    'enterpriseValueToSalesTTM',
    'dividendYieldTTM',
    'cashFlow.fcfYield',
  ];

  const avgForKeys = (keys: string[]): number | null => {
    const vals = keys
      .map((k) => metricScores[k])
      .filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const growthAvg = avgForKeys(growthKeys);
  const valueAvg = avgForKeys(valueKeys);

  let classification: StockClassification = 'BLEND';
  if (growthAvg != null && valueAvg != null) {
    const tilt = growthAvg - valueAvg;
    if (tilt > 0.1) {
      classification = 'GROWTH';
    } else if (tilt < -0.1) {
      classification = 'VALUE';
    }
  }

  return {
    classification,
    score,
    reasons,
  };
}

/**
 * Get color class for metric classification
 */
export function getClassificationColor(classification: MetricClassification): string {
  switch (classification) {
    case 'WAY_BELOW':
      return 'text-green-500';
    case 'BELOW':
      return 'text-green-400';
    case 'AVERAGE':
      return 'text-gray-400';
    case 'ABOVE':
      return 'text-orange-400';
    case 'WAY_ABOVE':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get badge variant for stock classification
 */
export function getStockClassificationVariant(
  classification: StockClassification
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (classification) {
    case 'GROWTH':
      return 'default';
    case 'VALUE':
      return 'secondary';
    case 'BLEND':
      return 'outline';
    default:
      return 'outline';
  }
}
