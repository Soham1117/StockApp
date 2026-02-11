# TODO: Industry/Sector-Wide Analysis Feature

## Overview
Comprehensive industry/sector analysis tool with customizable weightage controls for 6 fundamental valuation multiples, filtering, visualization, and backtesting capabilities.

## Core Features

### 1. Multiples Table with Industry Averages
- [ ] Create industry multiples comparison table
  - Columns: Symbol, P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales, Industry Avg, Overall Score, Rank
  - Show all stocks in selected industry/sector
  - Sortable columns
  - Highlight stocks above/below industry average
  - Color-code by score percentile

### 2. Industry Average Display
- [ ] Calculate and display industry averages for all 6 multiples
  - Mean, median, P25, P75 for each metric
  - Show in table header/footer
  - Update dynamically as filters change

### 3. Above/Below Industry Average Visualization
- [ ] Create bar charts showing stocks above/below industry average
  - One chart per multiple (6 charts total)
  - Reference line at industry average
  - Color-code: green (above avg), red (below avg)
  - Interactive tooltips with exact values

### 4. Weightage Control for 6 Valuation Multiples
- [ ] Backend: Modify `calculate_valuation_factor` to accept custom weights
  - Add `weights` parameter (Dict[str, float])
  - Support: P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales
  - Default: equal weights (16.67% each)
  - Normalize weights to sum to 100%
  - Return component scores + weighted overall score

- [ ] Backend: New API endpoint for industry analysis
  - `POST /api/industry/[industry]/analysis`
  - Accept: weights, filters, scope (sector/universe)
  - Return: scored stocks with rankings, component scores, metadata

- [ ] Frontend: Weight control component
  - 6 sliders (0-100% each) for each multiple
  - Auto-normalize to sum to 100%
  - Real-time preview of ranking changes
  - Show both raw and normalized values
  - Prevent all zeros validation

- [ ] Frontend: Weight presets
  - Equal: 16.67% each
  - Value Focused: P/E=25%, EV/EBIT=25%, EV/EBITDA=25%, others=8.33%
  - Growth Focused: P/S=30%, EV/Sales=25%, others=9%
  - Quality Focused: EV/EBIT=30%, EV/EBITDA=30%, P/E=20%, others=5%
  - Custom: user-defined weights

- [ ] Frontend: Real-time score recalculation
  - Debounce weight changes (500ms)
  - Show loading state during recalculation
  - Highlight ranking changes (e.g., "Stock X moved from #5 to #2")
  - Use Web Workers for performance if needed

### 5. Filters for Negative Values
- [ ] Default filters per industry
  - Store in `data/industry-default-filters.json`
  - Industry-specific norms (e.g., Tech: P/E > 0, Banks: P/B > 0)
  - Make defaults editable
  - Show rationale for each default

- [ ] Filter panel
  - Toggle to exclude negative values per metric
  - Industry-specific default filters
  - Custom filter builder
  - Show active filters with ability to remove/modify

- [ ] Filter application
  - Apply filters before calculating scores
  - Show count of filtered stocks
  - Allow "Show filtered stocks" toggle

### 6. Applied Filters Display
- [ ] Filter summary component
  - List all active filters
  - Show filter type and value
  - Remove filter button for each
  - "Clear all filters" button
  - "Reset to defaults" button

### 7. Backtest Performance
- [ ] Historical data collection
  - Store point-in-time metrics snapshots
  - Monthly/quarterly snapshots for past 1-3 years
  - Avoid look-ahead bias

- [ ] Backtest engine
  - Apply current filters to historical data
  - Calculate returns for filtered stocks
  - Show: total return, win rate, max drawdown, Sharpe ratio
  - Time period selector (1 year, 2 years, 3 years)

- [ ] Backtest visualization
  - Performance chart (cumulative returns)
  - Comparison vs benchmark (SPY, sector ETF)
  - Risk metrics table
  - Stock-by-stock performance breakdown

- [ ] Backtest disclaimers
  - Note about survivorship bias
  - Market regime changes
  - Transaction costs not included
  - Past performance ≠ future results

### 8. RRG (Relative Rotation Graph) Enhancements
- [ ] RRG education/tooltips
  - Add tooltips explaining each quadrant
  - "What is RRG?" help section
  - Quadrant descriptions:
    - Leading: Strong and accelerating (best performers)
    - Weakening: Strong but decelerating (may be topping)
    - Lagging: Weak and decelerating (worst performers)
    - Improving: Weak but accelerating (potential turnaround)

- [ ] RRG visualization improvements
  - Time animation (show rotation over time)
  - Sector/industry overlay
  - Stock labels on hover
  - Quadrant boundaries clearly marked

- [ ] RRG analysis
  - Historical quadrant transitions
  - "Stocks moving from Lagging to Improving"
  - "Stocks rotating from Leading to Weakening"

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Multiples table with industry averages
- [ ] Above/below average visualization
- [ ] Basic filter panel with industry defaults
- [ ] Backend support for custom weights

### Phase 2: Weighting System (Week 3)
- [ ] Weight control UI with sliders
- [ ] Weight presets
- [ ] Real-time score recalculation
- [ ] Ranking change indicators

### Phase 3: Advanced Features (Week 4+)
- [ ] Backtest engine (start with 1-year)
- [ ] RRG enhancements (tooltips, animation)
- [ ] Export/save filter sets
- [ ] Performance optimizations

## Technical Considerations

### Backend
- [ ] Modify `fastapi_app/factor_scoring.py::calculate_valuation_factor`
  - Add weights parameter
  - Return component scores individually
  - Calculate weighted average instead of mean

- [ ] New endpoint: `POST /api/industry/[industry]/analysis`
  - Accept weights JSON
  - Accept filters JSON
  - Return scored and ranked stocks
  - Cache results for performance

- [ ] Historical data storage
  - Design schema for point-in-time metrics
  - Monthly snapshots table
  - Efficient querying for backtests

### Frontend
- [ ] New page: `/industry/[industry]/analysis`
  - Or add tab to existing industry view
  - Responsive layout (mobile-friendly)

- [ ] Components to create:
  - `IndustryMultiplesTable` - main table component
  - `WeightControlPanel` - sliders and presets
  - `FilterPanel` - filter builder
  - `AppliedFiltersDisplay` - active filters summary
  - `BacktestResults` - backtest visualization
  - `RRGEnhanced` - improved RRG with tooltips

- [ ] State management
  - Store weights in URL params (shareable)
  - Store filters in state
  - Debounce weight changes
  - Optimistic UI updates

### Data
- [ ] Industry default filters JSON
  - Structure: `{ "industry": { "filters": [...] } }`
  - Include rationale for each default
  - Make editable via UI

- [ ] Historical metrics snapshots
  - Monthly snapshots for past 2-3 years
  - Store in database or parquet files
  - Efficient retrieval for backtests

## UX Considerations

- [ ] Progressive disclosure
  - Start with presets, hide advanced controls
  - "Advanced" toggle for custom weights
  - Tooltips explaining each metric

- [ ] Performance
  - Virtual scrolling for large tables (100+ stocks)
  - Lazy load charts
  - Debounce weight changes
  - Show loading states

- [ ] Accessibility
  - Keyboard navigation for sliders
  - Screen reader support
  - High contrast mode support

- [ ] Mobile responsiveness
  - Horizontal scroll for table
  - Collapsible weight controls
  - Touch-friendly sliders

## Future Enhancements

- [ ] Industry health score (overall sector performance indicator)
- [ ] Correlation matrix (which stocks move together)
- [ ] Factor exposure analysis (Value, Growth, Quality, Momentum)
- [ ] Export functionality (CSV, PDF reports)
- [ ] Save/share filter presets
- [ ] Multi-industry comparison
- [ ] Custom benchmark selection for RRG

## Notes

- Weightage control is for the 6 fundamental valuation multiples (P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales)
- Default is equal weighting (16.67% each)
- Users can adjust weights to emphasize different aspects (value, growth, quality)
- Weights should auto-normalize to sum to 100%
- Real-time recalculation shows how weight changes affect rankings
- Backtesting requires historical point-in-time data to avoid look-ahead bias

---

## Industry Rules System for Average Calculation & Optimization

### Overview
Rules system to clean data when calculating industry averages, with industry-specific defaults and optimization capabilities to find best-performing rule sets through backtesting.

### Key Concepts

**Two Types of Rules:**
1. **Data Quality Rules** - Exclude bad data from industry average calculations (e.g., "exclude negative P/E")
2. **Stock Filtering Rules** - Filter which stocks to analyze (existing screener rules)

**Important Distinction:**
- Data quality rules affect **industry average calculation** (cleaner averages)
- Stock filtering rules affect **which stocks are analyzed** (stock selection)

### Phase 1: Data Quality Rules (Foundation)

#### Backend Implementation
- [ ] Create `DataQualityRule` interface
  ```typescript
  interface DataQualityRule {
    id: string;
    metric: string; // e.g., 'peRatioTTM'
    excludeCondition: {
      operator: '<' | '>' | '=' | '!=' | 'between';
      value: number | [number, number];
    };
    enabled: boolean;
    rationale: string; // Why this rule makes sense
  }
  ```

- [ ] Modify industry average calculation to apply data quality rules
  - Function: `calculateIndustryAverageWithRules(stocks, metric, rules)`
  - Filter stocks based on rules before calculating stats
  - Return clean `IndustryStats` (mean, median, p25, p75, etc.)

- [ ] Create industry-specific default rules
  - Store in `data/industry-average-rules.json`
  - Structure:
    ```json
    {
      "Auto Manufacturers": {
        "rules": [
          { "metric": "peRatioTTM", "excludeCondition": { "operator": "<", "value": 0 }, "rationale": "Exclude negative earnings" },
          { "metric": "peRatioTTM", "excludeCondition": { "operator": ">", "value": 100 }, "rationale": "Exclude extreme outliers" },
          { "metric": "priceToBookRatioTTM", "excludeCondition": { "operator": "<", "value": 0 }, "rationale": "Exclude negative book value" }
        ]
      },
      "Technology": {
        "rules": [
          { "metric": "peRatioTTM", "excludeCondition": { "operator": "<", "value": 0 } },
          { "metric": "priceToSalesRatioTTM", "excludeCondition": { "operator": "<", "value": 0 } }
        ]
      }
    }
    ```

- [ ] New API endpoint: `POST /api/industry/[industry]/average-rules`
  - Accept: custom rules (optional, defaults to industry defaults)
  - Apply rules to calculate clean industry averages
  - Return: `IndustryStats` with rules applied

#### Frontend Implementation
- [ ] `IndustryRulesPanel` component
  - Display active rules for industry
  - Show rule rationale
  - Enable/disable individual rules
  - Add/remove custom rules
  - Show impact: "Excludes X stocks from average calculation"

- [ ] Rule builder (reuse `CustomRuleBuilder` pattern)
  - Select metric
  - Select exclude condition (operator + value)
  - Add rationale
  - Preview impact before saving

- [ ] Industry average display
  - Show which rules are applied
  - Show count of stocks included/excluded
  - Compare: averages with vs without rules

### Phase 2: Rule Optimization (Advanced)

#### Backend Implementation
- [ ] Rule templates (predefined rule options)
  ```typescript
  const RULE_TEMPLATES = {
    excludeNegative: { operator: '<', value: 0 },
    excludeExtremeHigh: { operator: '>', value: 100 }, // for P/E
    excludeExtremeLow: { operator: '<', value: -50 }, // for growth
    excludeZero: { operator: '=', value: 0 },
  };
  ```

- [ ] Optimization engine
  - Grid search over rule combinations
  - Objective function: maximize Sharpe ratio or risk-adjusted return
  - Constraints:
    - Minimum 10 stocks must remain after filtering
    - Maximum 3 rules per metric
    - Maximum 10 total rules
  - Use walk-forward validation to avoid overfitting

- [ ] New API endpoint: `POST /api/industry/[industry]/optimize-rules`
  - Accept: optimization parameters (objective, constraints, time period)
  - Return: async job ID
  - Process: test rule combinations, return best performing set

- [ ] Optimization job status: `GET /api/industry/[industry]/optimize-rules/[jobId]`
  - Return: status, progress, best rules found so far

#### Backtest Framework
- [ ] Historical data infrastructure
  - Store monthly snapshots of metrics for 2-3 years
  - Point-in-time data (no look-ahead bias)
  - Efficient querying for backtests

- [ ] Backtest engine
  - Apply rule set to historical snapshots
  - Calculate industry averages with rules
  - Score/rank stocks using those averages
  - Measure performance: returns, Sharpe ratio, max drawdown, win rate
  - Walk-forward validation (train on period 1, test on period 2, etc.)

- [ ] New API endpoint: `POST /api/industry/[industry]/backtest`
  - Accept: rule set, time period, benchmark
  - Return: performance metrics, comparison vs benchmark

#### Frontend Implementation
- [ ] `RuleOptimizationDialog` component
  - "Find Best Rules" button
  - Show optimization progress
  - Display results: best rules, performance metrics
  - Compare multiple rule sets side-by-side

- [ ] `BacktestResults` component
  - Performance chart (cumulative returns)
  - Comparison vs benchmark (SPY, sector ETF)
  - Risk metrics table
  - Rule set comparison (multiple rule sets on same chart)

- [ ] Optimization visualization
  - Show search progress
  - Display top 5 rule sets found
  - Performance metrics for each

### Phase 3: UI Integration

- [ ] Add rules panel to industry analysis page
  - Collapsible section
  - Show active rules
  - Quick edit/add rules

- [ ] Rule impact visualization
  - Before/after comparison of industry averages
  - Show which stocks are excluded
  - Histogram: distribution with/without rules

- [ ] Rule set management
  - Save custom rule sets
  - Load industry defaults
  - Export/import rule sets
  - Share rule sets

### Implementation Details

#### Data Quality Rules Application Flow
```
1. Load all stocks in industry
2. Apply data quality rules (exclude bad data)
3. Calculate industry averages from clean data
4. Use clean averages to score/rank stocks
5. Apply stock filtering rules (if any) to select stocks for analysis
```

#### Rule Optimization Flow
```
1. Define rule templates and constraints
2. Generate rule combinations (grid search)
3. For each combination:
   a. Apply to historical snapshots
   b. Calculate industry averages
   c. Score stocks
   d. Measure performance (Sharpe, returns, etc.)
4. Select best performing rule set
5. Validate on out-of-sample data
6. Return best rules + performance metrics
```

### Critical Considerations

- [ ] **Overfitting Prevention**
  - Use train/validation/test split
  - Walk-forward analysis
  - Out-of-sample testing
  - Limit rule complexity (max 3-5 rules per metric)
  - Cross-validation

- [ ] **Performance Optimization**
  - Cache rule application results
  - Parallelize backtest calculations
  - Use efficient search algorithms
  - Limit search space (predefined templates)

- [ ] **Transparency**
  - Clear rationale for each rule
  - Show impact metrics (stocks excluded)
  - Document optimization methodology
  - Disclaimers about overfitting risks

- [ ] **Industry Differences**
  - Industry-specific defaults
  - Allow customization
  - Show best practices per industry
  - Context-aware rule suggestions

### Default Rules by Industry

**Auto Manufacturers:**
- Exclude P/E < 0 (negative earnings)
- Exclude P/E > 100 (extreme outliers)
- Exclude P/B < 0 (negative book value)
- Rationale: Cyclical industry, exclude data quality issues

**Technology:**
- Exclude P/E < 0
- Exclude P/S < 0
- Exclude P/E > 200 (growth stocks can have high P/E)
- Rationale: High growth, but negative values indicate data issues

**Banks:**
- Exclude P/B < 0
- Exclude P/E < 0
- Exclude ROE < -50% (extreme losses)
- Rationale: Asset-heavy, book value is critical

**Healthcare:**
- Exclude P/E < 0
- Exclude P/S < 0
- Exclude EV/EBITDA < 0
- Rationale: R&D heavy, but negative multiples indicate issues

### Future Enhancements

- [ ] Machine learning-based rule discovery
- [ ] Multi-objective optimization (return vs risk)
- [ ] Rule set recommendations based on market conditions
- [ ] A/B testing framework for rule sets
- [ ] Community-shared rule sets
- [ ] Rule performance tracking over time

