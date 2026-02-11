"""
Enhanced ETF price fetcher for RRG historical analysis.
Fetches up to 20 years of daily ETF prices from Yahoo Finance.

Run from project root:
  python scripts/fetch_etf_prices_extended.py

Dependencies:
  pip install yfinance pandas
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import yfinance as yf


# Project root = parent of this scripts/ directory
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ETF_PRICES_PATH = DATA_DIR / "etf-prices.json"
ETF_METADATA_PATH = DATA_DIR / "etf-prices-metadata.json"


# Benchmark + GICS sector ETFs
ETF_SYMBOLS: List[str] = [
    # Benchmark
    "SPY",
    # GICS sectors (SPDR)
    "XLK",  # Information Technology
    "XLF",  # Financials
    "XLY",  # Consumer Discretionary
    "XLP",  # Consumer Staples
    "XLI",  # Industrials
    "XLE",  # Energy
    "XLV",  # Health Care
    "XLB",  # Materials
    "XLU",  # Utilities
    "XLC",  # Communication Services
    "IYR",  # Real Estate
]


def fetch_history(
    symbol: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    max_years: int = 20,
) -> tuple[List[Dict], Dict]:
    """
    Fetch daily history from Yahoo Finance for a single ETF.
    
    Args:
        symbol: ETF ticker symbol
        start_date: Start date in YYYY-MM-DD format (optional)
        end_date: End date in YYYY-MM-DD format (optional, defaults to today)
        max_years: Maximum years to fetch (default: 20)
    
    Returns:
        Tuple of (records, metadata)
        records: List of {date, adj_close} dicts
        metadata: Dict with first_date, last_date, total_days, data_quality info
    """
    ticker = yf.Ticker(symbol)
    
    # Calculate date range
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    
    if start_date is None:
        # Fetch max_years back from end_date
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        start_dt = end_dt - timedelta(days=max_years * 365)
        start_date = start_dt.strftime("%Y-%m-%d")
    
    print(f"[etf-fetch] Fetching {symbol} from {start_date} to {end_date}...")
    
    try:
        # Try fetching with date range first (more reliable)
        df = ticker.history(start=start_date, end=end_date, interval="1d", auto_adjust=False)
        
        # Fallback: if date range fails, try period-based fetch
        if df is None or df.empty:
            print(f"[etf-fetch] Date range failed for {symbol}, trying period='max'...")
            df = ticker.history(period="max", interval="1d", auto_adjust=False)
    except Exception as e:
        print(f"[etf-fetch] Error fetching {symbol}: {e}")
        # Fallback to period-based
        try:
            df = ticker.history(period="max", interval="1d", auto_adjust=False)
        except Exception as e2:
            print(f"[etf-fetch] Period fetch also failed for {symbol}: {e2}")
            return [], {
                "symbol": symbol,
                "error": str(e2),
                "first_date": None,
                "last_date": None,
                "total_days": 0,
                "data_quality": "failed",
            }

    if df is None or df.empty:
        print(f"[etf-fetch] WARNING: no data returned for {symbol}")
        return [], {
            "symbol": symbol,
            "error": "No data returned",
            "first_date": None,
            "last_date": None,
            "total_days": 0,
            "data_quality": "empty",
        }

    # Prefer Adj Close if available, else Close
    if "Adj Close" in df.columns:
        price_col = "Adj Close"
    elif "Close" in df.columns:
        price_col = "Close"
    else:
        print(f"[etf-fetch] WARNING: no Close/Adj Close column for {symbol}")
        return [], {
            "symbol": symbol,
            "error": "No price column found",
            "first_date": None,
            "last_date": None,
            "total_days": 0,
            "data_quality": "no_price_column",
        }

    records: List[Dict] = []
    dates_seen = set()
    
    for idx, row in df.iterrows():
        try:
            # Handle pandas Timestamp
            if hasattr(idx, "to_pydatetime"):
                dt = idx.to_pydatetime()
            elif hasattr(idx, "date"):
                dt = datetime.combine(idx.date(), datetime.min.time())
            else:
                dt = datetime.fromisoformat(str(idx))
            
            date_str = dt.strftime("%Y-%m-%d")
            
            # Skip duplicates (can happen with timezone issues)
            if date_str in dates_seen:
                continue
            dates_seen.add(date_str)
            
            price_val = row.get(price_col)
            if price_val is None:
                continue
            
            try:
                price_float = float(price_val)
            except (TypeError, ValueError):
                continue
            
            # Skip NaN and invalid values
            if not (price_float == price_float) or price_float <= 0:
                continue
            
            records.append({
                "date": date_str,
                "adj_close": price_float,
            })
        except Exception as e:
            print(f"[etf-fetch] Error processing row for {symbol}: {e}")
            continue

    # Sort by date
    records.sort(key=lambda x: x["date"])
    
    # Build metadata
    metadata = {
        "symbol": symbol,
        "first_date": records[0]["date"] if records else None,
        "last_date": records[-1]["date"] if records else None,
        "total_days": len(records),
        "data_quality": "good" if len(records) > 100 else "sparse",
        "fetched_at": datetime.now().isoformat(),
    }
    
    # Check for data gaps (missing >5 consecutive trading days)
    if len(records) > 5:
        gaps = []
        for i in range(1, len(records)):
            prev_date = datetime.strptime(records[i-1]["date"], "%Y-%m-%d")
            curr_date = datetime.strptime(records[i]["date"], "%Y-%m-%d")
            days_diff = (curr_date - prev_date).days
            if days_diff > 5:  # More than 5 days gap (allows weekends + holidays)
                gaps.append({
                    "from": records[i-1]["date"],
                    "to": records[i]["date"],
                    "days": days_diff,
                })
        if gaps:
            metadata["gaps"] = gaps[:10]  # Store first 10 gaps
            metadata["data_quality"] = "gaps_detected"
    
    print(f"[etf-fetch] {symbol}: {len(records)} daily points ({metadata['first_date']} to {metadata['last_date']})")
    
    return records, metadata


def load_existing_data() -> tuple[Dict[str, List[Dict]], Dict[str, Dict]]:
    """Load existing ETF prices and metadata if they exist."""
    prices_data: Dict[str, List[Dict]] = {}
    metadata: Dict[str, Dict] = {}
    
    if ETF_PRICES_PATH.exists():
        try:
            prices_data = json.loads(ETF_PRICES_PATH.read_text(encoding="utf-8"))
            print(f"[etf-fetch] Loaded existing data for {len(prices_data)} ETFs")
        except Exception as e:
            print(f"[etf-fetch] Error loading existing prices: {e}")
    
    if ETF_METADATA_PATH.exists():
        try:
            metadata = json.loads(ETF_METADATA_PATH.read_text(encoding="utf-8"))
            print(f"[etf-fetch] Loaded existing metadata for {len(metadata)} ETFs")
        except Exception as e:
            print(f"[etf-fetch] Error loading existing metadata: {e}")
    
    return prices_data, metadata


def merge_records(existing: List[Dict], new: List[Dict]) -> List[Dict]:
    """Merge existing and new records, removing duplicates and sorting."""
    # Create a map of date -> record
    merged_map: Dict[str, Dict] = {}
    
    # Add existing records
    for rec in existing:
        merged_map[rec["date"]] = rec
    
    # Add/update with new records (new takes precedence)
    for rec in new:
        merged_map[rec["date"]] = rec
    
    # Convert back to sorted list
    merged = list(merged_map.values())
    merged.sort(key=lambda x: x["date"])
    
    return merged


def main(incremental: bool = True) -> None:
    """
    Main function to fetch ETF prices.
    
    Args:
        incremental: If True, merge with existing data. If False, replace all.
    """
    print("[etf-fetch] Starting enhanced ETF price fetch...")
    print(f"[etf-fetch] Target: {len(ETF_SYMBOLS)} ETFs, up to 20 years of data")
    
    # Load existing data if incremental
    existing_prices, existing_metadata = load_existing_data() if incremental else ({}, {})
    
    all_data: Dict[str, List[Dict]] = {}
    all_metadata: Dict[str, Dict] = {}
    
    for sym in ETF_SYMBOLS:
        try:
            # Determine date range for incremental update
            start_date = None
            if incremental and sym in existing_prices and existing_prices[sym]:
                # Start from day after last existing date
                last_date = existing_prices[sym][-1]["date"]
                last_dt = datetime.strptime(last_date, "%Y-%m-%d")
                start_date = (last_dt + timedelta(days=1)).strftime("%Y-%m-%d")
                print(f"[etf-fetch] Incremental update for {sym} starting from {start_date}")
            
            records, metadata = fetch_history(sym, start_date=start_date, max_years=20)
            
            if records:
                if incremental and sym in existing_prices:
                    # Merge with existing
                    all_data[sym] = merge_records(existing_prices[sym], records)
                    print(f"[etf-fetch] Merged {sym}: {len(existing_prices[sym])} existing + {len(records)} new = {len(all_data[sym])} total")
                else:
                    all_data[sym] = records
                
                all_metadata[sym] = metadata
            else:
                # Keep existing data if fetch failed
                if incremental and sym in existing_prices:
                    all_data[sym] = existing_prices[sym]
                    all_metadata[sym] = existing_metadata.get(sym, metadata)
                    print(f"[etf-fetch] Keeping existing data for {sym} ({len(existing_prices[sym])} records)")
                else:
                    all_metadata[sym] = metadata
                    print(f"[etf-fetch] No data for {sym}, skipping")
                    
        except Exception as exc:
            print(f"[etf-fetch] ERROR fetching {sym}: {exc}")
            # Keep existing data on error if incremental
            if incremental and sym in existing_prices:
                all_data[sym] = existing_prices[sym]
                all_metadata[sym] = existing_metadata.get(sym, {})
                print(f"[etf-fetch] Error for {sym}, keeping existing data")

    if not all_data:
        print("[etf-fetch] No data fetched for any ETF. Not writing file.")
        return

    # Write prices data
    ETF_PRICES_PATH.write_text(
        json.dumps(all_data, indent=2, sort_keys=True), 
        encoding="utf-8"
    )
    print(f"[etf-fetch] ✓ Wrote prices for {len(all_data)} ETFs to {ETF_PRICES_PATH}")
    
    # Write metadata
    ETF_METADATA_PATH.write_text(
        json.dumps(all_metadata, indent=2, sort_keys=True),
        encoding="utf-8"
    )
    print(f"[etf-fetch] ✓ Wrote metadata for {len(all_metadata)} ETFs to {ETF_METADATA_PATH}")
    
    # Print summary
    print("\n[etf-fetch] Summary:")
    for sym, meta in sorted(all_metadata.items()):
        if meta.get("total_days", 0) > 0:
            years = meta["total_days"] / 365.25
            print(f"  {sym:4s}: {meta['total_days']:5d} days ({years:.1f} years) - {meta.get('first_date')} to {meta.get('last_date')}")
        else:
            print(f"  {sym:4s}: No data - {meta.get('error', 'unknown error')}")


if __name__ == "__main__":
    import sys
    
    # Check for --full flag to replace all data
    incremental = "--full" not in sys.argv
    
    if not incremental:
        print("[etf-fetch] Running in FULL mode (will replace all existing data)")
    else:
        print("[etf-fetch] Running in INCREMENTAL mode (will merge with existing data)")
    
    main(incremental=incremental)

