'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { TranscriptMetadata } from '@/types';

interface TranscriptsViewerProps {
  symbol: string;
}

interface TranscriptsResponse {
  symbol: string;
  transcripts: TranscriptMetadata[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function TranscriptsViewer({ symbol }: TranscriptsViewerProps) {
  const [data, setData] = useState<TranscriptsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [paragraphs, setParagraphs] = useState<Array<Record<string, unknown>>>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20; // Transcripts per page

  useEffect(() => {
    async function fetchTranscripts() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/stocks/${symbol}/transcripts?page=${currentPage}&limit=${limit}`);
        if (res.ok) {
          const transcripts = await res.json();
          setData(transcripts);
          // Reset selected index when page changes
          setSelectedIndex(null);
          setParagraphs([]);
        }
      } catch (error) {
        // Failed to fetch transcripts
      } finally {
        setIsLoading(false);
      }
    }

    fetchTranscripts();
  }, [symbol, currentPage]);

  async function handleSelectTranscript(index: number) {
    if (!data) return;
    const transcript = data.transcripts[index];
    if (!transcript) return;

    const year = transcript.year;
    const quarterRaw = transcript.quarter;

    if (!year || !quarterRaw) {
      return;
    }

    // quarter may be stored as "Q2" or "2" – normalise to numeric
    const quarterMatch = String(quarterRaw).match(/(\d+)/);
    const quarter = quarterMatch ? Number(quarterMatch[1]) : NaN;

    if (!Number.isFinite(quarter)) {
      return;
    }

    setSelectedIndex(index);
    setIsLoadingContent(true);
    setParagraphs([]);

    try {
      const res = await fetch(
        `/api/stocks/${symbol}/transcripts/content?year=${encodeURIComponent(
          String(year)
        )}&quarter=${encodeURIComponent(String(quarter))}`
      );

      if (!res.ok) {
        return;
      }

      const json = (await res.json()) as {
        paragraphs?: Array<Record<string, unknown>>;
      };

      setParagraphs(json.paragraphs ?? []);
    } catch (error) {
      // Error fetching transcript content
    } finally {
      setIsLoadingContent(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.transcripts || data.transcripts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-6 w-6" />
            Earnings Call Transcripts
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-base text-muted-foreground">No earnings call transcripts available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileText className="h-6 w-6" />
          Earnings Call Transcripts
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
          {/* Column 1: transcript list with pagination */}
          <div className="flex flex-col space-y-2">
            <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar min-h-[300px] max-h-[450px]">
              {data.transcripts.map((transcript, index) => {
                const isSelected = selectedIndex === index;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSelectTranscript(index)}
                    className={`w-full text-left p-2 rounded-md border transition-colors ${
                      isSelected ? 'bg-accent text-accent-foreground' : 'bg-card hover:bg-accent/50'
                    }`}
                  >
                    {transcript.date && (
                      <p className="text-base font-medium">
                        {format(parseISO(transcript.date), 'MMM dd, yyyy')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      {transcript.quarter && <span>Q{transcript.quarter}</span>}
                      {transcript.year && <span>{transcript.year}</span>}
                      {transcript.type && <span>{transcript.type}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Pagination controls */}
            {data.pagination && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground text-center">
                  Page {data.pagination.page} of {data.pagination.totalPages}
                  <br />
                  <span className="text-xs">
                    ({data.pagination.total} total)
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(data.pagination!.totalPages, p + 1))}
                  disabled={!data.pagination.hasMore || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Column 2 & 3: transcript content (spans 2 columns) */}
          <div className="md:col-span-2">
            {selectedIndex === null ? (
              <p className="text-sm text-muted-foreground">
                Select an earnings call on the left to view the transcript.
              </p>
            ) : isLoadingContent ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : paragraphs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No paragraph-level transcript data available for this call.
              </p>
            ) : (
              <div className="space-y-3 overflow-y-auto custom-scrollbar min-h-[400px] max-h-[600px] pr-1 text-sm leading-relaxed">
                {paragraphs.map((para, idx) => {
                  const speaker = (para.speaker as string | undefined) ?? '';
                  const content =
                    (para.content as string | undefined) ??
                    (para.text as string | undefined) ??
                    JSON.stringify(para);
                  const paragraphNumber =
                    (para.paragraph_number as string | number | undefined) ?? undefined;

                  return (
                    <div key={idx} className="border-b border-border pb-2 last:border-b-0">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium">
                          {speaker || 'Unknown speaker'}
                          {typeof paragraphNumber !== 'undefined' ? ` · #${paragraphNumber}` : ''}
                        </span>
                      </div>
                      <p>{content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

