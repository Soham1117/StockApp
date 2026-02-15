'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPortfolio,
  addHolding,
  updateHolding,
  removeHolding,
  type Portfolio,
  type PortfolioHolding,
} from '@/lib/portfolio-api';

export function usePortfolio() {
  // Initialize with empty portfolio to avoid SSR issues
  const [portfolio, setPortfolio] = useState<Portfolio>(() => ({
    holdings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const [isLoading, setIsLoading] = useState(true);

  // Load portfolio from API on mount
  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        setIsLoading(true);
        const data = await getPortfolio();
        setPortfolio(data);
      } catch (error) {
        console.error('[usePortfolio] Failed to load portfolio:', error);
        // Keep empty portfolio on error
      } finally {
        setIsLoading(false);
      }
    };
    loadPortfolio();
  }, []);

  // Refresh portfolio from API
  const refresh = useCallback(async () => {
    try {
      const data = await getPortfolio();
      // Force a new object reference to ensure React detects the change
      setPortfolio({
        ...data,
        holdings: [...data.holdings], // Create new array reference
      });
    } catch (error) {
      console.error('[usePortfolio] Failed to refresh portfolio:', error);
    }
  }, []);

  // Add holding
  const add = useCallback(
    async (holding: Omit<PortfolioHolding, 'id' | 'addedAt'>) => {
      setIsLoading(true);
      try {
        await addHolding(holding);
        await refresh();
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  // Update holding
  const update = useCallback(
    async (symbol: string, updates: Partial<Omit<PortfolioHolding, 'symbol' | 'id' | 'addedAt'>>) => {
      setIsLoading(true);
      try {
        await updateHolding(symbol, updates);
        await refresh();
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  // Remove holding
  const remove = useCallback(
    async (symbol: string) => {
      setIsLoading(true);
      try {
        await removeHolding(symbol);
        await refresh();
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  // Get holding by symbol
  const getHolding = useCallback(
    (symbol: string) => {
      return portfolio.holdings.find(
        h => h.symbol.toUpperCase() === symbol.toUpperCase()
      ) || null;
    },
    [portfolio]
  );

  // Check if symbol is in portfolio
  const hasHolding = useCallback(
    (symbol: string) => {
      return getHolding(symbol) !== null;
    },
    [getHolding]
  );

  // Get all symbols
  const getSymbols = useCallback(() => {
    return portfolio.holdings.map(h => h.symbol.toUpperCase());
  }, [portfolio]);

  return {
    portfolio,
    holdings: portfolio.holdings,
    add,
    update,
    remove,
    getHolding,
    hasHolding,
    getSymbols,
    refresh,
    isLoading,
  };
}
