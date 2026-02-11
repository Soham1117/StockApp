'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { format, formatDistanceToNow } from 'date-fns';
import type { NewsArticle } from '@/types';

interface NewsWithSymbol extends NewsArticle {
  symbol: string;
}

type TimeFilter = '7days' | '30days' | 'all';
type GroupBy = 'stock' | 'date';

export function PortfolioNewsSection() {
  const { holdings } = usePortfolio();
  // Memoize symbols array to prevent infinite re-renders
  const symbols = useMemo(
    () => holdings.map((h) => h.symbol.toUpperCase()),
    [holdings]
  );
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7days');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [allNews, setAllNews] = useState<NewsWithSymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);

  // Fetch news for all portfolio symbols
  useEffect(() => {
    const fetchAllNews = async () => {
      if (symbols.length === 0) {
        setAllNews([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setFailedSymbols([]);

      // Split into initial batch (first 5) and remaining
      const initialSymbols = symbols.slice(0, 5);
      const remainingSymbols = symbols.slice(5);

      // Fetch initial batch immediately
      const initialResults = await Promise.allSettled(
        initialSymbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/stocks/${symbol}/news?limit=10&filter=all`);
            if (!res.ok) throw new Error(`Failed for ${symbol}`);
            const data = await res.json();
            return (data.articles || []).map((article: NewsArticle) => ({
              ...article,
              symbol,
            }));
          } catch (error) {
            setFailedSymbols((prev) => [...prev, symbol]);
            return [];
          }
        })
      );

      // Process initial results
      const initialNews: NewsWithSymbol[] = [];
      initialResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          initialNews.push(...result.value);
        } else {
          setFailedSymbols((prev) => [...prev, initialSymbols[index]]);
        }
      });

      setAllNews(initialNews);

      // Fetch remaining symbols in background
      if (remainingSymbols.length > 0) {
        const remainingResults = await Promise.allSettled(
          remainingSymbols.map(async (symbol) => {
            try {
              const res = await fetch(`/api/stocks/${symbol}/news?limit=10&filter=all`);
              if (!res.ok) throw new Error(`Failed for ${symbol}`);
              const data = await res.json();
              return (data.articles || []).map((article: NewsArticle) => ({
                ...article,
                symbol,
              }));
            } catch (error) {
              setFailedSymbols((prev) => [...prev, symbol]);
              return [];
            }
          })
        );

        const remainingNews: NewsWithSymbol[] = [];
        remainingResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            remainingNews.push(...result.value);
          } else {
            setFailedSymbols((prev) => [...prev, remainingSymbols[index]]);
          }
        });

        // Merge and deduplicate
        const seen = new Set<string>();
        const merged = [...initialNews, ...remainingNews].filter((article) => {
          const key = `${article.headline}|${article.source}|${article.symbol}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Sort by date (newest first)
        merged.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        setAllNews(merged);
      } else {
        // Sort initial news
        initialNews.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        setAllNews(initialNews);
      }

      setLoading(false);
    };

    fetchAllNews();
  }, [symbols]);

  // Filter by time
  const filteredNews = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    let cutoff = 0;

    if (timeFilter === '7days') {
      cutoff = now - 7 * 24 * 60 * 60;
    } else if (timeFilter === '30days') {
      cutoff = now - 30 * 24 * 60 * 60;
    }

    return allNews.filter((article) => {
      if (timeFilter === 'all') return true;
      return article.datetime && article.datetime >= cutoff;
    });
  }, [allNews, timeFilter]);

  // Group news
  const groupedNews = useMemo(() => {
    if (groupBy === 'stock') {
      const grouped = new Map<string, NewsWithSymbol[]>();
      filteredNews.forEach((article) => {
        const key = article.symbol;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(article);
      });
      return Array.from(grouped.entries())
        .map(([symbol, articles]) => ({ symbol, articles }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
    } else {
      // Group by date
      const grouped = new Map<string, NewsWithSymbol[]>();
      filteredNews.forEach((article) => {
        const dateKey = article.datetime
          ? format(new Date(article.datetime * 1000), 'yyyy-MM-dd')
          : 'Unknown';
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, []);
        }
        grouped.get(dateKey)!.push(article);
      });
      return Array.from(grouped.entries())
        .map(([date, articles]) => ({ date, articles }))
        .sort((a, b) => b.date.localeCompare(a.date));
    }
  }, [filteredNews, groupBy]);

  if (symbols.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio News</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Add stocks to your portfolio to see aggregated news.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Portfolio News</CardTitle>
          <div className="flex gap-2">
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">By Date</SelectItem>
                <SelectItem value="stock">By Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {failedSymbols.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-yellow-500">
            <AlertCircle className="h-4 w-4" />
            <span>Unable to fetch news for: {failedSymbols.join(', ')}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : filteredNews.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No news found for the selected time period.
          </p>
        ) : (
          <div className="space-y-6">
            {groupBy === 'stock' ? (
              // Grouped by stock
              groupedNews.map((group) => {
                if ('symbol' in group) {
                  const { symbol, articles } = group;
                  return (
                    <div key={symbol} className="space-y-2">
                      <h3 className="font-semibold font-mono">{symbol}</h3>
                      <div className="space-y-3 pl-4 border-l-2 border-border">
                        {articles.map((article, idx) => (
                          <NewsItem key={`${symbol}-${idx}`} article={article} />
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })
            ) : (
              // Grouped by date
              groupedNews.map((group) => {
                if ('date' in group) {
                  const { date, articles } = group;
                  return (
                    <div key={date} className="space-y-2">
                      <h3 className="font-semibold">
                        {date === 'Unknown' ? 'Unknown Date' : format(new Date(date), 'MMMM d, yyyy')}
                      </h3>
                      <div className="space-y-3 pl-4 border-l-2 border-border">
                        {articles.map((article, idx) => (
                          <NewsItem key={`${date}-${idx}`} article={article} />
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewsItem({ article }: { article: NewsWithSymbol }) {
  // Sanitize summary - handle both string and structured data
  const getSanitizedSummary = () => {
    if (!article.summary) return null;

    // If summary is a string, return it
    if (typeof article.summary === 'string') {
      return article.summary;
    }

    // If summary is structured data (array of paragraph objects), extract text
    try {
      const parsed = typeof article.summary === 'string' ? JSON.parse(article.summary) : article.summary;
      if (Array.isArray(parsed)) {
        // Extract paragraph text from first item
        const firstParagraph = parsed[0];
        if (firstParagraph && firstParagraph.paragraph) {
          return firstParagraph.paragraph;
        }
      }
    } catch {
      // If parsing fails, return null
      return null;
    }

    return null;
  };

  const sanitizedSummary = getSanitizedSummary();

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 hover:text-primary transition-colors"
        >
          <p className="font-medium text-sm">{article.headline}</p>
        </a>
        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs font-mono">
          {article.symbol}
        </Badge>
        <span className="text-xs text-muted-foreground">{article.source}</span>
        {article.datetime && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(article.datetime * 1000), { addSuffix: true })}
          </span>
        )}
      </div>
      {sanitizedSummary && (
        <p className="text-xs text-muted-foreground line-clamp-2">{sanitizedSummary}</p>
      )}
    </div>
  );
}
