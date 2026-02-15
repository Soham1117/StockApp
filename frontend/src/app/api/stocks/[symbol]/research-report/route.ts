import { NextResponse } from 'next/server';
import type { Stock, StockMetrics, IndustryMetrics, StockResearchReport } from '@/types';
import { loadTickerUniverse, getStocksForSector } from '@/lib/generated-data';
import { loadFilingInsights, loadTranscriptInsights } from '@/lib/insights';
import { buildResearchInput, buildResearchPrompts } from '@/lib/research-report';
import { generateChatCompletion, LLMConfigurationError } from '@/lib/llm';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

function buildCoverageSummary(input: ReturnType<typeof buildResearchInput>) {
  const included = [
    'Sector and industry profile',
    'Growth vs value classification',
    'Industry peer metric comparisons (valuation, profitability, health, cash flow, growth)',
  ];
  const missing: string[] = [];

  const optionalFields: Array<{
    key: keyof ReturnType<typeof buildResearchInput>;
    label: string;
    present?: (value: any) => boolean;
  }> = [
    { key: 'peerContext', label: 'Peer positioning and better peers' },
    { key: 'factorRanking', label: 'Sector ranking within market-cap bucket' },
    { key: 'filingInsights', label: 'SEC filing insights (updates, risks, liquidity)' },
    { key: 'transcriptInsights', label: 'Earnings call transcript insights' },
    { key: 'priceTarget', label: 'Analyst price targets' },
    { key: 'recommendations', label: 'Analyst recommendation trends' },
    { key: 'beta', label: 'Beta (risk) metric' },
    { key: 'revenueEstimates', label: 'Revenue estimates (analyst forward view)' },
    { key: 'revenueBreakdown', label: 'Revenue breakdown by segment/geography' },
    { key: 'dividends', label: 'Dividend history' },
    { key: 'earningsCalendar', label: 'Earnings calendar' },
    { key: 'comprehensiveAnalysis', label: 'DCF valuation + factor scores + investment signal' },
    {
      key: 'news',
      label: 'Company news headlines and narrative event summaries',
      present: (value) => Array.isArray(value?.articles) && value.articles.length > 0,
    },
  ];

  for (const field of optionalFields) {
    const value = input[field.key];
    const isPresent = field.present
      ? field.present(value)
      : Array.isArray(value)
        ? value.length > 0
        : value !== null && value !== undefined;
    if (isPresent) {
      included.push(field.label);
    } else {
      missing.push(field.label);
    }
  }

  const notIncluded = [
    'Historical price charts and technical indicators (RSI, moving averages)',
    'Full financial statements (income statement, balance sheet, cash flow)',
    'Insider and institutional ownership activity',
    'Options, short interest, and derivatives positioning',
    'Macro/interest rate or FX sensitivity analysis',
    'ESG or sustainability scoring',
  ];
  return { included, missing, notIncluded };
}

async function triggerInsightGeneration(
  symbol: string,
  kind: 'filing' | 'transcript'
) {
  if (!env.fastapiBaseUrl) {
    return;
  }

  const endpoint =
    kind === 'filing'
      ? '/insights/filings/generate'
      : '/insights/transcripts/generate';

  try {
    await fetch(`${env.fastapiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        kind === 'filing'
          ? { symbol, maxFilings: 2, forms: ['10-K', '10-Q'] }
          : { symbol, limit: 2 }
      ),
    });
  } catch (error) {
    console.error(`[Insights] Failed to trigger ${kind} generation`, error);
  }
}

function hasAnyInsights(entries: any[] | null | undefined): boolean {
  return Array.isArray(entries) && entries.length > 0;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { symbol } = await context.params;
    const upperSymbol = symbol.toUpperCase();

    // Load ticker universe to get sector/industry
    const universe = await loadTickerUniverse();
    const ticker = universe.tickers.find((t) => t.symbol === upperSymbol);

    if (!ticker) {
      return NextResponse.json(
        { error: 'Symbol not found in ticker universe', symbol: upperSymbol },
        { status: 404 }
      );
    }

    const sector = ticker.sector;
    const industry = ticker.industry;

    const requestUrl = new URL(request.url);
    const rankParam = Number(requestUrl.searchParams.get('rank'));
    const totalParam = Number(requestUrl.searchParams.get('total'));
    const hasRankOverride =
      Number.isFinite(rankParam) &&
      Number.isFinite(totalParam) &&
      rankParam > 0 &&
      totalParam > 0;

    // Load stock details from sector-stocks.json (same data as /api/stocks/[symbol])
    const sectorStocks = await getStocksForSector(sector);
    if (!sectorStocks) {
      return NextResponse.json(
        { error: 'Sector data not found', sector, symbol: upperSymbol },
        { status: 404 }
      );
    }

    const allStocks: Stock[] = [
      ...(sectorStocks.large || []),
      ...(sectorStocks.mid || []),
      ...(sectorStocks.small || []),
    ];

    const stock = allStocks.find((s) => s.symbol.toUpperCase() === upperSymbol);
    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found in sector data', symbol: upperSymbol, sector },
        { status: 404 }
      );
    }

    let marketCapBucket: 'large' | 'mid' | 'small' | 'unknown' = 'unknown';
    if (sectorStocks.large.some((s) => s.symbol === stock.symbol)) {
      marketCapBucket = 'large';
    } else if (sectorStocks.mid.some((s) => s.symbol === stock.symbol)) {
      marketCapBucket = 'mid';
    } else if (sectorStocks.small.some((s) => s.symbol === stock.symbol)) {
      marketCapBucket = 'small';
    }

    // Fetch industry metrics for this symbol (re-use existing API)
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const metricsRes = await fetch(
      `${baseUrl}/api/sector/${encodeURIComponent(sector)}/metrics?symbols=${upperSymbol}`,
      {
        cache: 'no-store',
      }
    );

    if (!metricsRes.ok) {
      const text = await metricsRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Failed to fetch metrics for research report',
          status: metricsRes.status,
          details: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const industryMetrics = (await metricsRes.json()) as IndustryMetrics;
    const stockMetrics: StockMetrics | undefined = industryMetrics.stocks.find(
      (m) => m.symbol === upperSymbol
    );

    if (!stockMetrics) {
      return NextResponse.json(
        {
          error: 'Metrics not found for symbol in industry metrics response',
          symbol: upperSymbol,
          sector,
        },
        { status: 500 }
      );
    }

    let filingInsights = await loadFilingInsights(upperSymbol, 2);
    if (!hasAnyInsights(filingInsights) && env.fastapiBaseUrl) {
      await triggerInsightGeneration(upperSymbol, 'filing');
      filingInsights = await loadFilingInsights(upperSymbol, 2);
    }

    let transcriptInsights = await loadTranscriptInsights(upperSymbol, 2);
    if (!hasAnyInsights(transcriptInsights) && env.fastapiBaseUrl) {
      await triggerInsightGeneration(upperSymbol, 'transcript');
      transcriptInsights = await loadTranscriptInsights(upperSymbol, 2);
    }

    const researchInput = buildResearchInput(
      stock,
      stockMetrics,
      industryMetrics,
      marketCapBucket
    );

    if (hasRankOverride) {
      researchInput.peerContext = {
        sector,
        industry,
        scoreRank: { rank: Math.floor(rankParam), total: Math.floor(totalParam) },
        betterPeers: [],
      };
    } else {
      // Enrich with peer context (best-effort; report should still work if this fails)
      try {
        const peersRes = await fetch(
          `${baseUrl}/api/stocks/${upperSymbol}/peers`,
          { cache: 'no-store' }
        );
        if (peersRes.ok) {
          const peersData = await peersRes.json();
          const focal = peersData.focal as {
            rank: number | null;
            total: number | null;
            score: number;
            classification: string;
          } | null;
          const betterPeers = (peersData.betterPeers || []).slice(0, 5);
          researchInput.peerContext = {
            sector,
            industry,
            scoreRank: focal
              ? { rank: focal.rank ?? null, total: focal.total ?? null }
              : undefined,
            betterPeers: betterPeers.map((p: any) => ({
              symbol: String(p.symbol),
              score: Number(p.score ?? 0),
              classification: String(p.classification ?? 'BLEND'),
            })),
          };
        }
      } catch {
        // Ignore peer context errors - keep report generation robust
      }
    }

    // Enrich with factor ranking info (top-10 per bucket in sector, if available)
    try {
      if (marketCapBucket !== 'unknown') {
        const rankingsRes = await fetch(
          `${baseUrl}/api/rankings/top?sector=${encodeURIComponent(
            sector
          )}&bucket=${marketCapBucket}&limit=50`,
          { cache: 'no-store' }
        );
        if (rankingsRes.ok) {
          const rankingsData = await rankingsRes.json();
          const bucketList = (rankingsData.rankings?.[marketCapBucket] ||
            []) as Array<{ symbol: string }>;
          const idx = bucketList.findIndex(
            (s) => s.symbol === upperSymbol
          );
          researchInput.factorRanking = {
            bucket: marketCapBucket,
            sectorRank: {
              rank: idx >= 0 ? idx + 1 : null,
              total: bucketList.length || null,
            },
          };
        }
      }
    } catch {
      // Ignore ranking enrichment errors
    }
    if (filingInsights.length > 0) {
      researchInput.filingInsights = filingInsights;
    }
    if (transcriptInsights.length > 0) {
      researchInput.transcriptInsights = transcriptInsights;
    }

    // Fetch Finnhub price target data
    try {
      const priceTargetRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/price-target`,
        { cache: 'no-store' }
      );
      if (priceTargetRes.ok) {
        const priceTargetData = await priceTargetRes.json();
        if (priceTargetData.targetMean) {
          researchInput.priceTarget = priceTargetData;
        }
      }
    } catch {
      // Ignore price target errors
    }

    // Fetch Finnhub recommendations
    try {
      const recommendationsRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/recommendations`,
        { cache: 'no-store' }
      );
      if (recommendationsRes.ok) {
        const recommendationsData = await recommendationsRes.json();
        if (recommendationsData.recommendations?.length > 0) {
          researchInput.recommendations = recommendationsData.recommendations;
        }
      }
    } catch {
      // Ignore recommendations errors
    }

    // Fetch Finnhub metrics (beta, dividend yield)
    try {
      const metricsRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/metrics`,
        { cache: 'no-store' }
      );
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        if (metricsData.metric?.beta) {
          researchInput.beta = metricsData.metric.beta;
        }
      }
    } catch {
      // Ignore metrics errors
    }

    // Fetch Finnhub revenue estimates
    try {
      const revenueEstimatesRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/revenue-estimates`,
        { cache: 'no-store' }
      );
      if (revenueEstimatesRes.ok) {
        const revenueEstimatesData = await revenueEstimatesRes.json();
        if (revenueEstimatesData.data?.length > 0) {
          researchInput.revenueEstimates = revenueEstimatesData.data;
        }
      }
    } catch {
      // Ignore revenue estimates errors
    }

    // Fetch revenue breakdown from DefeatBeta
    try {
      const revenueBreakdownRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/revenue/breakdown`,
        { cache: 'no-store' }
      );
      if (revenueBreakdownRes.ok) {
        const revenueBreakdownData = await revenueBreakdownRes.json();
        if (revenueBreakdownData.geography?.length > 0 || revenueBreakdownData.segments?.length > 0) {
          researchInput.revenueBreakdown = revenueBreakdownData;
        }
      }
    } catch {
      // Ignore revenue breakdown errors
    }

    // Fetch dividends from DefeatBeta
    try {
      const dividendsRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/dividends`,
        { cache: 'no-store' }
      );
      if (dividendsRes.ok) {
        const dividendsData = await dividendsRes.json();
        if (dividendsData.dividends?.length > 0) {
          researchInput.dividends = dividendsData.dividends;
        }
      }
    } catch {
      // Ignore dividends errors
    }

    // Fetch earnings calendar
    try {
      const earningsCalendarRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/earnings/calendar`,
        { cache: 'no-store' }
      );
      if (earningsCalendarRes.ok) {
        const earningsCalendarData = await earningsCalendarRes.json();
        if (earningsCalendarData.events?.length > 0) {
          researchInput.earningsCalendar = earningsCalendarData;
        }
      }
    } catch {
      // Ignore earnings calendar errors
    }

    // Fetch recent news (90-day window)
    try {
      const newsRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/news?filter=recent&limit=30`,
        { cache: 'no-store' }
      );
      if (newsRes.ok) {
        const newsData = await newsRes.json();
        const articles = Array.isArray(newsData.articles) ? newsData.articles : [];
        const trimmed = articles
          .map((item: { summary?: string; date?: string; headline?: string; source?: string; url?: string }) => {
            const summary =
              typeof item.summary === 'string' && item.summary.trim()
                ? item.summary.trim().slice(0, 800)
                : undefined;
            return {
              date: typeof item.date === 'string' ? item.date : undefined,
              headline: String(item.headline || ''),
              summary,
              source: typeof item.source === 'string' ? item.source : undefined,
              url: typeof item.url === 'string' ? item.url : undefined,
            };
          })
          .filter((item: { headline: string }) => item.headline.length > 0);

        if (trimmed.length > 0) {
          researchInput.news = {
            lookbackDays: 90,
            articles: trimmed,
          };
        }
      }
    } catch {
      // Ignore news errors
    }

    // Fetch comprehensive analysis (DCF valuation, factor scores, investment signal)
    try {
      const analysisRes = await fetch(
        `${baseUrl}/api/stocks/${upperSymbol}/analysis`,
        { cache: 'no-store' }
      );
      if (analysisRes.ok) {
        const analysisData = await analysisRes.json();
        // Only include if we have meaningful data (not all null/insufficient)
        if (analysisData.dcf_valuation ||
            analysisData.factor_scores?.composite?.composite_score !== null ||
            analysisData.investment_signal?.signal !== 'INSUFFICIENT_DATA') {
          researchInput.comprehensiveAnalysis = analysisData;
        }
      }
    } catch (error) {
      // Comprehensive analysis is optional enhancement
    }

    const { systemPrompt, userPrompt } = buildResearchPrompts(researchInput);

    try {
      const { writeFile } = await import('fs/promises');
      const { join } = await import('path');
      const filePath = join(process.cwd(), 'llm_prompt.json');
      await writeFile(
        filePath,
        JSON.stringify(
          {
            symbol: upperSymbol,
            generatedAt: new Date().toISOString(),
            researchInput,
            systemPrompt,
            userPrompt,
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (error) {
      console.error('[Research Report] Failed to write LLM prompt file:', error);
    }

    const reportText = await generateChatCompletion(systemPrompt, userPrompt);
    const coverage = buildCoverageSummary(researchInput);

    const responseBody: StockResearchReport = {
      symbol: stock.symbol,
      sector,
      industry,
      generatedAt: new Date().toISOString(),
      report: reportText,
      coverage,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    if (error instanceof LLMConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.error('[API] Error generating research report:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate research report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


