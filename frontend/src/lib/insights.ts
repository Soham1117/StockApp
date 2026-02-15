import fs from 'fs/promises';
import path from 'path';
import type {
  FilingInsightEntry,
  TranscriptInsightEntry,
} from '@/types';

const SEC_INSIGHTS_DIR = path.join(
  process.cwd(),
  'fastapi_app',
  'data',
  'sec_insights'
);

const TRANSCRIPT_INSIGHTS_DIR = path.join(
  process.cwd(),
  'fastapi_app',
  'data',
  'transcript_insights'
);

function toBusinessUpdateList(raw: any[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    theme: item.theme ?? '',
    summary: item.summary ?? '',
    driver: item.driver ?? undefined,
    impact: item.impact ?? undefined,
    confidence: item.confidence ?? undefined,
  }));
}

function toProductSegmentList(raw: any[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    name: item.name ?? '',
    description: item.description ?? '',
    performance: item.performance ?? undefined,
    revenueContribution: item.revenue_contribution ?? item.revenueContribution ?? undefined,
  }));
}

function toForwardGuidanceList(raw: any[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    metric: item.metric ?? '',
    guidance: item.guidance ?? '',
    timeframe: item.timeframe ?? undefined,
    confidence: item.confidence ?? undefined,
  }));
}

function toCategorizedRiskList(raw: any[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    category: item.category ?? '',
    risk: item.risk ?? '',
    severity: item.severity ?? undefined,
    mitigation: item.mitigation ?? undefined,
  }));
}

export async function loadFilingInsights(
  symbol: string,
  limit = 2
): Promise<FilingInsightEntry[]> {
  const dir = path.join(SEC_INSIGHTS_DIR, symbol.toUpperCase());
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    files.sort().reverse();
    const selected = files.slice(0, limit);
    const results: FilingInsightEntry[] = [];
    for (const file of selected) {
      const raw = JSON.parse(
        await fs.readFile(path.join(dir, file), 'utf-8')
      );
      results.push({
        symbol: raw.symbol,
        cik: raw.cik,
        accession: raw.accession,
        filingType: raw.filing_type,
        filedAt: raw.filed_at,
        businessUpdates: toBusinessUpdateList(raw.business_updates),
        riskChanges: Array.isArray(raw.risk_changes)
          ? raw.risk_changes.map((item: any) => ({
              theme: item.theme ?? '',
              change: item.change ?? '',
              summary: item.summary ?? '',
              impact: item.impact ?? undefined,
            }))
          : [],
        liquidityAndCapital: Array.isArray(raw.liquidity_and_capital)
          ? raw.liquidity_and_capital.map((item: any) => ({
              summary: item.summary ?? '',
              liquidity: item.liquidity ?? undefined,
              leverage: item.leverage ?? undefined,
              capitalAllocation: item.capital_allocation ?? undefined,
            }))
          : [],
        accountingFlags: Array.isArray(raw.accounting_flags)
          ? raw.accounting_flags.map((item: any) => ({
              area: item.area ?? '',
              summary: item.summary ?? '',
              severity: item.severity ?? undefined,
            }))
          : [],
        otherHighlights: Array.isArray(raw.other_highlights)
          ? raw.other_highlights.map((item: any) => ({
              category: item.category ?? '',
              summary: item.summary ?? '',
              details: item.details ?? undefined,
            }))
          : [],
        productSegments: toProductSegmentList(raw.product_segments),
        forwardGuidance: toForwardGuidanceList(raw.forward_guidance),
        categorizedRisks: toCategorizedRiskList(raw.categorized_risks),
      });
    }
    return results;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function loadTranscriptInsights(
  symbol: string,
  limit = 2
): Promise<TranscriptInsightEntry[]> {
  const dir = path.join(TRANSCRIPT_INSIGHTS_DIR, symbol.toUpperCase());
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    files.sort().reverse();
    const selected = files.slice(0, limit);
    const results: TranscriptInsightEntry[] = [];
    for (const file of selected) {
      const raw = JSON.parse(
        await fs.readFile(path.join(dir, file), 'utf-8')
      );
      results.push({
        symbol: raw.symbol,
        fiscalYear: raw.fiscal_year,
        fiscalQuarter: raw.fiscal_quarter,
        callDate: raw.call_date ?? undefined,
        guidanceChanges: Array.isArray(raw.guidance_changes)
          ? raw.guidance_changes.map((item: any) => ({
              metric: item.metric ?? '',
              direction: item.direction ?? '',
              summary: item.summary ?? '',
              magnitude: item.magnitude ?? undefined,
            }))
          : [],
        drivers: Array.isArray(raw.drivers)
          ? raw.drivers.map((item: any) => ({
              area: item.area ?? '',
              summary: item.summary ?? '',
              positive:
                typeof item.positive === 'boolean'
                  ? item.positive
                  : undefined,
              detail: item.detail ?? undefined,
            }))
          : [],
        tone: raw.tone
          ? {
              management: raw.tone.management ?? undefined,
              analysts: raw.tone.analysts ?? undefined,
              confidence: raw.tone.confidence ?? undefined,
            }
          : null,
        executionFlags: Array.isArray(raw.execution_flags)
          ? raw.execution_flags.map((item: any) => ({
              issue: item.issue ?? '',
              severity: item.severity ?? undefined,
              summary: item.summary ?? '',
            }))
          : [],
        keyQuotes: Array.isArray(raw.key_quotes)
          ? raw.key_quotes.map((item: any) => ({
              speaker: item.speaker ?? undefined,
              sentiment: item.sentiment ?? undefined,
              summary: item.summary ?? '',
            }))
          : [],
      });
    }
    return results;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}


