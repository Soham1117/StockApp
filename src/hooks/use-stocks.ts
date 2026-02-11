import { useQuery } from '@tanstack/react-query';
import type { StocksByMarketCap, IndustryMetrics, NewsArticle, RRGData } from '@/types';

/**
 * Fetch stocks for a sector, grouped by market cap
 */
export function useIndustryStocks(sector: string | null) {
  return useQuery({
    queryKey: ['sectorStocks', sector],
    queryFn: async (): Promise<StocksByMarketCap> => {
      const response = await fetch(
        `/api/sector/${encodeURIComponent(sector!)}/stocks`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch stocks');
      }

      return response.json();
    },
    enabled: !!sector,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
  });
}

/**
 * Fetch metrics for stocks in a sector
 */
export function useIndustryMetrics(sector: string | null, symbols: string[]) {
  return useQuery({
    queryKey: ['sectorMetrics', sector, symbols],
    queryFn: async (): Promise<IndustryMetrics> => {
      const symbolsParam = symbols.join(',');
      const response = await fetch(
        `/api/sector/${encodeURIComponent(sector!)}/metrics?symbols=${symbolsParam}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      return response.json();
    },
    enabled: !!sector && symbols.length > 0,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
  });
}

/**
 * Fetch news for a stock
 */
export function useStockNews(symbol: string | null) {
  return useQuery({
    queryKey: ['stockNews', symbol],
    queryFn: async (): Promise<{ symbol: string; articles: NewsArticle[] }> => {
      const response = await fetch(`/api/stocks/${symbol}/news`);

      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }

      return response.json();
    },
    enabled: !!symbol,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
  });
}

/**
 * Fetch RRG data for stocks vs benchmark
 */
export function useRRG(symbols: string[], benchmark: string = 'SPY', days: number = 180) {
  return useQuery({
    queryKey: ['rrg', symbols, benchmark, days],
    queryFn: async (): Promise<RRGData> => {
      const symbolsParam = symbols.join(',');
      // Support extended lookback up to 20 years (7300 days)
      const safeDays = Math.max(30, Math.min(7300, days || 180));
      const response = await fetch(
        `/api/rrg?symbols=${symbolsParam}&benchmark=${benchmark}&days=${safeDays}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch RRG data');
      }

      return response.json();
    },
    enabled: symbols.length > 0,
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
  });
}

interface RRGHistoryPoint {
  symbol: string;
  date: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: string;
  lookback_days: number;
}

interface RRGHistoryData {
  benchmark: string;
  lookback_days: number;
  interval: string;
  start_date: string;
  end_date: string;
  symbols: string[];
  total_points: number;
  data: RRGHistoryPoint[];
}

/**
 * Fetch historical RRG data for time-based visualization
 */
export function useRRGHistory(
  symbols: string[],
  lookbackDays: number = 180,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ['rrg-history', symbols, lookbackDays, startDate, endDate],
    queryFn: async (): Promise<RRGHistoryData> => {
      const symbolsParam = symbols.join(',');
      const params = new URLSearchParams({
        symbols: symbolsParam,
        lookback_days: lookbackDays.toString(),
      });
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const response = await fetch(`/api/rrg/history?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch RRG history');
      }

      return response.json();
    },
    enabled: symbols.length > 0,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
  });
}

interface RRGPrediction {
  symbol: string;
  horizon_days: number;
  lookback_days: number;
  predicted_rsRatio: number;
  predicted_rsMomentum: number;
  predicted_quadrant: string;
  confidence: number;
  rsRatio_range: { lower: number; upper: number };
  rsMomentum_range: { lower: number; upper: number };
}

interface RRGPredictData {
  predictions: RRGPrediction[];
  horizon_days: number;
  lookback_days: number;
  missing_models?: string[];
}

/**
 * Fetch RRG predictions using ARIMA models
 */
export function useRRGPredictions(
  symbols: string[],
  horizonDays: number = 30,
  lookbackDays: number = 180
) {
  return useQuery({
    queryKey: ['rrg-predictions', symbols, horizonDays, lookbackDays],
    queryFn: async (): Promise<RRGPredictData> => {
      const response = await fetch('/api/rrg/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          horizon_days: horizonDays,
          lookback_days: lookbackDays,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Failed to fetch RRG predictions: ${response.status}`);
        (error as any).details = errorText;
        throw error;
      }

      return response.json();
    },
    enabled: symbols.length > 0,
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
  });
}
