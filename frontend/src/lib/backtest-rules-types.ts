export interface BacktestRule {
  metric: string;
  operator: string;
}

export interface BacktestRuleResult {
  sector: string;
  cap: 'large' | 'mid' | 'small';
  holding_years: number;
  years: number;
  rule_id: string;
  rules: BacktestRule[];
  train_points: number;
  test_points: number;
  train_avg_portfolio: number | null;
  train_avg_benchmark: number | null;
  train_avg_excess: number | null;
  train_win_rate: number | null;
  test_avg_portfolio: number | null;
  test_avg_benchmark: number | null;
  test_avg_excess: number | null;
  test_win_rate: number | null;
  avg_filtered_size: number | null;
  points_total: number;
  tickers_used: string[];
  selected_by_point?: Array<{
    as_of: string;
    end_date: string;
    symbols: string[];
  }>;
  error?: string;
}

export interface BacktestRulesFilters {
  sector?: string;
  cap?: 'large' | 'mid' | 'small' | 'all';
  holdingYears?: number;
}

export interface BacktestRulesResponse {
  results: BacktestRuleResult[];
  total: number;
  page: number;
  page_size: number;
  sectors: string[];
  caps: string[];
  holding_years_options: number[];
}

export type RulesSortField =
  | 'rule_id'
  | 'sector'
  | 'cap'
  | 'holding_years'
  | 'train_avg_portfolio'
  | 'train_avg_benchmark'
  | 'train_avg_excess'
  | 'train_win_rate';

export type SortDirection = 'asc' | 'desc';
