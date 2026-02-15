'use client';

import { useQuery } from '@tanstack/react-query';
import { usePortfolio } from './use-portfolio';
import { useEffect, useState, useMemo } from 'react';

interface PriceData {
  symbol: string;
  closes: number[];
}

interface PortfolioPricesResponse {
  prices: PriceData[];
}

interface PortfolioPrices {
  pricesMap: Map<string, number>;
  lastUpdated: number;
}

async function fetchPortfolioPrices(symbols: string[]): Promise<PortfolioPrices> {
  if (symbols.length === 0) {
    return { pricesMap: new Map(), lastUpdated: Date.now() };
  }

  const res = await fetch('/api/portfolio/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols }),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch portfolio prices');
  }

  const data: PortfolioPricesResponse = await res.json();
  const pricesMap = new Map<string, number>();

  (data.prices || []).forEach((p: PriceData) => {
    if (p.closes && p.closes.length > 0) {
      pricesMap.set(p.symbol.toUpperCase(), p.closes[p.closes.length - 1]);
    }
  });

  return { pricesMap, lastUpdated: Date.now() };
}

export function usePortfolioPrices() {
  const { holdings } = usePortfolio();
  // Memoize symbols array to prevent infinite re-renders
  const symbols = useMemo(
    () => holdings.map((h) => h.symbol.toUpperCase()),
    [holdings]
  );
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Track page visibility for auto-refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const {
    data: portfolioPrices,
    refetch,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['portfolio-prices', symbols],
    queryFn: () => fetchPortfolioPrices(symbols),
    refetchInterval: isPageVisible ? 30000 : false, // 30 seconds when page is visible
    refetchIntervalInBackground: false,
    staleTime: 25000, // Consider data stale after 25 seconds
  });

  return {
    pricesMap: portfolioPrices?.pricesMap || new Map(),
    lastUpdated: portfolioPrices?.lastUpdated || 0,
    refetch,
    isLoading,
    isFetching,
    dataUpdatedAt,
  };
}
