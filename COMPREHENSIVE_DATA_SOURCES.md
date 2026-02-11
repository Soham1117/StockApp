# Comprehensive Data Sources for Research Reports

This document catalogues **ALL available data** from Finnhub and DefeatBeta APIs and maps what can be used to improve research report quality.

---

## Current Data Usage Summary

### ✅ Currently Used
- Basic company info (name, sector, industry, market cap)
- Valuation ratios (P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales, PEG)
- Profitability metrics (ROE, ROA, ROIC, margins)
- Financial health (debt ratios, liquidity ratios, interest coverage)
- Cash flow metrics (FCF, OCF, yields, margins)
- Growth rates (revenue, EBIT, EPS, FCF YoY)
- Historical price data
- Company news (Finnhub + DefeatBeta)
- Partial forward estimates (earnings_forecast for Forward P/E)
- SEC filing insights (risk changes, business updates, liquidity, accounting flags)
- Earnings transcript insights (guidance, drivers, tone, execution flags)

---

## 🔵 FINNHUB API - Complete Endpoint Catalog

### Currently Used ✅
1. **Company News** (`/company-news`)
   - News articles with headline, summary, source, datetime, image
   - 90-day lookback window
   - Rate: 8s timeout

### Available But Not Used ❌

#### Company Fundamentals
2. **Company Profile** (`/stock/profile2`)
   - ❌ Full company description
   - ❌ Industry classification
   - ❌ IPO date
   - ❌ Logo URL
   - ❌ Website URL
   - ❌ Exchange listing
   - **Use in Report:** Company overview section

3. **Company Executives** (`/stock/executive`)
   - ❌ Executive names, titles, ages
   - ❌ Compensation data
   - ❌ Since date (tenure)
   - **Use in Report:** Management quality assessment

4. **Basic Financials** (`/stock/metric`)
   - ❌ 50+ financial ratios and metrics
   - ❌ 52-week high/low
   - ❌ Beta
   - ❌ Dividend yield (TTM)
   - ❌ EPS (TTM, diluted, basic)
   - ❌ Revenue per share
   - ❌ Book value per share
   - **Use in Report:** Additional valuation metrics, risk metrics (beta)

5. **Financial Statements** (`/stock/financials`)
   - ❌ Annual/quarterly income statement
   - ❌ Annual/quarterly balance sheet
   - ❌ Annual/quarterly cash flow
   - ❌ As-reported format (GAAP/IFRS)
   - **Use in Report:** Historical financial trend analysis

6. **Financials as Reported** (`/stock/financials-reported`)
   - ❌ SEC-filed financials in original format
   - ❌ Full footnotes and disclosures
   - **Use in Report:** Deep dive analysis, accounting quality

#### Earnings & Estimates
7. **Earnings Calendar** (`/calendar/earnings`)
   - ❌ Upcoming earnings dates
   - ❌ EPS estimate
   - ❌ Revenue estimate
   - **Use in Report:** Forward catalysts section

8. **Earnings Estimates** (`/stock/earnings`)
   - ❌ Analyst EPS estimates (Q1, Q2, annual)
   - ❌ Number of analysts
   - ❌ High/low/average estimates
   - ❌ Earnings surprise history
   - **Use in Report:** Forward valuation, consensus analysis

9. **Revenue Estimates** (`/stock/revenue-estimates`)
   - ❌ Quarterly and annual revenue forecasts
   - ❌ Analyst count
   - ❌ High/low/average/median
   - **Use in Report:** Growth expectations, beat/miss analysis

10. **EPS Surprises** (`/stock/earnings`)
    - ❌ Historical actual vs estimated EPS
    - ❌ Beat/miss magnitude
    - **Use in Report:** Earnings quality, management credibility

#### Analyst Recommendations
11. **Recommendation Trends** (`/stock/recommendation`)
    - ❌ Buy/Hold/Sell ratings over time
    - ❌ Analyst count by rating
    - ❌ Rating changes (upgrades/downgrades)
    - **Use in Report:** Sell-side sentiment, consensus view

12. **Price Target** (`/stock/price-target`)
    - ❌ Analyst price targets
    - ❌ High/low/average/median targets
    - ❌ Upside/downside percentage
    - **Use in Report:** Valuation benchmark, target price analysis

13. **Upgrade/Downgrade** (`/stock/upgrade-downgrade`)
    - ❌ Recent analyst rating changes
    - ❌ Firm name, action, grade
    - **Use in Report:** Recent catalyst analysis

#### Ownership & Insider Activity
14. **Institutional Ownership** (`/stock/institutional-ownership`)
    - ❌ Top institutional holders
    - ❌ Shares held, % of float
    - ❌ Changes in holdings
    - **Use in Report:** Ownership concentration, smart money tracking

15. **Insider Transactions** (`/stock/insider-transactions`)
    - ❌ Insider buying/selling activity
    - ❌ Transaction type, shares, price
    - ❌ Insider name and title
    - **Use in Report:** Management confidence signal

16. **Fund Ownership** (`/stock/fund-ownership`)
    - ❌ Mutual fund and ETF holders
    - ❌ % of portfolio, shares held
    - **Use in Report:** Institutional demand analysis

#### Market Data
17. **Quote** (`/quote`)
    - ❌ Real-time price, bid/ask
    - ❌ Open, high, low, close
    - ❌ Volume
    - ❌ Previous close
    - **Use in Report:** Current price context

18. **Stock Candles** (`/stock/candle`)
    - ❌ OHLCV historical data
    - ❌ Multiple timeframes (1min to 1month)
    - **Use in Report:** Price trend analysis, technical context

19. **Splits** (`/stock/split`)
    - ❌ Historical stock splits
    - ❌ Split ratio, date
    - **Use in Report:** Historical price adjustment context

20. **Dividends** (`/stock/dividend`)
    - ❌ Dividend history
    - ❌ Ex-dividend date, amount
    - ❌ Payment date
    - **Use in Report:** Dividend yield calculation, payout history

#### SEC Filings
21. **SEC Filings** (`/stock/filings`)
    - ❌ List of all SEC filings (10-K, 10-Q, 8-K, etc.)
    - ❌ Filing date, accession number
    - ❌ Report URL
    - **Use in Report:** Filing timeline, recent disclosures

#### Technical Indicators
22. **Technical Indicators** (`/indicator`)
    - ❌ RSI, MACD, moving averages
    - ❌ Bollinger Bands, Stochastic
    - **Use in Report:** Technical analysis section (optional)

#### Alternative Data
23. **Social Sentiment** (`/stock/social-sentiment`)
    - ❌ Reddit, Twitter, news sentiment scores
    - ❌ Mention volume
    - ❌ Positive/negative/neutral breakdown
    - **Use in Report:** Retail sentiment gauge

24. **Insider Sentiment** (`/stock/insider-sentiment`)
    - ❌ Aggregated insider trading signals
    - ❌ MSPR (Month Shares Purchased Ratio)
    - **Use in Report:** Insider confidence metric

25. **Lobbying** (`/stock/lobbying`)
    - ❌ Company lobbying expenditures
    - ❌ Issues lobbied
    - **Use in Report:** Regulatory risk assessment

26. **USA Spending** (`/stock/usa-spending`)
    - ❌ Government contracts awarded
    - ❌ Contract value
    - **Use in Report:** Revenue concentration risk (defense contractors)

#### ETF & Index
27. **ETF Holdings** (`/etf/holdings`)
    - ❌ ETF constituents and weights
    - **Use in Report:** Index inclusion analysis

28. **Index Constituents** (`/index/constituents`)
    - ❌ Stocks in S&P 500, NASDAQ, etc.
    - **Use in Report:** Peer group identification

#### Similarity & Peers
29. **Similar Stocks** (`/stock/peers`)
    - ❌ Algorithmically similar companies
    - **Use in Report:** Peer comparison group

---

## 🟢 DEFEATBETA API - Complete Method Catalog

### Currently Used ✅
1. **info()** - Company name, sector, industry
2. **summary()** - Market cap, stats
3. **price()** - Historical prices
4. **ttm_pe()** - P/E ratio
5. **ps_ratio()**, **pb_ratio()**, **peg_ratio()** - Valuation ratios
6. **roe()**, **roa()**, **roic()** - Profitability
7. **quarterly_gross_margin()**, **quarterly_operating_margin()**, **quarterly_net_margin()**, **quarterly_ebitda_margin()** - Margins
8. **quarterly_revenue_yoy_growth()**, **quarterly_operating_income_yoy_growth()**, **quarterly_eps_yoy_growth()**, **quarterly_fcf_yoy_growth()** - Growth
9. **quarterly_fcf_margin()** - FCF margin
10. **annual/quarterly_balance_sheet()**, **annual/quarterly_income_statement()**, **quarterly_cash_flow()** - Financial statements
11. **news()** - News articles
12. **earnings_forecast()** - Forward estimates (partial use)

### Available But Not Used ❌

#### Company Information
13. **officers()** - CEO, CFO, executives
    - Names, titles, ages
    - **Use in Report:** Management team overview

#### Corporate Actions
14. **splits()** - Stock split history
    - Split ratio, dates
    - **Use in Report:** Historical context

15. **dividends()** - Dividend history
    - Dividend amount, ex-date, payment date
    - **Use in Report:** Dividend yield calculation, payout ratio

16. **ttm_eps()** - Direct TTM EPS
    - **Use in Report:** More accurate EPS for P/E calculation

#### Earnings & Calendar
17. **calendar()** - Earnings calendar
    - Upcoming earnings dates
    - **Use in Report:** Forward catalysts

18. **earnings()** - Historical EPS
    - Quarterly and annual EPS history
    - **Use in Report:** EPS trend analysis, consistency

#### Forecasts
19. **revenue_forecast()** - Revenue estimates
    - Quarterly and annual forecasts
    - Analyst count, high/low/avg
    - **Use in Report:** Revenue growth expectations

#### Capital Structure
20. **shares()** - Shares outstanding history
    - Historical share count
    - **Use in Report:** Buyback analysis, dilution tracking

#### Revenue Breakdown
21. **revenue_breakdown()** - Segment revenue
    - Revenue by product/service
    - Revenue by geography
    - **Use in Report:** Product mix analysis, geographic diversification

#### Earnings Call Transcripts
22. **earning_call_transcripts()** - Full transcripts
    - Management discussion
    - Q&A session
    - **Use in Report:** Already extracted via LLM insights (guidance, drivers, tone)

#### Annual Metrics (Currently Using Quarterly)
23. **annual_gross_margin()**, **annual_operating_margin()**, **annual_net_margin()**, **annual_ebitda_margin()** - Annual margins
24. **annual_revenue_yoy_growth()**, **annual_operating_income_yoy_growth()**, **annual_eps_yoy_growth()**, **annual_fcf_yoy_growth()** - Annual growth
25. **annual_fcf_margin()** - Annual FCF margin
26. **annual_cash_flow()** - Annual cash flow statement
    - **Use in Report:** Longer-term trend analysis, smoothing volatility

#### Additional Metrics (If Available)
27. **WACC** - Weighted Average Cost of Capital
    - **Use in Report:** DCF valuation
28. **Asset Turnover** - Revenue / Assets
    - **Use in Report:** Asset efficiency
29. **Equity Multiplier** - Assets / Equity
    - **Use in Report:** Financial leverage

---

## 📊 SEC EDGAR FILINGS - What We Can Extract

### Currently Extracting ✅
- **Business updates** - Major business changes
- **Risk changes** - New/changed risks
- **Liquidity & capital** - Cash position, debt, capex
- **Accounting flags** - Policy changes, non-GAAP
- **Other highlights** - Miscellaneous items

### Available in Filings But Not Extracting ❌

#### From Item 1 (Business)
1. **Product segment descriptions**
   - Product names (EPYC, Ryzen, Instinct for AMD)
   - Competitive positioning
   - Market share commentary
   - **Use in Report:** Product-level competitive analysis

2. **Geographic presence**
   - Revenue by region (if disclosed)
   - Manufacturing locations
   - Key markets
   - **Use in Report:** Geographic diversification

3. **Customer concentration**
   - Top customer dependencies
   - Customer concentration risks
   - **Use in Report:** Revenue concentration risk

#### From Item 1A (Risk Factors)
4. **Categorized risks** (not just changes)
   - Geopolitical risks (China, tariffs)
   - Supply chain risks (TSMC dependency)
   - Competitive risks (NVIDIA, Intel)
   - Regulatory risks (export controls)
   - Technology risks (product delays)
   - **Use in Report:** Comprehensive risk analysis by category

#### From Item 7/7A (MD&A)
5. **Forward guidance**
   - Revenue guidance for next quarter/year
   - Margin expectations
   - Capex plans
   - Product launch timelines
   - **Use in Report:** Forward catalysts section

6. **Management commentary on trends**
   - AI market growth commentary
   - Competitive dynamics discussion
   - Pricing environment
   - **Use in Report:** Management perspective on business

7. **Segment performance**
   - Data Center revenue growth
   - Client revenue trends
   - Gaming/Embedded performance
   - **Use in Report:** Segment-level analysis

8. **Critical accounting estimates**
   - Revenue recognition policies
   - Inventory valuation methods
   - Goodwill impairment assumptions
   - **Use in Report:** Accounting quality assessment

#### From Financial Statement Notes
9. **Debt maturity schedule**
   - Debt maturities by year
   - Interest rates
   - Covenants
   - **Use in Report:** Refinancing risk analysis

10. **Stock-based compensation**
    - SBC as % of revenue
    - Dilution impact
    - **Use in Report:** Shareholder dilution risk

11. **Geographic revenue breakdown**
    - Revenue by country/region
    - **Use in Report:** Geographic concentration

12. **Contingencies and commitments**
    - Legal proceedings
    - Purchase commitments
    - Operating leases
    - **Use in Report:** Off-balance sheet risk

---

## 🎯 MAPPING TO RESEARCH REPORT WEAKNESSES

### 1. **DCF / Target Price / Valuation Model**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| Historical FCF | ✅ DefeatBeta (quarterly_cash_flow) | Used |
| Forward revenue estimates | ❌ Finnhub (revenue-estimates) | **NOT USED** |
| Forward EPS estimates | ⚠️ DefeatBeta (earnings_forecast) | Partial |
| Analyst price targets | ❌ Finnhub (price-target) | **NOT USED** |
| Beta | ❌ Finnhub (stock/metric) | **NOT USED** |
| Debt cost | ⚠️ SEC Filing Notes | **NOT EXTRACTED** |
| WACC | ❌ Not available | N/A |

**Recommendation:**
- ✅ **Add analyst price target consensus** (Finnhub)
- ✅ **Add forward revenue estimates** (Finnhub)
- ✅ **Calculate PEG using forward estimates**
- ⚠️ **Simple DCF using historical FCF + forward revenue**
- ⚠️ **Peer multiples-based valuation**

---

### 2. **Product-Level Competitive Analysis**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| Segment revenue | ❌ DefeatBeta (revenue_breakdown) | **NOT USED** |
| Product mentions in filings | ⚠️ SEC MD&A | **NOT EXTRACTED** |
| Competitive commentary | ⚠️ SEC Item 1 | **NOT EXTRACTED** |
| Market share data | ❌ Not available | N/A |

**Recommendation:**
- ✅ **Extract segment revenue from revenue_breakdown()**
- ✅ **Enhance FILING_PROMPT to extract product mentions**
- ✅ **Extract competitive positioning from Item 1**

---

### 3. **Forward Catalysts**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| Earnings calendar | ❌ DefeatBeta (calendar) / Finnhub | **NOT USED** |
| Forward guidance | ⚠️ SEC MD&A / Transcripts | **Partial in transcripts** |
| Product launches | ⚠️ SEC MD&A | **NOT EXTRACTED** |
| Analyst upgrades/downgrades | ❌ Finnhub (upgrade-downgrade) | **NOT USED** |

**Recommendation:**
- ✅ **Add earnings calendar** (DefeatBeta or Finnhub)
- ✅ **Extract forward guidance from SEC MD&A**
- ✅ **Show recent analyst actions** (Finnhub)

---

### 4. **Risk Modeling (Geopolitical, Supply Chain)**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| Risk factors | ✅ SEC Item 1A | Used (risk_changes only) |
| Categorized risks | ⚠️ SEC Item 1A | **NOT CATEGORIZED** |
| Geographic exposure | ⚠️ SEC Notes | **NOT EXTRACTED** |
| Customer concentration | ⚠️ SEC Item 1 | **NOT EXTRACTED** |
| Supply chain risks | ⚠️ SEC Item 1A | **NOT EXTRACTED** |

**Recommendation:**
- ✅ **Categorize risks** (geopolitical, supply chain, competitive, regulatory)
- ✅ **Extract customer concentration**
- ✅ **Extract geographic revenue exposure**

---

### 5. **Peer Ranking Explanation**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| Growth/Value score | ✅ Custom algorithm | Used |
| Score rank | ✅ Rankings API | Used |
| Peer comparison | ✅ Industry metrics | Used |
| Similar stocks | ❌ Finnhub (stock/peers) | **NOT USED** |

**Recommendation:**
- ✅ **Explain methodology in report prompt**
- ✅ **Show factor weights** (already available)
- ⚠️ **Use Finnhub peers as validation**

---

### 6. **Growth vs Valuation Disconnect**

**Available Data:**
| Data Point | Source | Status |
|------------|--------|--------|
| TTM P/E | ✅ DefeatBeta | Used |
| TTM growth rates | ✅ DefeatBeta | Used |
| PEG ratio | ✅ DefeatBeta | Used |
| Forward P/E | ⚠️ DefeatBeta (earnings_forecast) | Partial |
| Forward growth estimates | ❌ Finnhub (earnings-estimates) | **NOT USED** |
| Peer PEG comparison | ⚠️ Industry metrics | **CAN CALCULATE** |

**Recommendation:**
- ✅ **Add PEG analysis section**
- ✅ **Compare P/E to peers with similar growth**
- ✅ **Use forward estimates for forward PEG**

---

## 📝 PRIORITY DATA TO ADD

### **Tier 1: High Impact, Low Effort**
1. ✅ **Analyst price targets** (Finnhub `/stock/price-target`)
2. ✅ **Earnings calendar** (DefeatBeta `calendar()` or Finnhub)
3. ✅ **Recommendation trends** (Finnhub `/stock/recommendation`)
4. ✅ **Dividend history** (DefeatBeta `dividends()` or Finnhub)
5. ✅ **Beta** (Finnhub `/stock/metric`)

### **Tier 2: High Impact, Medium Effort**
6. ✅ **Revenue breakdown** (DefeatBeta `revenue_breakdown()`)
7. ✅ **Forward revenue estimates** (Finnhub `/stock/revenue-estimates`)
8. ✅ **Extract product segments from SEC filings**
9. ✅ **Categorize SEC risks** (geopolitical, supply chain, etc.)
10. ✅ **Extract forward guidance from SEC MD&A**

### **Tier 3: Medium Impact, Medium Effort**
11. ⚠️ **Insider transactions** (Finnhub `/stock/insider-transactions`)
12. ⚠️ **Institutional ownership** (Finnhub `/stock/institutional-ownership`)
13. ⚠️ **Historical EPS** (DefeatBeta `earnings()`)
14. ⚠️ **Shares outstanding trend** (DefeatBeta `shares()`)
15. ⚠️ **Extract segment performance from SEC MD&A**

### **Tier 4: Lower Priority**
16. ⚠️ **Company officers** (DefeatBeta `officers()`)
17. ⚠️ **Social sentiment** (Finnhub `/stock/social-sentiment`)
18. ⚠️ **Technical indicators** (Finnhub `/indicator`)
19. ⚠️ **Similar stocks** (Finnhub `/stock/peers`)

---

## 🚀 Next Steps

1. **Enhance SEC filing extraction** - Add product segments, forward guidance, risk categorization
2. **Add Finnhub endpoints** - Price targets, analyst ratings, earnings calendar
3. **Add DefeatBeta data** - Revenue breakdown, dividends, calendar
4. **Update research report prompt** - Include new data sections
5. **Update TypeScript types** - Add new data structures

**Estimated effort:** 2-3 days for Tier 1 + Tier 2 (core improvements)
