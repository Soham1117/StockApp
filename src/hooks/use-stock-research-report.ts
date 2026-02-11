import { useQuery } from '@tanstack/react-query';
import type { StockResearchReport } from '@/types';

export function useStockResearchReport(symbol: string | null) {
  return useQuery({
    queryKey: ['stockResearchReport', symbol],
    queryFn: async (): Promise<StockResearchReport> => {
      const response = await fetch(`/api/stocks/${symbol}/research-report`);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Failed to fetch research report: ${response.status} ${response.statusText} ${text.slice(0, 200)}`
        );
      }

      return response.json();
    },
    enabled: !!symbol,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
    refetchOnWindowFocus: false,
  });
}


