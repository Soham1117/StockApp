import { useQuery } from '@tanstack/react-query';

interface IndustriesResponse {
  industries: string[];
  sectors?: string[];
}

/**
 * Fetch available sectors (and industries for reference)
 * Now primarily used for sectors since grouping is by sector.
 */
export function useIndustries() {
  return useQuery({
    queryKey: ['industries'],
    queryFn: async (): Promise<IndustriesResponse> => {
      const response = await fetch('/api/meta/industries');

      if (!response.ok) {
        throw new Error('Failed to fetch sectors');
      }

      return response.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
