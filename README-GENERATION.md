# Data Generation Guide

This project uses **pre-computed data files** that are regenerated weekly when defeatbeta updates.

## Generated Files

Two JSON files are generated in the `data/` directory:

1. **`ticker-universe.json`**: Contains all tickers with their defeatbeta industry/sector classifications
2. **`sector-stocks.json`**: Pre-computed top 30 stocks per sector (10 large-cap, 10 mid-cap, 10 small-cap)

## Weekly Generation Process

### Prerequisites

1. **FastAPI service running**: The generation script queries your FastAPI service for live market caps
2. **Python dependencies**: Install required packages:
   ```bash
   pip install requests
   ```
3. **Environment variable** (optional): Set `FASTAPI_BASE_URL` if FastAPI is not at `http://localhost:8000`

### Running the Generation Script

```bash
# Make sure FastAPI is running first
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000

# In another terminal, run the generation script
python scripts/generate-universe.py
```

The script will:
1. Load `stocks.json` (ticker-only format)
2. Query defeatbeta via FastAPI to get:
   - Distinct sectors (11 total)
   - Industry classifications for each ticker
   - Live market caps for all stocks
3. Group stocks by sector (defeatbeta is the single source of truth)
4. Bucket stocks into large/mid/small cap (top 10 each = 30 per sector)
5. Write `data/ticker-universe.json` and `data/sector-stocks.json`

### Output Files

#### `data/ticker-universe.json`
```json
{
  "industries": ["Software", "Semiconductors", ...],
  "sectors": ["Technology", "Healthcare", ...],
  "tickers": [
    {
      "symbol": "AAPL",
      "industry": "Consumer Electronics",
      "sector": "Technology"
    },
    ...
  ]
}
```

#### `data/sector-stocks.json`
```json
{
  "Technology": {
    "large": [{ "symbol": "MSFT", "companyName": "...", "marketCap": 3000000000000, ... }],
    "mid": [...],
    "small": [...]
  },
  "Healthcare": {
    "large": [...],
    "mid": [...],
    "small": [...]
  },
  ...
}
```

## Sector-Based Grouping

The script groups stocks by **sector** (11 sectors total) using defeatbeta as the single source of truth:

- Each ticker's sector comes directly from `defeatbeta_api.Ticker.info()['sector']`
- No fuzzy matching needed - defeatbeta provides authoritative sector classifications
- Stocks are bucketed by market cap within each sector
- The dropdown shows **defeatbeta sector names** (which update weekly)

## Troubleshooting

### "Failed to fetch defeatbeta industries"
- Ensure FastAPI is running at `FASTAPI_BASE_URL`
- Check that defeatbeta-api is properly installed in FastAPI environment

### "Sector not found"
- The sector name doesn't match any defeatbeta sector
- Check `/api/meta/industries` endpoint to see available sectors
- Ensure you're using exact sector names from defeatbeta (case-sensitive)

### Missing market caps
- Stocks without market caps in defeatbeta are **skipped** (as per requirement)
- This is normal for delisted or very new tickers
- Market cap is retrieved from `Ticker.summary()['market_cap']` - if this fails, check FastAPI logs

## Next.js Integration

The Next.js API routes automatically load these generated files:

- `/api/meta/industries` → reads `ticker-universe.json` (returns sectors and industries)
- `/api/sector/[sector]/stocks` → reads `sector-stocks.json`
- `/api/sector/[sector]/metrics` → fetches metrics for stocks in a sector
- `/api/stocks/search` → reads `ticker-universe.json` (optionally enriches with live data)

If files are missing, you'll get a 500 error with instructions to run the generation script.

