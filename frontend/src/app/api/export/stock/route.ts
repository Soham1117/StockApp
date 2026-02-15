import { NextResponse } from 'next/server';
import type {
  APIError,
  IndustryMetrics,
  NewsArticle,
  Stock,
  StockMetrics,
  StockNews,
  StockResearchPackage,
} from '@/types';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Buffer } from 'buffer';

interface ExportStockRequest {
  symbol: string;
  sector: string;
  format: 'json' | 'xlsx' | 'zip';
  includeNews?: boolean;
  includeIndustryStats?: boolean;
}

/**
 * POST /api/export/stock
 * Generate a research package for a single stock.
 *
 * Supports JSON and Excel (.xlsx) formats.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ExportStockRequest>;

    const symbol = body.symbol?.toUpperCase().trim();
    const sector = body.sector?.trim();
    const format = body.format ?? 'json';
  const includeNews = body.includeNews ?? true;
  const includeIndustryStats = body.includeIndustryStats ?? true;

    if (!symbol || !sector) {
      const error: APIError = {
        error: 'symbol and sector are required',
        details: !symbol ? 'Missing symbol' : 'Missing sector',
      };
      return NextResponse.json(error, { status: 400 });
    }

    if (!['json', 'xlsx', 'zip'].includes(format)) {
      const error: APIError = {
        error: 'Invalid format',
        details: 'Only json, xlsx, and zip are supported',
      };
      return NextResponse.json(error, { status: 400 });
    }

    const origin = new URL(request.url).origin;

    // 1) Fetch sector stocks and locate the target stock
    const stocksRes = await fetch(`${origin}/api/sector/${encodeURIComponent(sector)}/stocks`, {
      cache: 'no-store',
    });

    if (!stocksRes.ok) {
      const error: APIError = {
        error: 'Failed to fetch sector stocks',
        details: `Status ${stocksRes.status}`,
      };
      return NextResponse.json(error, { status: 502 });
    }

    const stocksJson = await stocksRes.json();
    const allBuckets: Stock[] = [
      ...(stocksJson.large ?? []),
      ...(stocksJson.mid ?? []),
      ...(stocksJson.small ?? []),
    ];

    const stock = allBuckets.find((s) => s.symbol.toUpperCase() === symbol);
    if (!stock) {
      const error: APIError = {
        error: 'Stock not found in sector',
        details: `Symbol ${symbol} not found in sector ${sector}`,
      };
      return NextResponse.json(error, { status: 404 });
    }

    // 2) Fetch metrics for this symbol within the sector
    const metricsRes = await fetch(
      `${origin}/api/sector/${encodeURIComponent(sector)}/metrics?symbols=${encodeURIComponent(
        symbol
      )}`,
      { cache: 'no-store' }
    );

    if (!metricsRes.ok) {
      const error: APIError = {
        error: 'Failed to fetch sector metrics',
        details: `Status ${metricsRes.status}`,
      };
      return NextResponse.json(error, { status: 502 });
    }

    const metricsJson: IndustryMetrics = await metricsRes.json();
    const metrics: StockMetrics | undefined = metricsJson.stocks.find(
      (m) => m.symbol.toUpperCase() === symbol
    );

    if (!metrics) {
      const error: APIError = {
        error: 'Metrics not found for symbol',
        details: `No metrics returned for ${symbol} in sector ${sector}`,
      };
      return NextResponse.json(error, { status: 502 });
    }

    // 3) Fetch news and filings (optional)
    let news: StockNews | null = null;

    if (includeNews) {
      // Fetch all news articles by paginating through all pages
      // The news API has a max limit of 100 per page, so we need to fetch all pages
      const allNewsArticles: NewsArticle[] = [];
      let currentPage = 1;
      let hasMore = true;
      const limit = 100; // Max limit per page

      while (hasMore) {
        try {
          const newsRes = await fetch(
            `${origin}/api/stocks/${encodeURIComponent(symbol)}/news?page=${currentPage}&limit=${limit}&filter=all`,
            {
              cache: 'no-store',
            }
          );

          if (newsRes.ok) {
            const newsData = (await newsRes.json()) as StockNews & {
              pagination?: { total: number; totalPages: number; hasMore: boolean };
            };

            if (newsData.articles && newsData.articles.length > 0) {
              allNewsArticles.push(...newsData.articles);
            }

            // Check if there are more pages
            if (newsData.pagination) {
              hasMore = newsData.pagination.hasMore && currentPage < newsData.pagination.totalPages;
              currentPage++;
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        } catch (err) {
          hasMore = false;
        }
      }

      if (allNewsArticles.length > 0) {
        news = {
          symbol,
          articles: allNewsArticles,
        };
      }
    }

    // 4) Build StockResearchPackage
    const researchPackage: StockResearchPackage = {
      stock,
      metrics: includeIndustryStats ? metrics : { ...metrics, classifications: {}, growthValueScore: metrics.growthValueScore },
      news: news?.articles ?? [],
      // priceHistory can be added later via FastAPI /prices if needed
    };

    // 5) Build workbook (used by xlsx and zip)
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuantDash';
    workbook.created = new Date();

    // Sheet 1: Overview
    const overviewSheet = workbook.addWorksheet('Overview');
    overviewSheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Value', key: 'value', width: 70 },
    ];

    overviewSheet.addRows([
      { field: 'Symbol', value: researchPackage.stock.symbol },
      { field: 'Company Name', value: researchPackage.stock.companyName },
      { field: 'Sector', value: researchPackage.stock.sector },
      { field: 'Industry', value: researchPackage.stock.industry },
      {
        field: 'Market Cap (B)',
        value: (researchPackage.stock.marketCap / 1_000_000_000).toFixed(2),
      },
      {
        field: 'Growth/Value Classification',
        value: researchPackage.metrics.growthValueScore.classification,
      },
      {
        field: 'Growth/Value Score',
        value: researchPackage.metrics.growthValueScore.score.toFixed(0),
      },
    ]);

    // Sheet 2: Metrics
    const metricsSheet = workbook.addWorksheet('Metrics');
    metricsSheet.columns = [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
      { header: 'Classification', key: 'classification', width: 25 },
    ];

    const r = researchPackage.metrics.ratios;
    const c = researchPackage.metrics.classifications;

    const metricRows: Array<{ key: string; label: string; nested?: boolean; format?: 'percent' }> = [
      { key: 'peRatioTTM', label: 'P/E Ratio' },
      { key: 'priceToSalesRatioTTM', label: 'P/S Ratio' },
      { key: 'priceToBookRatioTTM', label: 'P/B Ratio' },
      { key: 'enterpriseValueOverEBITTTM', label: 'EV/EBIT' },
      { key: 'enterpriseValueOverEBITDATTM', label: 'EV/EBITDA' },
      { key: 'enterpriseValueToSalesTTM', label: 'EV/Sales' },
      { key: 'dividendYieldTTM', label: 'Dividend Yield', format: 'percent' },
      { key: 'revenueGrowthTTM', label: 'Revenue Growth', format: 'percent' },
      { key: 'valuationExtras.forwardPE', label: 'Forward P/E', nested: true },
      { key: 'valuationExtras.pegRatio', label: 'PEG Ratio', nested: true },
    ];

    metricRows.forEach((m) => {
      let value: number | undefined;
      if (m.nested) {
        const [parent, child] = m.key.split('.');
        const parentObj = r[parent as keyof typeof r] as Record<string, unknown> | undefined;
        value = parentObj?.[child] as number | undefined;
      } else {
        value = r[m.key as keyof typeof r] as number | undefined;
      }
      const classification = c[m.key];
      
      // Format value based on type
      let formattedValue: string;
      if (value == null) {
        formattedValue = 'N/A';
      } else if (m.format === 'percent') {
        formattedValue = (Number(value) * 100).toFixed(2) + '%';
      } else {
        formattedValue = Number(value).toFixed(2);
      }
      
      metricsSheet.addRow({
        metric: m.label,
        value: formattedValue,
        classification: classification ?? '',
      });
    });

    // Sheet 3: Quality & Health
    const qualitySheet = workbook.addWorksheet('Quality & Health');
    qualitySheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
      { header: 'Classification', key: 'classification', width: 25 },
    ];

    const qualityRows = [
      { category: 'Profitability', key: 'profitability.roe', label: 'ROE' },
      { category: 'Profitability', key: 'profitability.roa', label: 'ROA' },
      { category: 'Profitability', key: 'profitability.roic', label: 'ROIC' },
      { category: 'Profitability', key: 'profitability.grossMargin', label: 'Gross Margin' },
      { category: 'Profitability', key: 'profitability.operatingMargin', label: 'Operating Margin' },
      { category: 'Profitability', key: 'profitability.netMargin', label: 'Net Margin' },
      { category: 'Profitability', key: 'profitability.ebitdaMargin', label: 'EBITDA Margin' },
      { category: 'Financial Health', key: 'financialHealth.debtToEquity', label: 'Debt-to-Equity' },
      { category: 'Financial Health', key: 'financialHealth.interestCoverage', label: 'Interest Coverage' },
      { category: 'Financial Health', key: 'financialHealth.currentRatio', label: 'Current Ratio' },
      { category: 'Financial Health', key: 'financialHealth.quickRatio', label: 'Quick Ratio' },
      { category: 'Financial Health', key: 'financialHealth.ocfToDebt', label: 'OCF/Debt' },
      { category: 'Cash Flow', key: 'cashFlow.fcfTTM', label: 'FCF TTM' },
      { category: 'Cash Flow', key: 'cashFlow.fcfMargin', label: 'FCF Margin' },
      { category: 'Cash Flow', key: 'cashFlow.fcfYield', label: 'FCF Yield' },
      { category: 'Cash Flow', key: 'cashFlow.ocfTTM', label: 'OCF TTM' },
      { category: 'Growth', key: 'growth.revenueGrowthTTM', label: 'Revenue Growth' },
      { category: 'Growth', key: 'growth.ebitGrowthTTM', label: 'EBIT Growth' },
      { category: 'Growth', key: 'growth.epsGrowthTTM', label: 'EPS Growth' },
      { category: 'Growth', key: 'growth.fcfGrowthTTM', label: 'FCF Growth' },
    ] as const;

    qualityRows.forEach((m) => {
      const [parent, child] = m.key.split('.');
      const parentObj = r[parent as keyof typeof r] as Record<string, unknown> | undefined;
      const value = parentObj?.[child] as number | undefined;
      const classification = c[m.key];
      qualitySheet.addRow({
        category: m.category,
        metric: m.label,
        value: value != null ? Number(value).toFixed(2) : 'N/A',
        classification: classification ?? '',
      });
    });

    // Sheet 4: News
    const newsSheet = workbook.addWorksheet('News');
    newsSheet.columns = [
      { header: 'Headline', key: 'headline', width: 80 },
      { header: 'Source', key: 'source', width: 20 },
      { header: 'Backend Source', key: 'backendSource', width: 15 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'URL', key: 'url', width: 80 },
    ];

    (researchPackage.news ?? []).forEach((article) => {
      const date =
        article.datetime && article.datetime > 0
          ? new Date(article.datetime * 1000).toISOString().slice(0, 10)
          : '';
      newsSheet.addRow({
        headline: article.headline,
        source: article.source,
        backendSource: article.backendSource ?? 'unknown',
        date,
        category: article.category ?? '',
        url: article.url,
      });
    });

    const workbookBuffer = await workbook.xlsx.writeBuffer();

    const today = new Date().toISOString().slice(0, 10);
    const baseFilename = `stock_report_${symbol}_${today}`;

    if (format === 'xlsx') {
      return new NextResponse(workbookBuffer, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${baseFilename}.xlsx"`,
        },
      });
    }

    if (format === 'zip') {
      const zip = new JSZip();
      zip.file('research.json', JSON.stringify(researchPackage, null, 2));
      zip.file(`${baseFilename}.xlsx`, workbookBuffer);

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      return new NextResponse(zipBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${baseFilename}.zip"`,
        },
      });
    }

    // Default: json
    return NextResponse.json(researchPackage);
  } catch (error) {
    const apiError: APIError = {
      error: 'Failed to export stock',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
    return NextResponse.json(apiError, { status: 500 });
  }
}


