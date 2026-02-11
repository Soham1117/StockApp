import { useState } from 'react';
import type { StockResearchPackage } from '@/types';
import { generateFilename, triggerFileDownload, type ExportFormat } from '@/lib/export-utils';

interface UseExportStockOptions {
  symbol: string;
  sector: string;
  format: ExportFormat;
}

interface UseExportStockResult {
  exportStock: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useExportStock(options: UseExportStockOptions): UseExportStockResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function exportStock() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/export/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: options.symbol,
          sector: options.sector,
          format: options.format,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Export failed: ${res.status} ${res.statusText} - ${text}`);
      }

      if (options.format === 'json') {
        const data: StockResearchPackage = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const filename = generateFilename(options.symbol, 'json');
        triggerFileDownload(blob, filename);
      } else {
        const blob = await res.blob();
        const filename = generateFilename(options.symbol, options.format);
        triggerFileDownload(blob, filename);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }

  return { exportStock, isLoading, error };
}


