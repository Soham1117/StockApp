'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { NewsArticle } from '@/types';

interface NewsFeedProps {
  symbol: string;
}

interface NewsResponse {
  symbol: string;
  articles: NewsArticle[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

export function NewsFeed({ symbol }: NewsFeedProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'recent' | 'older'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [newsData, setNewsData] = useState<NewsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limit = 7; // Articles per page

  // Fetch news
  useEffect(() => {
    const fetchNews = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/stocks/${symbol}/news?page=${currentPage}&limit=${limit}&filter=${filter}`
        );
        if (!res.ok) {
          throw new Error('Failed to fetch news');
        }
        const data = await res.json();
        setNewsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load news');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNews();
  }, [symbol, currentPage, filter, limit]);

  // Client-side search filter
  const filteredArticles = useMemo(() => {
    if (!newsData?.articles) return [];
    if (!searchQuery.trim()) return newsData.articles;

    const query = searchQuery.toLowerCase();
    return newsData.articles.filter(
      (article) =>
        article.headline.toLowerCase().includes(query) ||
        article.summary?.toLowerCase().includes(query) ||
        article.source.toLowerCase().includes(query)
    );
  }, [newsData?.articles, searchQuery]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (newFilter: 'all' | 'recent' | 'older') => {
    setFilter(newFilter);
    setCurrentPage(1);
    setSearchQuery('');
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>News & Events</CardTitle>
          <Input
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <Tabs value={filter} onValueChange={(v) => handleFilterChange(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="recent">Recent (3mo)</TabsTrigger>
            <TabsTrigger value="older">Older</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-4 flex-1 flex flex-col min-h-0">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Error loading news: {error}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setCurrentPage(1);
                    setError(null);
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No articles match your search' : 'No news available'}
              </div>
            ) : (
              <>
                <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                  {filteredArticles.map((article, i) => {
                    const articleDate = article.date
                      ? new Date(`${article.date}T00:00:00Z`)
                      : article.datetime
                        ? new Date(article.datetime * 1000)
                        : null;
                    const timeAgo = articleDate
                      ? formatDistanceToNow(articleDate, { addSuffix: true })
                      : null;

                    return (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-md border border-border/30 hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-xs mb-1 text-foreground group-hover:text-accent-foreground transition-colors line-clamp-2">
                              {article.headline}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-accent-foreground/90 flex-wrap">
                              <span className="font-medium">{article.source}</span>
                              {article.backendSource === 'defeatbeta' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 group-hover:border-accent-foreground/50 group-hover:text-accent-foreground group-hover:bg-accent-foreground/10">
                                  Defeatbeta
                                </Badge>
                              )}
                              {articleDate && (
                                <>
                                  <span className="group-hover:text-accent-foreground/70">•</span>
                                  <span>
                                    {format(articleDate, 'MMM dd, yyyy')}
                                    {timeAgo ? ` (${timeAgo})` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 group-hover:text-accent-foreground transition-colors mt-0.5" />
                        </div>
                      </a>
                    );
                  })}
                </div>

                {/* Pagination */}
                {newsData?.pagination && newsData.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/30 flex-wrap gap-4 flex-shrink-0">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * limit) + 1}-
                      {Math.min(currentPage * limit, newsData.pagination.total)} of{' '}
                      {newsData.pagination.total} articles
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(7, newsData.pagination.totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (newsData.pagination!.totalPages <= 7) {
                            pageNum = i + 1;
                          } else if (currentPage <= 4) {
                            pageNum = i + 1;
                          } else if (currentPage >= newsData.pagination!.totalPages - 3) {
                            pageNum = newsData.pagination!.totalPages - 6 + i;
                          } else {
                            pageNum = currentPage - 3 + i;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(pageNum)}
                              className="w-10"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!newsData.pagination.hasMore}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(newsData.pagination!.totalPages)}
                        disabled={currentPage === newsData.pagination!.totalPages}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

