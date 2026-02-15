import type { Stock, StockMetrics, ValuationRatios } from '@/types';
import type { CustomRule } from './saved-screens-api';

/**
 * Get metric value from StockMetrics by metric key
 * Supports both flat metrics (e.g., 'peRatioTTM') and nested metrics (e.g., 'profitability.roe')
 */
export function getMetricValue(metrics: StockMetrics, metricKey: string): number | null {
  const { ratios } = metrics;

  // Handle flat metrics directly on ratios
  if (metricKey in ratios) {
    const value = ratios[metricKey as keyof ValuationRatios];
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  // Handle nested metrics (e.g., 'profitability.roe')
  const parts = metricKey.split('.');
  if (parts.length === 2) {
    const [parent, child] = parts;
    const parentObj = ratios[parent as keyof ValuationRatios] as Record<string, unknown> | undefined;

    if (parentObj && typeof parentObj === 'object' && parentObj !== null) {
      const value = parentObj[child];
      return typeof value === 'number' && isFinite(value) ? value : null;
    }
  }

  return null;
}

/**
 * Check if a stock matches a single custom rule
 */
function matchesRule(metrics: StockMetrics, rule: CustomRule): boolean {
  if (!rule.enabled) return true; // Disabled rules always match

  const value = getMetricValue(metrics, rule.metric);
  if (value === null || !isFinite(value)) return false;

  switch (rule.operator) {
    case '<':
      return value < (rule.value as number);
    case '>':
      return value > (rule.value as number);
    case '<=':
      return value <= (rule.value as number);
    case '>=':
      return value >= (rule.value as number);
    case '=':
      return Math.abs(value - (rule.value as number)) < 0.01;
    case '!=':
      return Math.abs(value - (rule.value as number)) >= 0.01;
    case 'between': {
      const [min, max] = rule.value as [number, number];
      return value >= min && value <= max;
    }
    default:
      return true;
  }
}

/**
 * Apply custom rules to filter stocks
 * @param stocks - Array of stocks to filter
 * @param metrics - Array of stock metrics (must match stocks by symbol)
 * @param rules - Array of custom rules to apply
 * @param ruleLogic - 'AND' or 'OR' logic for combining rules
 */
export function applyCustomRules(
  stocks: Stock[],
  metrics: StockMetrics[],
  rules: CustomRule[],
  ruleLogic: 'AND' | 'OR' = 'AND'
): Stock[] {
  if (!rules || rules.length === 0) return stocks;

  const enabledRules = rules.filter((r) => r.enabled);
  if (enabledRules.length === 0) return stocks;

  return stocks.filter((stock) => {
    const stockMetrics = metrics.find((m) => m.symbol === stock.symbol);
    if (!stockMetrics) return false;

    if (ruleLogic === 'AND') {
      // All rules must match
      return enabledRules.every((rule) => matchesRule(stockMetrics, rule));
    } else {
      // At least one rule must match
      return enabledRules.some((rule) => matchesRule(stockMetrics, rule));
    }
  });
}

/**
 * Filter stocks by market cap bucket
 */
export function filterByMarketCap(
  stocks: Stock[],
  cap: 'large' | 'mid' | 'small' | 'all'
): Stock[] {
  if (cap === 'all') return stocks;

  return stocks.filter((stock) => {
    const marketCap = stock.marketCap || 0;
    switch (cap) {
      case 'large':
        return marketCap >= 10_000_000_000; // >= $10B
      case 'mid':
        return marketCap >= 2_000_000_000 && marketCap < 10_000_000_000; // $2B - $10B
      case 'small':
        return marketCap >= 300_000_000 && marketCap < 2_000_000_000; // $300M - $2B
      default:
        return true;
    }
  });
}

/**
 * Filter stocks by country
 */
export function filterByCountry(stocks: Stock[], country?: string): Stock[] {
  if (!country) return stocks;
  // Handle case-insensitive matching and empty strings
  return stocks.filter((stock) => {
    const stockCountry = (stock.country || '').trim();
    const filterCountry = country.trim();
    return stockCountry.toLowerCase() === filterCountry.toLowerCase();
  });
}

/**
 * Filter stocks by industry/sector
 */
export function filterByIndustry(stocks: Stock[], industry?: string): Stock[] {
  if (!industry) return stocks;
  return stocks.filter(
    (stock) => stock.industry === industry || stock.sector === industry
  );
}

/**
 * Apply all filters to stocks
 */
export function applyFilters(
  stocks: Stock[],
  metrics: StockMetrics[],
  filters: {
    country?: string;
    industry?: string;
    cap?: 'large' | 'mid' | 'small' | 'all';
    customRules?: CustomRule[];
    ruleLogic?: 'AND' | 'OR';
  }
): Stock[] {
  let filtered = stocks;

  // Apply basic filters
  filtered = filterByCountry(filtered, filters.country);
  filtered = filterByIndustry(filtered, filters.industry);
  filtered = filterByMarketCap(filtered, filters.cap || 'all');

  // Apply custom rules (requires metrics)
  if (filters.customRules && filters.customRules.length > 0) {
    filtered = applyCustomRules(
      filtered,
      metrics,
      filters.customRules,
      filters.ruleLogic || 'AND'
    );
  }

  return filtered;
}
