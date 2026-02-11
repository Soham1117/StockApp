#!/usr/bin/env python3
"""
Weekly batch script to generate ticker-universe.json and sector-stocks.json
from stocks.json using live defeatbeta market caps.

Run this weekly after defeatbeta updates:
    python scripts/generate-universe.py

Requires:
    - stocks.json in project root
    - FastAPI running at FASTAPI_BASE_URL (or set via env var)
    - Outputs to data/ticker-universe.json and data/sector-stocks.json
"""

import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

# Fix Windows console encoding for Unicode characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
        # After reconfiguration, check if UTF-8 is actually available
        use_unicode = True
    except Exception:
        use_unicode = False
else:
    # On non-Windows, try to detect UTF-8 support
    try:
        use_unicode = sys.stdout.encoding and "utf" in sys.stdout.encoding.lower()
    except Exception:
        use_unicode = False

# ASCII-safe symbols for cross-platform compatibility
CHECK_MARK = "✓" if use_unicode else "[OK]"
CROSS_MARK = "✗" if use_unicode else "[ERROR]"


# Configuration
STOCKS_JSON_PATH = "stocks.json"
FASTAPI_BASE_URL = os.getenv("FASTAPI_BASE_URL", "http://localhost:8000")
OUTPUT_DIR = "data"
TICKER_UNIVERSE_FILE = os.path.join(OUTPUT_DIR, "ticker-universe.json")
SECTOR_STOCKS_FILE = os.path.join(OUTPUT_DIR, "sector-stocks.json")

# Market cap thresholds (in dollars)
LARGE_CAP_MIN = 10_000_000_000  # $10B
MID_CAP_MIN = 2_000_000_000  # $2B
SMALL_CAP_MIN = 300_000_000  # $300M

# Batch size for FastAPI calls
BATCH_SIZE = 100

# Number of parallel workers for fetching metadata batches.
# This used to be hard-coded to 8, which was hammering the backend/Hugging Face.
# Allow overriding via env var so we can dial it down (default 3).
MAX_WORKERS = int(os.getenv("GENERATE_UNIVERSE_MAX_WORKERS", "16"))


def load_tickers_from_stocks_json() -> List[Dict[str, Any]]:
    """
    Load stocks.json and return a normalized list of tickers.

    Expected "ticker-only" format (as provided by the user):
        {
          "0": { "cik_str": 1045810, "ticker": "NVDA", "title": "NVIDIA CORP" },
          "1": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." },
          ...
        }

    For robustness we also support:
        - list[{"ticker"/"symbol", "title"/"name", ...}]
    """
    print(f"Loading {STOCKS_JSON_PATH}...")
    with open(STOCKS_JSON_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)

    rows: List[Dict[str, Any]] = []

    # New "ticker-only" JSON: dict of index -> {cik_str, ticker, title}
    if isinstance(raw, dict) and not ("data" in raw and "rows" in raw.get("data", {})):
        iterable = raw.values()
    # Fallback: legacy Nasdaq-style { data: { rows: [...] } }
    elif isinstance(raw, dict) and "data" in raw:
        iterable = raw.get("data", {}).get("rows", []) or []
    # Fallback: plain list
    elif isinstance(raw, list):
        iterable = raw
    else:
        print(f"WARNING: Unrecognized format in {STOCKS_JSON_PATH}; treating as empty.")
        iterable = []

    for entry in iterable:
        if not isinstance(entry, dict):
            continue

        symbol = (entry.get("ticker") or entry.get("symbol") or "").strip().upper()
        if not symbol:
            continue

        title = (entry.get("title") or entry.get("name") or symbol).strip()
        cik = entry.get("cik_str") or entry.get("cik")

        rows.append(
            {
                "symbol": symbol,
                "companyName": title,
                "cik": cik,
            }
        )

    print(f"Loaded {len(rows)} tickers from {STOCKS_JSON_PATH}")
    return rows

def fetch_metadata_batch(
    fastapi_url: str, symbols: List[str]
) -> Dict[str, Dict[str, Optional[Any]]]:
    """
    Fetch defeatbeta metadata (industry, sector, market cap) for a batch of symbols.

    This hits the FastAPI `/metadata` endpoint, which is the single source of truth
    for industry/sector classifications and market caps.
    """
    try:
        # Increased timeout for large batches with local files
        timeout_seconds = int(os.getenv("GENERATE_UNIVERSE_TIMEOUT", "300"))  # 5 minutes default
        response = requests.post(
            urljoin(fastapi_url, "/metadata"),
            json={"symbols": symbols},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        result: Dict[str, Dict[str, Optional[Any]]] = {}
        for item in data.get("symbols", []):
            symbol = (item.get("symbol") or "").upper()
            if not symbol:
                continue

            market_cap = item.get("marketCap")
            try:
                market_cap_val: Optional[float] = float(market_cap) if market_cap is not None else None
            except (ValueError, TypeError):
                market_cap_val = None

            result[symbol] = {
                "marketCap": market_cap_val,
                "industry": item.get("industry"),
                "sector": item.get("sector"),
            }
        return result
    except Exception as e:
        print(f"WARNING: Failed to fetch metadata for batch: {e}")
        # Preserve symbol list shape with empty metadata
        return {
            s: {"marketCap": None, "industry": None, "sector": None} for s in symbols
        }


def bucket_stocks_by_market_cap(stocks: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Given a list of stocks (all from the same sector) with marketCap,
    bucket them into large/mid/small based on thresholds.
    """
    # Sort by market cap descending
    stocks_sorted = sorted(
        [s for s in stocks if s.get("marketCap") is not None],
        key=lambda x: x["marketCap"] or 0,
        reverse=True,
    )

    large: List[Dict[str, Any]] = []
    mid: List[Dict[str, Any]] = []
    small: List[Dict[str, Any]] = []

    for stock in stocks_sorted:
        cap = stock["marketCap"]
        if cap is None:
            continue
        if cap >= LARGE_CAP_MIN:
            large.append(stock)  # No limit - keep all (Option A)
        elif cap >= MID_CAP_MIN:
            mid.append(stock)  # No limit - keep all (Option A)
        elif cap >= SMALL_CAP_MIN:
            small.append(stock)  # No limit - keep all (Option A)

    # Stocks without market cap are excluded from bucketing but included in ticker-universe.json
    print(
        f"    Bucketed: {len(large)} large, {len(mid)} mid, {len(small)} small "
        f"(total {len(stocks_sorted)} with market caps, {len(stocks) - len(stocks_sorted)} without)"
    )

    return {"large": large, "mid": mid, "small": small}


def main():
    """Main generation logic."""
    print("=" * 60)
    print("Generating ticker universe and sector stocks from defeatbeta")
    print("=" * 60)

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load base ticker universe from stocks.json (ticker-only, no industries/sectors)
    base_rows = load_tickers_from_stocks_json()

    if not base_rows:
        print(f"ERROR: No tickers loaded from {STOCKS_JSON_PATH}")
        sys.exit(1)

    # Build symbol → companyName map and deduplicated symbol list
    symbol_to_name: Dict[str, str] = {}
    symbols: List[str] = []
    for row in base_rows:
        symbol = row["symbol"]
        if symbol not in symbol_to_name:
            symbol_to_name[symbol] = row.get("companyName", symbol)
            symbols.append(symbol)

    print(f"Prepared {len(symbols)} unique symbols for metadata lookup")

    # Fetch defeatbeta metadata (industry, sector, market cap) for all symbols
    # Use parallel workers to fetch batches concurrently
    all_metadata: Dict[str, Dict[str, Optional[Any]]] = {}
    batches = [symbols[i : i + BATCH_SIZE] for i in range(0, len(symbols), BATCH_SIZE)]
    total_batches = len(batches)
    
    print(f"\n{'='*70}")
    print(f"Fetching metadata for {len(symbols)} symbols")
    print(f"  Batches: {total_batches} (batch size: {BATCH_SIZE})")
    print(f"  Workers: {MAX_WORKERS}")
    print(f"{'='*70}\n")
    
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all batch jobs
        future_to_batch = {
            executor.submit(fetch_metadata_batch, FASTAPI_BASE_URL, batch): i
            for i, batch in enumerate(batches, 1)
        }
        
        # Collect results as they complete
        completed = 0
        for future in as_completed(future_to_batch):
            batch_num = future_to_batch[future]
            try:
                batch_meta = future.result()
                all_metadata.update(batch_meta)
                completed += 1
                
                # Calculate progress
                elapsed = time.time() - start_time
                percent = (completed / total_batches) * 100
                rate = len(all_metadata) / elapsed if elapsed > 0 else 0
                eta_seconds = ((total_batches - completed) * elapsed / completed) if completed > 0 else 0
                eta_minutes = eta_seconds / 60
                
                print(f"  {CHECK_MARK} Batch {batch_num:3d}/{total_batches} ({len(batch_meta):3d} symbols) | "
                      f"Progress: {percent:5.1f}% | "
                      f"Total: {len(all_metadata):5d} symbols | "
                      f"Rate: {rate:5.1f} symbols/s | "
                      f"ETA: {eta_minutes:5.1f} min")
            except Exception as e:
                print(f"  {CROSS_MARK} ERROR: Batch {batch_num} failed: {e}")
    
    total_time = time.time() - start_time
    print(f"\n{'='*70}")
    print(f"{CHECK_MARK} Fetched metadata for {len(all_metadata)} symbols in {total_time:.1f}s ({total_time/60:.1f} min)")
    print(f"  Average rate: {len(all_metadata)/total_time:.1f} symbols/s")
    print(f"{'='*70}\n")

    # Debug: Sample a few entries to see what we're getting
    if all_metadata:
        sample_symbols = list(all_metadata.keys())[:5]
        print("\nDebug: Sample metadata for first 5 symbols:")
        for sym in sample_symbols:
            meta = all_metadata[sym]
            print(f"  {sym}: industry={repr(meta.get('industry'))}, sector={repr(meta.get('sector'))}, marketCap={meta.get('marketCap')}")

    # Build sector → [stocks] using defeatbeta's sector names directly
    stocks_by_sector: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    ticker_universe: List[Dict[str, Any]] = []
    
    skipped_no_sector = 0
    skipped_no_market_cap = 0
    skipped_both = 0

    for symbol, meta in all_metadata.items():
        industry = (meta.get("industry") or "").strip()
        sector = (meta.get("sector") or "").strip() or "Unknown"
        market_cap = meta.get("marketCap")

        # Require a sector (market cap is optional for now - stocks without market cap
        # will be included in universe but skipped in bucketing)
        # Filter out "Unknown" sectors as they're not real classifications
        has_sector = sector and sector != "Unknown"
        has_market_cap = market_cap is not None
        
        if not has_sector:
            if not has_market_cap:
                skipped_both += 1
            else:
                skipped_no_sector += 1
            continue
        
        # Include stocks with valid sectors even if market cap is missing
        # (they'll be skipped in bucketing but included in ticker universe)
        if not has_market_cap:
            skipped_no_market_cap += 1
            # Still include in universe, but mark market cap as None
            market_cap = None

        company_name = symbol_to_name.get(symbol, symbol)

        stock_entry = {
            "symbol": symbol,
            "companyName": company_name,
            "marketCap": market_cap,
            "sector": sector,
            "industry": industry,
        }

        stocks_by_sector[sector].append(stock_entry)
        ticker_universe.append(
            {
                "symbol": symbol,
                "industry": industry,
                "sector": sector,
            }
        )

    print(f"\nBuilt universe with {len(ticker_universe)} tickers across {len(stocks_by_sector)} sectors")
    if skipped_no_sector > 0 or skipped_no_market_cap > 0 or skipped_both > 0:
        print(f"  Skipped: {skipped_no_sector} (no sector), {skipped_no_market_cap} (no market cap), {skipped_both} (both)")

    # Bucket stocks per sector (large/mid/small)
    print(f"\n{'='*70}")
    print(f"Bucketing stocks by market cap for {len(stocks_by_sector)} sectors...")
    print(f"{'='*70}\n")
    
    sector_stocks: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for idx, (sector_name, stocks) in enumerate(sorted(stocks_by_sector.items()), 1):
        print(f"[{idx:2d}/{len(stocks_by_sector)}] Processing sector '{sector_name}' ({len(stocks)} stocks)")
        sector_stocks[sector_name] = bucket_stocks_by_market_cap(stocks)

    # Build ticker-universe.json lists straight from defeatbeta-derived data
    unique_sectors = sorted(stocks_by_sector.keys())
    unique_industries = sorted(
        {
            t["industry"]
            for t in ticker_universe
            if t.get("industry") and t["industry"] != "Unknown"
        }
    )

    ticker_universe_data = {
        "industries": unique_industries,
        "sectors": unique_sectors,
        "tickers": ticker_universe,
        "generated_at": None,  # Will be set by Next.js if needed
    }

    # Write files
    print(f"\nWriting {TICKER_UNIVERSE_FILE}...")
    with open(TICKER_UNIVERSE_FILE, "w", encoding="utf-8") as f:
        json.dump(ticker_universe_data, f, indent=2, ensure_ascii=False)

    print(f"Writing {SECTOR_STOCKS_FILE}...")
    with open(SECTOR_STOCKS_FILE, "w", encoding="utf-8") as f:
        json.dump(sector_stocks, f, indent=2, ensure_ascii=False)

        # Calculate totals
        total_stocks_in_buckets = sum(
            len(buckets.get("large", [])) + len(buckets.get("mid", [])) + len(buckets.get("small", []))
            for buckets in sector_stocks.values()
        )
        
        print("\n" + "=" * 70)
        print(f"{CHECK_MARK} GENERATION COMPLETE!")
        print("=" * 70)
        print(f"  Industries:     {len(unique_industries):5d}")
        print(f"  Sectors:        {len(unique_sectors):5d}")
        print(f"  Total Tickers: {len(ticker_universe):5d}")
        print(f"  Stocks Bucketed: {total_stocks_in_buckets:5d} (across all sectors)")
        print(f"  Sectors with stocks: {len(sector_stocks):5d}")
        print("=" * 70)
        print(f"\n{CHECK_MARK} Files written:")
        print(f"  - {TICKER_UNIVERSE_FILE}")
        print(f"  - {SECTOR_STOCKS_FILE}")
        print()


if __name__ == "__main__":
    main()

