'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ResearchReportPanelProps {
  symbol: string;
}

export function ResearchReportPanel({ symbol }: ResearchReportPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    try {
      setIsDownloading(true);
      setErrorMessage(null);

      const link = document.createElement('a');
      link.href = `/api/stocks/${symbol}/research-report/pdf`;
      link.download = `${symbol.toUpperCase()}-research-note.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate research report PDF';
      setErrorMessage(message);
      // eslint-disable-next-line no-console
      // Failed to download report PDF
    } finally {
      setIsDownloading(false);
    }
  }, [symbol]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle>AI Research Note</CardTitle>
        {errorMessage && (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <AlertTriangle className="h-3 w-3" />
            <span>Generation error</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? 'Generating PDF...' : 'Generate & download report (PDF)'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Report is generated on demand using quantitative metrics and sector
            comparisons only.
          </span>
        </div>

        {errorMessage && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {errorMessage}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground mt-2">
          This AI-generated note is not investment advice and does not
          incorporate news, management quality, or other qualitative factors.
        </p>
      </CardContent>
    </Card>
  );
}

