/**
 * Shared type definitions for QuantDash
 */

/**
 * Stock information used throughout the app
 */
export interface Stock {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector: string;
  industry: string;
  price?: number;
  exchange?: string;
  country?: string;
}

/**
 * Market cap bucket classification
 */
export type MarketCapBucket = "large" | "mid" | "small";

/**
 * Stocks grouped by market cap
 */
export interface StocksByMarketCap {
  industry: string;
  large: Stock[];
  mid: Stock[];
  small: Stock[];
}

/**
 * Profitability metrics
 */
export interface ProfitabilityMetrics {
  roe?: number;
  roa?: number;
  roic?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  ebitdaMargin?: number;
}

/**
 * Financial health metrics
 */
export interface FinancialHealthMetrics {
  debtToEquity?: number;
  interestCoverage?: number;
  currentRatio?: number;
  quickRatio?: number;
  ocfToDebt?: number;
}

/**
 * Cash flow metrics
 */
export interface CashFlowMetrics {
  fcfTTM?: number;
  fcfMargin?: number;
  fcfYield?: number;
  ocfTTM?: number;
}

/**
 * Growth metrics
 */
export interface GrowthMetrics {
  revenueGrowthTTM?: number;
  ebitGrowthTTM?: number;
  epsGrowthTTM?: number;
  fcfGrowthTTM?: number;
}

/**
 * Additional valuation metrics
 */
export interface ValuationExtras {
  forwardPE?: number;
  pegRatio?: number;
}

/**
 * Valuation ratios (TTM)
 */
export interface ValuationRatios {
  symbol: string;
  marketCap?: number;
  sharesOutstanding?: number;
  peRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  priceToBookRatioTTM?: number;
  enterpriseValueOverEBITTTM?: number;
  enterpriseValueOverEBITDATTM?: number;
  enterpriseValueToSalesTTM?: number;
  dividendYieldTTM?: number;
  revenueGrowthTTM?: number;
  profitability?: ProfitabilityMetrics;
  financialHealth?: FinancialHealthMetrics;
  cashFlow?: CashFlowMetrics;
  growth?: GrowthMetrics;
  valuationExtras?: ValuationExtras;
}

/**
 * Classification relative to industry
 */
export type MetricClassification =
  | "WAY_BELOW"
  | "BELOW"
  | "AVERAGE"
  | "ABOVE"
  | "WAY_ABOVE";

/**
 * Stock classification: Growth vs Value
 */
export type StockClassification = "GROWTH" | "VALUE" | "BLEND";

/**
 * Stock metrics with industry comparison
 */
export interface StockMetrics {
  symbol: string;
  ratios: ValuationRatios;
  classifications: Record<string, MetricClassification>;
  growthValueScore: {
    classification: StockClassification;
    score: number; // -100 (strong value) to +100 (strong growth)
    reasons: string[];
  };
}

/**
 * Industry statistics for a metric
 */
export interface IndustryStats {
  metric: string;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

/**
 * Industry metrics response
 */
export interface IndustryMetrics {
  industry: string;
  stocks: StockMetrics[];
  industryStats: Record<string, IndustryStats>;
}

export interface BusinessUpdateInsight {
  theme: string;
  summary: string;
  driver?: string;
  impact?: string;
  confidence?: string;
}

export interface RiskChangeInsight {
  theme: string;
  change: string;
  summary: string;
  impact?: string;
}

export interface LiquidityInsight {
  summary: string;
  liquidity?: string;
  leverage?: string;
  capitalAllocation?: string;
}

export interface AccountingFlagInsight {
  area: string;
  summary: string;
  severity?: string;
}

export interface HighlightInsight {
  category: string;
  summary: string;
  details?: string;
}

export interface ProductSegmentInsight {
  name: string;
  description: string;
  performance?: string;
  revenueContribution?: string;
}

export interface ForwardGuidanceInsight {
  metric: string;
  guidance: string;
  timeframe?: string;
  confidence?: string;
}

export interface CategorizedRiskInsight {
  category: string;
  risk: string;
  severity?: string;
  mitigation?: string;
}

export interface FilingInsightEntry {
  symbol: string;
  cik: string;
  accession: string;
  filingType: string;
  filedAt: string;
  businessUpdates: BusinessUpdateInsight[];
  riskChanges: RiskChangeInsight[];
  liquidityAndCapital: LiquidityInsight[];
  accountingFlags: AccountingFlagInsight[];
  otherHighlights: HighlightInsight[];
  productSegments?: ProductSegmentInsight[];
  forwardGuidance?: ForwardGuidanceInsight[];
  categorizedRisks?: CategorizedRiskInsight[];
}

export interface GuidanceChangeInsight {
  metric: string;
  direction: string;
  summary: string;
  magnitude?: string;
}

export interface DriverInsightEntry {
  area: string;
  summary: string;
  positive?: boolean;
  detail?: string;
}

export interface ToneInsightEntry {
  management?: string;
  analysts?: string;
  confidence?: string;
}

export interface ExecutionFlagInsight {
  issue: string;
  severity?: string;
  summary: string;
}

export interface QuoteInsight {
  speaker?: string;
  sentiment?: string;
  summary: string;
}

export interface TranscriptInsightEntry {
  symbol: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callDate?: string;
  guidanceChanges: GuidanceChangeInsight[];
  drivers: DriverInsightEntry[];
  tone: ToneInsightEntry | null;
  executionFlags: ExecutionFlagInsight[];
  keyQuotes: QuoteInsight[];
}

/**
 * LLM-generated research report for a single stock
 */
export interface StockResearchReport {
  symbol: string;
  sector: string;
  industry: string;
  generatedAt: string;
  report: string;
  coverage?: {
    included: string[];
    missing: string[];
    notIncluded: string[];
  };
}

/**
 * Company news article
 */
export interface NewsArticle {
  headline: string;
  summary?: string;
  url: string;
  source: string;
  datetime: number; // Unix timestamp
  date?: string; // UTC date YYYY-MM-DD
  category?: string;
  image?: string;
  backendSource?: "finnhub" | "defeatbeta"; // Which backend API provided this article
}

/**
 * News response
 */
export interface StockNews {
  symbol: string;
  articles: NewsArticle[];
}

/**
 * Earnings calendar event
 */
export interface EarningsEvent {
  date: string | null;
  estimate?: number;
  actual?: number;
  surprise?: number;
  surprisePercent?: number;
}

/**
 * Earnings calendar response
 */
export interface EarningsCalendar {
  symbol: string;
  events: EarningsEvent[];
}

/**
 * Historical EPS data point
 */
export interface EarningsHistoryPoint {
  date: string | null;
  eps?: number;
  quarter?: string;
}

/**
 * Earnings history response
 */
export interface EarningsHistory {
  symbol: string;
  history: EarningsHistoryPoint[];
  ttmEps?: number;
}

/**
 * Stock split event
 */
export interface StockSplit {
  date?: string;
  ratio?: string; // e.g., "2:1"
  from?: number;
  to?: number;
}

/**
 * Dividend event
 */
export interface Dividend {
  date: string;
  amount: number;
  frequency?: string;
}

/**
 * Finnhub price target data
 */
export interface PriceTarget {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
}

/**
 * Finnhub recommendation trend
 */
export interface RecommendationTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/**
 * Finnhub financial metrics
 */
export interface FinnhubMetrics {
  metric: {
    "52WeekHigh": number;
    "52WeekLow": number;
    beta: number;
    dividendYieldIndicatedAnnual?: number;
    epsInclExtraItemsTTM?: number;
    peInclExtraTTM?: number;
    pbAnnual?: number;
    peExclExtraAnnual?: number;
    marketCapitalization?: number;
    [key: string]: any;
  };
  series?: {
    annual: Record<string, any>;
    quarterly: Record<string, any>;
  };
}

/**
 * Revenue estimate data point
 */
export interface RevenueEstimate {
  period: string;
  revenueAvg: number;
  revenueHigh: number;
  revenueLow: number;
  numberAnalysts: number;
}

/**
 * Revenue breakdown item
 */
export interface RevenueBreakdownItem {
  name: string;
  value: number;
  date?: string;
}

/**
 * Revenue breakdown response
 */
export interface RevenueBreakdown {
  symbol: string;
  geography: RevenueBreakdownItem[];
  segments: RevenueBreakdownItem[];
}

/**
 * Earnings call transcript metadata
 */
export interface TranscriptMetadata {
  date?: string;
  quarter?: string;
  year?: number;
  type?: string;
  [key: string]: unknown; // Additional metadata fields
}

/**
 * RRG (Relative Rotation Graph) data point
 */
export interface RRGDataPoint {
  symbol: string;
  rsRatio: number; // Relative strength ratio (x-axis)
  rsMomentum: number; // Relative momentum (y-axis)
  quadrant: "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";
}

/**
 * RRG response
 */
export interface RRGData {
  benchmark: string;
  data: RRGDataPoint[];
}

/**
 * RRG transition probabilities (hybrid prediction system)
 */
export interface RRGTransitionProbabilities {
  LEADING: number;
  WEAKENING: number;
  LAGGING: number;
  IMPROVING: number;
}

/**
 * Historical RRG analog (similar past state)
 */
export interface RRGHistoricalAnalog {
  date: string;
  similarity: number; // 0-1, higher is more similar
  initial_state: {
    rsRatio: number;
    rsMomentum: number;
    quadrant: string;
  };
  outcome_30d: {
    rsRatio: number;
    rsMomentum: number;
    quadrant: string;
  };
}

/**
 * Hybrid RRG prediction result
 */
export interface RRGHybridPrediction {
  symbol: string;
  current_state: {
    rsRatio: number;
    rsMomentum: number;
    quadrant: string;
  };
  transition_probabilities: RRGTransitionProbabilities;
  most_likely_quadrant: string;
  historical_analogs: RRGHistoricalAnalog[];
  analog_average_outcome: {
    rsRatio: number;
    rsMomentum: number;
  } | null;
  disclaimer: string;
}

/**
 * Historical price data point
 */
export interface PriceDataPoint {
  date: string;
  close: number;
  volume?: number;
}

/**
 * Complete research package for a stock
 */
export interface StockResearchPackage {
  stock: Stock;
  metrics: StockMetrics;
  news: NewsArticle[];
  priceHistory?: PriceDataPoint[];
}

/**
 * DCF-Lite valuation result
 */
export interface DCFValuation {
  intrinsic_value_total: number | null;
  intrinsic_value_per_share: number | null;
  current_market_cap: number | null;
  upside_downside_pct: number | null;
  rating: "undervalued" | "fairly_valued" | "overvalued" | "insufficient_data";
  projected_fcf: Array<{
    year: number;
    fcf: number;
    pv_fcf: number;
    growth_rate: number;
  }>;
  terminal_value: number | null;
  pv_terminal_value: number | null;
  assumptions: {
    wacc: number;
    terminal_growth: number;
    fcf_margin: number;
    revenue_growth_rate: number;
    projection_years: number;
  };
}

/**
 * Factor score result
 */
export interface FactorScore {
  score: number | null;
  component_count: number;
  interpretation:
    | "excellent"
    | "above_average"
    | "average"
    | "below_average"
    | "poor"
    | "insufficient_data";
}

/**
 * Risk factor breakdown
 */
export interface RiskBreakdown {
  high_severity_risks: number;
  medium_severity_risks: number;
  low_severity_risks: number;
}

/**
 * Risk factor score with breakdown
 */
export interface RiskFactorScore extends FactorScore {
  risk_breakdown: RiskBreakdown;
}

/**
 * Composite factor score
 */
export interface CompositeScore {
  composite_score: number | null;
  interpretation: string;
  factors: {
    valuation: number | null;
    quality: number | null;
    growth: number | null;
    momentum: number | null;
    sentiment: number | null;
    risk: number | null;
  };
  weights: {
    valuation: number;
    quality: number;
    growth: number;
    momentum: number;
    sentiment: number;
    risk: number;
  };
}

/**
 * Investment signal
 */
export interface InvestmentSignal {
  signal: "BUY_CANDIDATE" | "WATCHLIST" | "AVOID" | "INSUFFICIENT_DATA";
  confidence:
    | "VERY_HIGH"
    | "HIGH"
    | "MEDIUM_HIGH"
    | "MEDIUM"
    | "MEDIUM_LOW"
    | "LOW";
  composite_score: number | null;
  positive_reasons: string[];
  negative_reasons: string[];
  neutral_reasons: string[];
  recommendation_text: string;
}

/**
 * Comprehensive analysis result
 */
export interface ComprehensiveAnalysis {
  symbol: string;
  dcf_valuation: DCFValuation | null;
  factor_scores: {
    valuation: FactorScore;
    quality: FactorScore;
    growth: FactorScore;
    momentum: FactorScore;
    sentiment: FactorScore;
    risk: RiskFactorScore;
    composite: CompositeScore;
  };
  investment_signal: InvestmentSignal;
  error?: string;
}

/**
 * API error response
 */
export interface APIError {
  error: string;
  details?: string;
}
