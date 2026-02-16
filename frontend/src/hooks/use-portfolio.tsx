'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import {
  getPortfolio,
  addHolding,
  updateHolding,
  removeHolding,
  type Portfolio,
  type PortfolioHolding,
} from '@/lib/portfolio-api';

interface PortfolioContextValue {
  portfolio: Portfolio;
  holdings: PortfolioHolding[];
  add: (holding: Omit<PortfolioHolding, 'id' | 'addedAt'>) => Promise<void>;
  update: (symbol: string, updates: Partial<Omit<PortfolioHolding, 'symbol' | 'id' | 'addedAt'>>) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
  getHolding: (symbol: string) => PortfolioHolding | null;
  hasHolding: (symbol: string) => boolean;
  getSymbols: () => string[];
  refresh: () => Promise<void>;
  isLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio>(() => ({
    holdings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const [isLoading, setIsLoading] = useState(true);

  // Load portfolio from API on mount (single fetch for all consumers)
  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        setIsLoading(true);
        const data = await getPortfolio();
        setPortfolio(data);
      } catch (error) {
        console.error('[usePortfolio] Failed to load portfolio:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPortfolio();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getPortfolio();
      setPortfolio({
        ...data,
        holdings: [...data.holdings],
      });
    } catch (error) {
      console.error('[usePortfolio] Failed to refresh portfolio:', error);
    }
  }, []);

  const add = useCallback(
    async (holding: Omit<PortfolioHolding, 'id' | 'addedAt'>) => {
      setIsLoading(true);
      try {
        await addHolding(holding);
        await refresh();
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  const update = useCallback(
    async (symbol: string, updates: Partial<Omit<PortfolioHolding, 'symbol' | 'id' | 'addedAt'>>) => {
      setIsLoading(true);
      try {
        await updateHolding(symbol, updates);
        await refresh();
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (symbol: string) => {
      setIsLoading(true);
      try {
        await removeHolding(symbol);
        await refresh();
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  const getHoldingFn = useCallback(
    (symbol: string) => {
      return portfolio.holdings.find(
        h => h.symbol.toUpperCase() === symbol.toUpperCase()
      ) || null;
    },
    [portfolio]
  );

  const hasHoldingFn = useCallback(
    (symbol: string) => {
      return getHoldingFn(symbol) !== null;
    },
    [getHoldingFn]
  );

  const getSymbols = useCallback(() => {
    return portfolio.holdings.map(h => h.symbol.toUpperCase());
  }, [portfolio]);

  const value: PortfolioContextValue = {
    portfolio,
    holdings: portfolio.holdings,
    add,
    update,
    remove,
    getHolding: getHoldingFn,
    hasHolding: hasHoldingFn,
    getSymbols,
    refresh,
    isLoading,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
