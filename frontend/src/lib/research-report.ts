import type {
  Stock,
  StockMetrics,
  IndustryMetrics,
  IndustryStats,
  MetricClassification,
  StockClassification,
  FilingInsightEntry,
  TranscriptInsightEntry,
  PriceTarget,
  RecommendationTrend,
  RevenueEstimate,
  RevenueBreakdown,
  Dividend,
  EarningsCalendar,
  ComprehensiveAnalysis,
} from '@/types';

export type ResearchSectionId =
  | 'snapshot'
  | 'valuation'
  | 'profitability'
  | 'financial_health'
  | 'cash_flow'
  | 'growth'
  | 'summary';

export interface ResearchMetricComparison {
  key: string;
  label: string;
  section: Exclude<ResearchSectionId, 'snapshot' | 'summary'>;
  value: number | null;
  industryMedian: number | null;
  industryP25: number | null;
  industryP75: number | null;
  classification: MetricClassification | null;
  direction: 'higher_better' | 'lower_better' | 'depends';
}

export interface ResearchInput {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  marketCapBucket: 'large' | 'mid' | 'small' | 'unknown';
  growthValueScore: {
    classification: StockClassification;
    score: number;
    reasons: string[];
  };
  peerContext?: {
    sector: string;
    industry: string;
    scoreRank?: {
      rank: number | null;
      total: number | null;
    };
    betterPeers?: Array<{
      symbol: string;
      score: number;
      classification: string;
    }>;
  };
  factorRanking?: {
    bucket: 'large' | 'mid' | 'small' | 'unknown';
    sectorRank?: {
      rank: number | null;
      total: number | null;
    };
  };
  filingInsights?: FilingInsightEntry[];
  transcriptInsights?: TranscriptInsightEntry[];
  priceTarget?: PriceTarget;
  recommendations?: RecommendationTrend[];
  revenueEstimates?: RevenueEstimate[];
  revenueBreakdown?: RevenueBreakdown;
  dividends?: Dividend[];
  earningsCalendar?: EarningsCalendar;
  beta?: number;
  comprehensiveAnalysis?: ComprehensiveAnalysis;
  news?: {
    lookbackDays: number;
    articles: Array<{
      date?: string;
      headline: string;
      summary?: string;
      source?: string;
      url?: string;
    }>;
  };
  metrics: ResearchMetricComparison[];
}

interface MetricSpec {
  key: string;
  label: string;
  section: ResearchMetricComparison['section'];
  path: string;
  direction: ResearchMetricComparison['direction'];
}

const METRIC_SPECS: MetricSpec[] = [
  // Valuation
  { key: 'peRatioTTM', label: 'P/E Ratio (TTM)', section: 'valuation', path: 'ratios.peRatioTTM', direction: 'lower_better' },
  {
    key: 'priceToSalesRatioTTM',
    label: 'P/S Ratio (TTM)',
    section: 'valuation',
    path: 'ratios.priceToSalesRatioTTM',
    direction: 'lower_better',
  },
  {
    key: 'priceToBookRatioTTM',
    label: 'P/B Ratio (TTM)',
    section: 'valuation',
    path: 'ratios.priceToBookRatioTTM',
    direction: 'lower_better',
  },
  {
    key: 'enterpriseValueOverEBITTTM',
    label: 'EV/EBIT (TTM)',
    section: 'valuation',
    path: 'ratios.enterpriseValueOverEBITTTM',
    direction: 'lower_better',
  },
  {
    key: 'enterpriseValueOverEBITDATTM',
    label: 'EV/EBITDA (TTM)',
    section: 'valuation',
    path: 'ratios.enterpriseValueOverEBITDATTM',
    direction: 'lower_better',
  },
  {
    key: 'enterpriseValueToSalesTTM',
    label: 'EV/Sales (TTM)',
    section: 'valuation',
    path: 'ratios.enterpriseValueToSalesTTM',
    direction: 'lower_better',
  },
  {
    key: 'dividendYieldTTM',
    label: 'Dividend Yield (TTM)',
    section: 'valuation',
    path: 'ratios.dividendYieldTTM',
    direction: 'higher_better',
  },
  {
    key: 'valuationExtras.forwardPE',
    label: 'Forward P/E',
    section: 'valuation',
    path: 'ratios.valuationExtras.forwardPE',
    direction: 'lower_better',
  },
  {
    key: 'valuationExtras.pegRatio',
    label: 'PEG Ratio',
    section: 'valuation',
    path: 'ratios.valuationExtras.pegRatio',
    direction: 'lower_better',
  },
  // Profitability
  {
    key: 'profitability.roe',
    label: 'Return on Equity',
    section: 'profitability',
    path: 'ratios.profitability.roe',
    direction: 'higher_better',
  },
  {
    key: 'profitability.roa',
    label: 'Return on Assets',
    section: 'profitability',
    path: 'ratios.profitability.roa',
    direction: 'higher_better',
  },
  {
    key: 'profitability.roic',
    label: 'Return on Invested Capital',
    section: 'profitability',
    path: 'ratios.profitability.roic',
    direction: 'higher_better',
  },
  {
    key: 'profitability.grossMargin',
    label: 'Gross Margin',
    section: 'profitability',
    path: 'ratios.profitability.grossMargin',
    direction: 'higher_better',
  },
  {
    key: 'profitability.operatingMargin',
    label: 'Operating Margin',
    section: 'profitability',
    path: 'ratios.profitability.operatingMargin',
    direction: 'higher_better',
  },
  {
    key: 'profitability.netMargin',
    label: 'Net Margin',
    section: 'profitability',
    path: 'ratios.profitability.netMargin',
    direction: 'higher_better',
  },
  {
    key: 'profitability.ebitdaMargin',
    label: 'EBITDA Margin',
    section: 'profitability',
    path: 'ratios.profitability.ebitdaMargin',
    direction: 'higher_better',
  },
  // Financial health
  {
    key: 'financialHealth.debtToEquity',
    label: 'Debt to Equity',
    section: 'financial_health',
    path: 'ratios.financialHealth.debtToEquity',
    direction: 'lower_better',
  },
  {
    key: 'financialHealth.interestCoverage',
    label: 'Interest Coverage',
    section: 'financial_health',
    path: 'ratios.financialHealth.interestCoverage',
    direction: 'higher_better',
  },
  {
    key: 'financialHealth.currentRatio',
    label: 'Current Ratio',
    section: 'financial_health',
    path: 'ratios.financialHealth.currentRatio',
    direction: 'depends',
  },
  {
    key: 'financialHealth.quickRatio',
    label: 'Quick Ratio',
    section: 'financial_health',
    path: 'ratios.financialHealth.quickRatio',
    direction: 'depends',
  },
  {
    key: 'financialHealth.ocfToDebt',
    label: 'OCF to Debt',
    section: 'financial_health',
    path: 'ratios.financialHealth.ocfToDebt',
    direction: 'higher_better',
  },
  // Cash flow
  {
    key: 'cashFlow.fcfTTM',
    label: 'Free Cash Flow (TTM)',
    section: 'cash_flow',
    path: 'ratios.cashFlow.fcfTTM',
    direction: 'higher_better',
  },
  {
    key: 'cashFlow.fcfMargin',
    label: 'FCF Margin',
    section: 'cash_flow',
    path: 'ratios.cashFlow.fcfMargin',
    direction: 'higher_better',
  },
  {
    key: 'cashFlow.fcfYield',
    label: 'FCF Yield',
    section: 'cash_flow',
    path: 'ratios.cashFlow.fcfYield',
    direction: 'higher_better',
  },
  {
    key: 'cashFlow.ocfTTM',
    label: 'Operating Cash Flow (TTM)',
    section: 'cash_flow',
    path: 'ratios.cashFlow.ocfTTM',
    direction: 'higher_better',
  },
  // Growth
  {
    key: 'growth.revenueGrowthTTM',
    label: 'Revenue Growth (YoY)',
    section: 'growth',
    path: 'ratios.growth.revenueGrowthTTM',
    direction: 'higher_better',
  },
  {
    key: 'growth.ebitGrowthTTM',
    label: 'EBIT Growth (YoY)',
    section: 'growth',
    path: 'ratios.growth.ebitGrowthTTM',
    direction: 'higher_better',
  },
  {
    key: 'growth.epsGrowthTTM',
    label: 'EPS Growth (YoY)',
    section: 'growth',
    path: 'ratios.growth.epsGrowthTTM',
    direction: 'higher_better',
  },
  {
    key: 'growth.fcfGrowthTTM',
    label: 'FCF Growth (YoY)',
    section: 'growth',
    path: 'ratios.growth.fcfGrowthTTM',
    direction: 'higher_better',
  },
];

function getNestedNumber(obj: unknown, path: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return typeof current === 'number' && isFinite(current) ? current : null;
}

function getIndustryStatsForKey(
  stats: Record<string, IndustryStats>,
  key: string
): IndustryStats | null {
  return stats[key] ?? null;
}

export function buildResearchInput(
  stock: Stock,
  metrics: StockMetrics,
  industryMetrics: IndustryMetrics,
  marketCapBucket: 'large' | 'mid' | 'small' | 'unknown'
): ResearchInput {
  const resultMetrics: ResearchMetricComparison[] = [];

  for (const spec of METRIC_SPECS) {
    const value = getNestedNumber(metrics, spec.path);
    const stat = getIndustryStatsForKey(industryMetrics.industryStats, spec.key);
    const classification: MetricClassification | null =
      metrics.classifications[spec.key] ?? null;

    if (value == null || !stat) {
      // Skip metrics with no value or no industry stats – avoids noisy, partial records
      continue;
    }

    resultMetrics.push({
      key: spec.key,
      label: spec.label,
      section: spec.section,
      value,
      industryMedian: stat.median,
      industryP25: stat.p25,
      industryP75: stat.p75,
      classification,
      direction: spec.direction,
    });
  }

  return {
    symbol: stock.symbol,
    companyName: stock.companyName,
    sector: stock.sector,
    industry: stock.industry,
    marketCap: stock.marketCap ?? null,
    marketCapBucket,
    growthValueScore: {
      classification: metrics.growthValueScore.classification,
      score: metrics.growthValueScore.score,
      reasons: metrics.growthValueScore.reasons,
    },
    metrics: resultMetrics,
  };
}

export function buildResearchPrompts(input: ResearchInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    'You are a conservative, fact-based equity analyst specializing in fundamental analysis.',
    'Write a balanced, educational research note (~2-3 pages) for an intermediate retail investor.',
    'Use ONLY the JSON input (metrics, peer context, factor scores, DCF valuation, investment signal, filing/transcript insights, analyst estimates, revenue breakdown, risks).',
    'Do NOT invent facts, business descriptions, news, or recommendations beyond what is provided in the investment signal.',
    'Tie quantitative movements to the qualitative insights when possible (e.g., link margin changes to disclosed drivers).',
    'If data is missing, explicitly say so instead of guessing.',
    'Focus on forward-looking catalysts, product-level competitive dynamics, risk-adjusted valuation, and DCF intrinsic value analysis.',
    'The investment signal (BUY_CANDIDATE/WATCHLIST/AVOID) is generated from a systematic multi-factor analysis - present it objectively with supporting reasoning.',
  ].join(' ');

  const userPromptLines: string[] = [];
  userPromptLines.push(
    'Using ONLY the following JSON input, write a structured research summary for this stock.'
  );
  userPromptLines.push(
    'Target audience: retail investor with intermediate experience. Tone: neutral, clear, and educational.'
  );
  userPromptLines.push(
    'Structure the answer into these sections with short paragraphs and occasional bullets:'
  );
  userPromptLines.push(
    'A. Snapshot & peer positioning – company name/ticker, sector/industry, size/bucket, peer rank context (score rank, factor ranking, better peers if any). If productSegments are available, briefly mention key business segments.'
  );
  userPromptLines.push(
    'B. Valuation analysis - **START WITH DCF INTRINSIC VALUE if available in comprehensiveAnalysis.dcf_valuation**: CRITICAL - Use ONLY the value from comprehensiveAnalysis.dcf_valuation.intrinsic_value_per_share (this is the correct per-share value). Do NOT calculate or modify this value. Present it exactly as: "DCF Intrinsic Value: $X.XX per share" where X.XX is the intrinsic_value_per_share value. Then present the upside_downside_pct and rating directly from the JSON. Explain key assumptions (WACC, terminal growth, FCF margin, revenue growth rate) from comprehensiveAnalysis.dcf_valuation.assumptions. Note: revenue_growth_rate is an annualized assumption; do NOT describe it as cumulative multi-year growth. Then discuss relative valuation metrics (P/E, P/S, P/B, EV/EBIT, Forward P/E). If priceTarget data available, compare to analyst consensus targets. If factorScores.valuation is available, reference the percentile score vs peers. If beta available, discuss risk-adjusted valuation. Explain WHY the stock trades cheap/average/expensive relative to growth, profitability, and risk profile. If disconnect between growth and valuation, explain using risk insights and competitive position.'
  );
  userPromptLines.push(
    'C. Product & competitive positioning - If productSegments or revenue breakdown (geography/segments) are available, analyze revenue diversification, segment performance, and concentration risk. Use revenueBreakdown for segment/geography amounts; only use filingInsights.productSegments for qualitative context unless those amounts are explicitly provided there. Discuss competitive strengths/weaknesses at the product level. If categorizedRisks includes "Competitive" risks, tie them to specific product lines or markets.'
  );
  userPromptLines.push(
    'D. Profitability & quality – margins/returns vs peers plus any relevant filing/transcript drivers (e.g., product mix, cost commentary). If profitability is above/below industry average, explain the structural reasons (pricing power, cost structure, economies of scale).'
  );
  userPromptLines.push(
    'E. Balance sheet & liquidity – leverage, coverage, liquidity ratios, and any liquidity/capital-allocation commentary from filings. If dividend history is available, discuss payout sustainability and dividend growth trends.'
  );
  userPromptLines.push(
    'F. Cash flow & capital efficiency – FCF/OCF metrics, capex/capital allocation notes from filings. If capital allocation priorities are mentioned (buybacks, acquisitions, debt reduction), evaluate alignment with shareholder value creation.'
  );
  userPromptLines.push(
    'G. Growth trajectory & forward catalysts – Discuss revenue/EBIT/EPS/FCF growth vs peers. If forwardGuidance is available, analyze management expectations and confidence level. If revenueEstimates are available, compare historical growth to analyst forward estimates. Identify key near-term catalysts (product launches, market expansions, margin improvement initiatives) from filing/transcript insights. Evaluate if current growth justifies valuation multiples.'
  );
  userPromptLines.push(
    'H. Risk framework - If categorizedRisks are available, organize key risks by category (Geopolitical, Supply Chain, Competitive, Regulatory, Technology, Financial) with severity assessment. For each high-severity risk, note mitigation strategies if disclosed. Compare risk profile to industry peers and assess if risks are priced in. If earningsCalendar is available, note upcoming earnings dates as potential volatility events.'
  );
  userPromptLines.push(
    'I. Recent news (last 90 days) - Write a single paragraph summarizing the overall news sentiment and key themes from the news list (if provided). Do NOT use bullet points or list headlines; synthesize the themes (e.g., earnings, guidance, product launches, analyst actions, macro). If news coverage is limited, state that explicitly.'
  );
  userPromptLines.push(
    'J. Management & disclosure quality - use filing/transcript insights (risk changes, accounting flags, tone, execution flags) to discuss transparency, capital allocation philosophy, and execution track record. If recommendations data is available, summarize analyst sentiment trends (improving/deteriorating).'
  );
  userPromptLines.push(
    'K. Top 5-7 investment considerations - bullet list combining valuation thesis, competitive moat assessment, key growth drivers, major risk factors, and catalysts. Frame in terms of what would make the stock attractive vs concerning (e.g., "Attractive IF margins expand as guided; Concerning IF competitive pressures intensify").'
  );
  userPromptLines.push(
    'L. Peer ranking explanation - Provide detailed reasoning for why this stock ranks above/below key peers. Reference specific metrics, product positioning, risk profile, and growth outlook that drive the ranking. If betterPeers are listed, explain what they do better (valuation, growth, profitability, balance sheet).'
  );
  userPromptLines.push(
    'M. Investment Signal & Integrated summary - **IF comprehensiveAnalysis.investment_signal is available, lead with it**: Present the signal (BUY_CANDIDATE/WATCHLIST/AVOID), confidence level, and recommendation text. List positive_reasons, negative_reasons, and neutral_reasons from the signal. If factor scores are available (comprehensiveAnalysis.factor_scores), reference the composite score and individual factor interpretations (valuation, quality, growth, momentum, sentiment, risk). Then provide 4-7 additional bullets summarizing investment thesis, relative attractiveness vs peers, and key monitoring points. If no investment signal available, provide traditional neutral summary.'
  );
  userPromptLines.push(
    'N. Limitations/disclaimer - remind reader that inputs are historical/quantitative and not investment advice. Note any critical missing data (e.g., no DCF model, no insider trading data, limited forward estimates).'
  );
  userPromptLines.push(
    'Important rules: (1) Use plain language, explain ratios briefly when first used; (2) Cite the insight fields ("comprehensiveAnalysis.dcf_valuation", "comprehensiveAnalysis.investment_signal", "comprehensiveAnalysis.factor_scores", "filingInsights.productSegments", "filingInsights.forwardGuidance", "filingInsights.categorizedRisks", "priceTarget", "revenueEstimates", "dividends", "beta", "news") when referencing data; (3) Add a short source tag at the end of each paragraph that uses data, e.g., [source: revenueBreakdown] or [source: filingInsights.productSegments]; (4) Keep overall length around 1200-1800 words for comprehensive coverage; (5) Never quote verbatim text-always paraphrase; (6) Prioritize forward-looking analysis over historical description; (7) Always connect valuation to fundamentals (growth, risks, competitive position); (8) The investment signal is algorithmically generated from DCF valuation + factor scores + risk assessment - present it as a systematic output, not a personal recommendation.'
  );
  userPromptLines.push('');

  // Add pre-formatted DCF text if available to prevent LLM hallucination
  if (input.comprehensiveAnalysis?.dcf_valuation?.intrinsic_value_per_share != null) {
    const dcf = input.comprehensiveAnalysis.dcf_valuation;
    userPromptLines.push('**CRITICAL - DCF VALUES TO USE EXACTLY AS SHOWN:**');
    userPromptLines.push(`- DCF Intrinsic Value: $${dcf.intrinsic_value_per_share!.toFixed(2)} per share`);
    if (dcf.upside_downside_pct != null) {
      userPromptLines.push(`- Upside/Downside: ${dcf.upside_downside_pct >= 0 ? '+' : ''}${dcf.upside_downside_pct.toFixed(2)}%`);
    }
    if (dcf.rating) {
      userPromptLines.push(`- Rating: ${dcf.rating}`);
    }
    userPromptLines.push('');
  }

  userPromptLines.push('JSON INPUT (do not repeat verbatim in the answer, just use it for analysis):');
  userPromptLines.push('```json');
  userPromptLines.push(JSON.stringify(input));
  userPromptLines.push('```');

  return {
    systemPrompt,
    userPrompt: userPromptLines.join('\n'),
  };
}


