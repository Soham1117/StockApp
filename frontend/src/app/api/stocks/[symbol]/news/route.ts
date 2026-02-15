import { NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { getFromCache, setCache, TTL } from '@/lib/cache';
import { env } from '@/lib/env';
import type { NewsArticle } from '@/types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const LOOKBACK_DAYS = 90; // reduce window to speed up
const FINNHUB_TIMEOUT_MS = 8000; // Finnhub timeout (usually fast)
const DEFEATBETA_TIMEOUT_MS =
  Number(process.env.NEWS_FASTAPI_TIMEOUT_MS || 60000); // default 60s; configurable
const CACHE_VERSION = 'v5'; // bump when logic changes

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/[symbol]/news
 * Fetch company news for the last year from Finnhub and defeatbeta (via FastAPI),
 * then combine, dedupe, and cache the result.
 * Supports pagination: ?page=1&limit=20&filter=all|recent|older
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '6', 10)));
    const filter = searchParams.get('filter') || 'all'; // all, recent, older

    const cacheKey = `news:${upperSymbol}:${CACHE_VERSION}`;
    const cached = getFromCache<NewsArticle[]>(cacheKey);

    let allArticles: NewsArticle[] = [];
    let finnhubResult: PromiseSettledResult<NewsArticle[]> | undefined;
    let defeatbetaResult: PromiseSettledResult<NewsArticle[]> | undefined;
    let finnhubArticles: NewsArticle[] = [];
    let defeatbetaArticles: NewsArticle[] = [];
    let sourceStatus:
      | {
          finnhub: { ok: boolean; count?: number; error?: string };
          defeatbeta: { ok: boolean; count?: number; error?: string };
        }
      | undefined;

    if (cached) {
      allArticles = cached;
    } else {

    const withTimeout = async <T>(
      promise: Promise<T>,
      ms: number,
      sourceName: string,
      abortController?: AbortController
    ): Promise<T> => {
      return Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => {
          
            if (abortController) {
              abortController.abort();
            }
            reject(new Error(`timeout after ${ms}ms`));
          }, ms);
        }),
      ]);
    };

    const fetchFinnhub = async (signal?: AbortSignal): Promise<NewsArticle[]> => {
      if (!env.finnhubApiKey) return [];
      const startTime = Date.now();
      try {
        const to = new Date();
        const from = subDays(to, LOOKBACK_DAYS);
        const fromStr = format(from, 'yyyy-MM-dd');
        const toStr = format(to, 'yyyy-MM-dd');

        const url = `${FINNHUB_BASE}/company-news?symbol=${upperSymbol}&from=${fromStr}&to=${toStr}&token=${env.finnhubApiKey}`;
        const response = await fetch(url, { cache: 'no-store', signal });

        if (response.ok) {
          const rawArticles = await response.json();
          const articles = Array.isArray(rawArticles)
            ? rawArticles.map((article: Partial<NewsArticle>) => {
                const datetime = article.datetime || 0;
                const dateUtc =
                  datetime && datetime > 0
                    ? new Date(datetime * 1000).toISOString().slice(0, 10)
                    : undefined;
                return {
                  headline: article.headline || '',
                  summary: article.summary || '',
                  url: article.url || '',
                  source: article.source || '',
                  datetime,
                  date: dateUtc,
                  category: article.category || '',
                  image: article.image || '',
                  backendSource: 'finnhub' as const,
                };
              })
            : [];
          const duration = Date.now() - startTime;
          
          return articles;
        }
      } catch (err) {
      }
      return [];
    };

    const fetchDefeatbeta = async (signal?: AbortSignal): Promise<NewsArticle[]> => {
      if (!env.fastapiBaseUrl) return [];
      const startTime = Date.now();
      try {
        const res = await fetch(`${env.fastapiBaseUrl}/defeatbeta/news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: upperSymbol }),
          signal,
        });

        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.news) ? json.news : [];
          const articles = items.map((item: any): NewsArticle => {
            const reportDate = item.report_date as string | undefined;
            let ts = 0;
            let dateUtc: string | undefined;
            if (reportDate) {
              const d = new Date(reportDate);
              if (!isNaN(d.getTime())) {
                ts = Math.floor(d.getTime() / 1000);
                dateUtc = d.toISOString().slice(0, 10);
              }
            }
            return {
              headline: item.title || '',
              summary: item.news || undefined,  // Include news content as summary
              url: item.link || '',
              source: item.publisher || '',
              datetime: ts,
              date: dateUtc,
              category: item.type || '',
              image: '',
              backendSource: 'defeatbeta' as const,
            };
          });
          const duration = Date.now() - startTime;
          
          return articles;
        }
      } catch (err) {
      }
      return [];
    };

    // Fetch both sources in parallel with per-source timeouts and cancellation
    const totalStartTime = Date.now();
    const finnhubAbortController = new AbortController();
    const defeatbetaAbortController = new AbortController();

    const [finnhubResult, defeatbetaResult] = await Promise.allSettled([
      withTimeout(
        fetchFinnhub(finnhubAbortController.signal),
        FINNHUB_TIMEOUT_MS,
        'Finnhub',
        finnhubAbortController
      ),
      withTimeout(
        fetchDefeatbeta(defeatbetaAbortController.signal),
        DEFEATBETA_TIMEOUT_MS,
        'Defeatbeta',
        defeatbetaAbortController
      ),
    ]);
    const totalDuration = Date.now() - totalStartTime;

    finnhubArticles =
      finnhubResult && finnhubResult.status === 'fulfilled' ? finnhubResult.value : [];
    defeatbetaArticles =
      defeatbetaResult && defeatbetaResult.status === 'fulfilled' ? defeatbetaResult.value : [];

    sourceStatus =
      finnhubResult || defeatbetaResult
        ? {
            finnhub:
              finnhubResult && finnhubResult.status === 'fulfilled'
                ? { ok: true, count: finnhubArticles.length }
                : { ok: false, error: String(finnhubResult && (finnhubResult as any).reason) },
            defeatbeta:
              defeatbetaResult && defeatbetaResult.status === 'fulfilled'
                ? { ok: true, count: defeatbetaArticles.length }
                : { ok: false, error: String(defeatbetaResult && (defeatbetaResult as any).reason) },
          }
        : undefined;

    

    // Combine and dedupe by (headline, source, date)
    const combined: NewsArticle[] = [];
    const seen = new Set<string>();

    function addArticles(articles: NewsArticle[]) {
      for (const a of articles) {
        const dateKey =
          a.datetime && a.datetime > 0
            ? new Date(a.datetime * 1000).toISOString().slice(0, 10)
            : 'unknown';
        const key = `${a.headline}|${a.source}|${dateKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(a);
        }
      }
    }

    addArticles(finnhubArticles);
    addArticles(defeatbetaArticles);

      // Sort by datetime desc (most recent first)
      combined.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

      // Cache for 6 hours
      setCache(cacheKey, combined, TTL.SIX_HOURS);

      allArticles = combined;
    }

    // Apply filter
    let filteredArticles = allArticles;
    if (filter === 'recent') {
      const threeMonthsAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
      filteredArticles = allArticles.filter((a) => a.datetime > threeMonthsAgo);
    } else if (filter === 'older') {
      const threeMonthsAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
      filteredArticles = allArticles.filter((a) => a.datetime <= threeMonthsAgo);
    }

    // Paginate
    const total = filteredArticles.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedArticles = filteredArticles.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    return NextResponse.json({
      symbol: upperSymbol,
      articles: paginatedArticles,
      sourceStatus,
      pagination: {
        page,
        limit,
        total,
        hasMore,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch news',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
