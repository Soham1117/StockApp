# Testing Guide - Comprehensive Analysis Integration

## ✅ Integration Status: COMPLETE

All components are integrated and ready to test. The comprehensive analysis system (DCF valuation, factor scores, investment signals) is now part of your research reports.

---

## 🧪 How to Test

### 1. Start Both Servers

**Terminal 1 - FastAPI Backend:**
```powershell
cd "d:\Personal Projects\StockApp\fastapi_app"
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

**Terminal 2 - Next.js Frontend:**
```powershell
cd "d:\Personal Projects\StockApp"
npm run dev
```

### 2. Test Comprehensive Analysis Endpoint (Optional)

**Check if analysis endpoint works independently:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/analysis/comprehensive" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"symbols":["AAPL"]}'
```

**Expected output:**
```json
{
  "analysis": [{
    "symbol": "AAPL",
    "dcf_valuation": {
      "intrinsic_value_per_share": 183.28,
      "upside_downside_pct": -5.0,
      "rating": "fairly_valued"
    },
    "factor_scores": {
      "composite": {"composite_score": 64.2, "interpretation": "above_average"},
      "valuation": {"score": 45, "interpretation": "average"}
    },
    "investment_signal": {
      "signal": "WATCHLIST",
      "confidence": "MEDIUM",
      "positive_reasons": [...],
      "negative_reasons": [...]
    }
  }]
}
```

### 3. Test Research Report (Main Test)

**Option A - Browser:**
```
http://localhost:3000/api/stocks/AAPL/research-report
```

**Option B - PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stocks/AAPL/research-report"
```

---

## 🎯 What to Look For in Report

### Section B: Valuation Analysis
Should **start with DCF intrinsic value**:

```markdown
## Valuation Analysis

**DCF Intrinsic Value: $183.28 per share** (fairly valued, -5% from current price)

Key assumptions:
- WACC: 10%
- Terminal growth: 3%
- FCF margin: 25%
- Revenue growth: 8%

[Then continues with relative valuation metrics...]
```

### Section L: Investment Signal & Summary
Should **start with BUY/WATCHLIST/AVOID signal**:

```markdown
## Investment Signal & Integrated Summary

**WATCHLIST** (MEDIUM confidence) — This stock shows mixed signals requiring further analysis.

**Systematic Analysis:**
- Composite Factor Score: 64.2/100 (above average)
- Quality: 82/100 (excellent profitability)
- Growth: 58/100 (above average)
- Valuation: 45/100 (average, slightly elevated multiples)
- Risk: 71/100 (strong balance sheet)

**Positive Factors:**
- Strong profitability and returns on capital
- Above-average revenue and earnings growth

**Concerns:**
- Trading at premium multiples vs peers
- Valuation may limit upside

[Then continues with investment thesis...]
```

---

## 🔍 Troubleshooting

### If DCF/Signal NOT showing in report:

**1. Check comprehensive analysis is fetched:**
Look for this in Next.js terminal:
```
[Research Report] Fetching comprehensive analysis for AAPL...
```

**2. Check for warnings:**
```
[Research Report] Failed to fetch comprehensive analysis for AAPL: [error]
```

**3. Verify FastAPI endpoint is running:**
```powershell
# Should return 200 OK
Invoke-WebRequest -Uri "http://localhost:8000/analysis/comprehensive" -Method POST -ContentType "application/json" -Body '{"symbols":["AAPL"]}'
```

**4. Check if data is available:**
Some stocks may return null DCF if DefeatBeta lacks revenue/FCF data. Try different symbols:
- MSFT (Microsoft)
- GOOGL (Google)
- NVDA (Nvidia)

### If analysis returns "insufficient_data":

**Expected for now** - Factor scores need peer data integration:
```json
{
  "valuation": {"score": null, "interpretation": "insufficient_data"},
  "quality": {"score": null, "interpretation": "insufficient_data"}
}
```

**This is OK** - The report will still include DCF and investment signal if available.

---

## 📊 Expected Behavior

### Scenario 1: Full Data Available
- ✅ DCF intrinsic value calculated
- ✅ Factor scores computed (when peers implemented)
- ✅ BUY_CANDIDATE/WATCHLIST/AVOID signal generated
- ✅ Report includes all analysis in Sections B & L

### Scenario 2: Partial Data Available
- ✅ DCF may be null (if no revenue/FCF data)
- ⚠️ Factor scores show "insufficient_data" (no peers yet)
- ✅ Investment signal still generated from available data
- ✅ Report degrades gracefully, shows what's available

### Scenario 3: No Data Available
- ❌ DCF is null
- ❌ Factor scores are null
- ❌ Investment signal is "INSUFFICIENT_DATA"
- ✅ Report generates **without** comprehensive analysis section
- ✅ Falls back to original report format

---

## 🎉 Success Criteria

Your integration is working if:

1. ✅ Research report API call completes without errors
2. ✅ Report includes "DCF Intrinsic Value: $X.XX per share" in valuation section
3. ✅ Report includes "**WATCHLIST**" or "**BUY_CANDIDATE**" or "**AVOID**" in summary
4. ✅ Report lists "Positive Factors:" and "Concerns:" from investment signal
5. ✅ Report references factor scores (e.g., "Composite score: 64.2/100")

---

## 🚀 Next Steps After Testing

Once you confirm the integration works:

1. **Fix Peer Data** - Implement peer fetching for accurate factor scores
   - Currently: Empty peer lists → "insufficient_data"
   - Goal: Fetch all stocks in same industry for percentile ranking

2. **Integrate Sentiment** - Add news sentiment analysis to endpoint
   - Already have FinBERT model loaded
   - Need to call `analyze_news_sentiment_batch()` on news articles

3. **Add Momentum** - Calculate 1M/3M/6M returns for momentum factor
   - Need price history data source

4. **Add Caching** - Cache analysis results for 24 hours
   - Reduce API calls and improve performance

---

## 📝 Files to Monitor During Testing

**Backend Logs (FastAPI Terminal):**
```
INFO:     127.0.0.1:XXXXX - "POST /analysis/comprehensive HTTP/1.1" 200 OK
```

**Frontend Logs (Next.js Terminal):**
```
[Research Report] Fetching comprehensive analysis for AAPL...
[Research Report] Comprehensive analysis included: true
```

**Browser DevTools (if testing in browser):**
- Network tab: Check `/api/stocks/AAPL/research-report` returns 200
- Response preview: Verify `reportText` includes DCF and signal

---

## 🎓 Understanding the Output

### DCF Rating Meanings:
- **undervalued**: >20% upside from intrinsic value
- **fairly_valued**: -20% to +20% from intrinsic value
- **overvalued**: >20% downside from intrinsic value

### Investment Signal Meanings:
- **BUY_CANDIDATE**: Attractive valuation + strong fundamentals + low risk
- **WATCHLIST**: Mixed signals, requires monitoring
- **AVOID**: Overvalued or weak fundamentals or excessive risk

### Factor Score Interpretations:
- **75-100**: Excellent (top quartile)
- **60-74**: Above average
- **40-59**: Average
- **25-39**: Below average
- **0-24**: Poor (bottom quartile)

### Confidence Levels:
- **VERY_HIGH**: All factors strongly aligned
- **HIGH**: Most factors aligned
- **MEDIUM_HIGH / MEDIUM / MEDIUM_LOW**: Mixed signals
- **LOW**: Insufficient data

---

## 🐛 Known Issues (Expected)

1. **Peer data missing** - Factor scores show "insufficient_data"
   - **Status**: Expected, peer fetching not implemented yet
   - **Impact**: Factor scores won't rank vs industry

2. **Sentiment not integrated** - Sentiment factor always null
   - **Status**: Expected, sentiment analysis not called in endpoint
   - **Impact**: Sentiment factor not contributing to composite score

3. **Momentum not calculated** - Momentum factor always null
   - **Status**: Expected, no price history data source
   - **Impact**: Momentum factor not contributing to composite score

4. **Some stocks return null DCF** - DefeatBeta may not have data
   - **Status**: Expected, data availability varies
   - **Impact**: DCF won't show for all stocks

**All of these are documented and will be fixed in future enhancements.**

---

## ✅ Summary

Your comprehensive analysis system is **fully integrated** and ready to test. The investment signals (BUY_CANDIDATE/WATCHLIST/AVOID) are now part of your research reports, combining DCF valuation, factor scores, and systematic reasoning into a narrative that the LLM generates.

**Test now with:**
```powershell
# Start servers, then:
Invoke-RestMethod -Uri "http://localhost:3000/api/stocks/AAPL/research-report"
```

**Look for DCF value and WATCHLIST/BUY/AVOID signal in the report text!**
