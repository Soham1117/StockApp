# Unused Defeatbeta API Data

This document lists data available from `defeatbeta_api` that is **not currently being used** in the application.

## Currently Used Data

### Metadata & Basic Info
- ✅ `info()` - Company info, industry, sector
- ✅ `summary()` - Market cap, summary statistics
- ✅ `price()` - Historical price data

### Valuation Metrics
- ✅ `ttm_pe()` - Trailing Twelve Months P/E Ratio
- ✅ `ps_ratio()` - Price-to-Sales Ratio
- ✅ `pb_ratio()` - Price-to-Book Ratio
- ✅ `peg_ratio()` - PEG Ratio (Price/Earnings to Growth)
- ✅ `ttm_revenue()` - Trailing Twelve Months Revenue

### Profitability Metrics
- ✅ `roe()` - Return on Equity
- ✅ `roa()` - Return on Assets
- ✅ `roic()` - Return on Invested Capital
- ✅ `quarterly_gross_margin()` - Gross Margin (quarterly)
- ✅ `quarterly_operating_margin()` - Operating Margin (quarterly)
- ✅ `quarterly_net_margin()` - Net Margin (quarterly)
- ✅ `quarterly_ebitda_margin()` - EBITDA Margin (quarterly)

### Growth Metrics
- ✅ `quarterly_revenue_yoy_growth()` - Revenue Growth YoY (quarterly)
- ✅ `quarterly_operating_income_yoy_growth()` - EBIT Growth YoY (quarterly)
- ✅ `quarterly_eps_yoy_growth()` - EPS Growth YoY (quarterly)
- ✅ `quarterly_fcf_yoy_growth()` - FCF Growth YoY (quarterly)
- ✅ `quarterly_fcf_margin()` - FCF Margin (quarterly)

### Financial Statements
- ✅ `annual_balance_sheet()` - Annual balance sheet
- ✅ `quarterly_balance_sheet()` - Quarterly balance sheet
- ✅ `annual_income_statement()` - Annual income statement
- ✅ `quarterly_income_statement()` - Quarterly income statement
- ✅ `quarterly_cash_flow()` - Quarterly cash flow statement
- ✅ `annual_cash_flow()` - Annual cash flow statement (available but not used)

### News & Events
- ✅ `news()` - News articles with metadata

### Forecasts
- ✅ `earnings_forecast()` - Earnings estimates (partially used for Forward P/E)

---

## Unused Data Available

### Company Information
- ❌ `officers()` - Company officers and executives (CEO, CFO, etc.)
  - **Potential Use**: Management quality assessment, insider trading analysis

### Corporate Actions
- ❌ `splits()` - Stock split events history
  - **Potential Use**: Historical split-adjusted analysis, split impact on price
- ❌ `dividends()` - Dividend history and events
  - **Potential Use**: Dividend yield calculation, dividend growth analysis, dividend sustainability
- ❌ `ttm_eps()` - Trailing Twelve Months EPS (direct method)
  - **Potential Use**: More accurate EPS calculations, EPS trend analysis

### Earnings & Calendar
- ❌ `calendar()` - Earnings calendar (upcoming earnings dates)
  - **Potential Use**: Earnings date tracking, earnings surprise analysis
- ❌ `earnings()` - Historical EPS data
  - **Potential Use**: EPS trend analysis, earnings consistency

### Forecasts & Estimates
- ❌ `revenue_forecast()` - Revenue estimates/forecasts
  - **Potential Use**: Revenue growth expectations, analyst consensus, beat/miss analysis

### Shares & Capital Structure
- ❌ `shares()` - Shares outstanding history
  - **Potential Use**: Share buyback analysis, dilution tracking, market cap verification

### Currency & International
- ❌ `currency(symbol)` - Exchange rate data
  - **Potential Use**: Multi-currency support, FX impact analysis

### Revenue Breakdown
- ❌ `revenue_breakdown()` - Revenue by product/service and geography
  - **Potential Use**: 
    - Geographic diversification analysis
    - Product/service mix analysis
    - Revenue concentration risk assessment
    - Growth by segment

### Earnings Call Transcripts
- ❌ `transcripts()` - Earnings call transcripts
  - **Potential Use**: 
    - LLM-powered sentiment analysis
    - Key financial data extraction
    - Management commentary analysis
    - Forward guidance extraction
    - Risk factor identification

### Additional Financial Metrics
- ❌ `WACC` (Weighted Average Cost of Capital) - If available via defeatbeta
  - **Potential Use**: DCF valuation, cost of capital analysis
- ❌ `Equity Multiplier` - If available
  - **Potential Use**: Financial leverage analysis
- ❌ `Asset Turnover` - If available
  - **Potential Use**: Asset efficiency analysis

### Annual Versions (We Use Quarterly)
- ❌ `annual_gross_margin()` - Annual gross margin (we use quarterly)
- ❌ `annual_operating_margin()` - Annual operating margin (we use quarterly)
- ❌ `annual_net_margin()` - Annual net margin (we use quarterly)
- ❌ `annual_ebitda_margin()` - Annual EBITDA margin (we use quarterly)
- ❌ `annual_revenue_yoy_growth()` - Annual revenue growth (we use quarterly)
- ❌ `annual_operating_income_yoy_growth()` - Annual EBIT growth (we use quarterly)
- ❌ `annual_eps_yoy_growth()` - Annual EPS growth (we use quarterly)
- ❌ `annual_fcf_yoy_growth()` - Annual FCF growth (we use quarterly)
- ❌ `annual_fcf_margin()` - Annual FCF margin (we use quarterly)
  - **Potential Use**: Annual trend analysis, smoothing quarterly volatility

### Cash Flow Statement
- ❌ `annual_cash_flow()` - Annual cash flow statement (we use quarterly)
  - **Potential Use**: Annual cash flow analysis, long-term trends

---

## High-Value Unused Data (Recommended Priority)

### 1. **Dividend Data** (`dividends()`)
   - **Why**: Dividend yield is currently `None` in metrics
   - **Impact**: Complete valuation picture, income investor analysis
   - **Effort**: Low - direct API call

### 2. **Revenue Breakdown** (`revenue_breakdown()`)
   - **Why**: Geographic/product diversification is valuable for risk assessment
   - **Impact**: High - unique data not easily available elsewhere
   - **Effort**: Medium - needs UI component

### 3. **Earnings Calendar** (`calendar()`)
   - **Why**: Earnings dates are critical for timing analysis
   - **Impact**: Medium - useful for active traders
   - **Effort**: Low - simple calendar display

### 4. **Historical EPS** (`earnings()`, `ttm_eps()`)
   - **Why**: Better EPS trend analysis than quarterly growth alone
   - **Impact**: Medium - improves earnings quality assessment
   - **Effort**: Low - direct API call

### 5. **Earnings Call Transcripts** (`transcripts()`)
   - **Why**: Rich source of forward-looking information
   - **Impact**: Very High - but requires LLM processing
   - **Effort**: High - needs LLM integration, sentiment extraction

### 6. **Stock Splits** (`splits()`)
   - **Why**: Important for historical price analysis
   - **Impact**: Low-Medium - mainly for historical context
   - **Effort**: Low - simple event list

### 7. **Company Officers** (`officers()`)
   - **Why**: Management quality is part of fundamental analysis
   - **Impact**: Medium - useful for governance analysis
   - **Effort**: Low - simple table display

### 8. **Shares Outstanding** (`shares()`)
   - **Why**: Verify market cap, track buybacks/dilution
   - **Impact**: Medium - important for capital structure analysis
   - **Effort**: Low - direct API call

---

## Notes

- Some methods may have different names or signatures in the actual API
- Annual vs Quarterly: We prioritize quarterly for more recent data, but annual can provide smoother trends
- Transcripts require additional processing (LLM) to extract meaningful insights
- Revenue breakdown structure may vary by company (not all companies report segment data)

