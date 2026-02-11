#!/usr/bin/env python3
"""
Script to get all distinct sectors from defeatbeta_api.

This queries defeatbeta for sectors across all tickers in stocks.json,
or you can specify a different ticker source.

Usage:
    python scripts/get-all-sectors.py
    python scripts/get-all-sectors.py --sample 1000  # Sample first 1000 tickers
    python scripts/get-all-sectors.py --fastapi http://localhost:8000  # Use FastAPI endpoint
"""

import argparse
import json
import os
import sys
from typing import Set


def get_sectors_from_tickers(tickers: list[str], sample: int = None) -> Set[str]:
    """
    Get all distinct sectors by querying defeatbeta for each ticker.
    
    NOTE: This requires defeatbeta_api to be installed. For faster results,
    use --fastapi option instead.
    
    Args:
        tickers: List of ticker symbols
        sample: If provided, only process first N tickers
    
    Returns:
        Set of distinct sector names
    """
    # Import here to avoid import errors when using FastAPI mode
    try:
        from defeatbeta_api.data.ticker import Ticker
    except ImportError as e:
        print(f"ERROR: defeatbeta_api not available. Use --fastapi option instead.")
        print(f"Import error: {e}")
        sys.exit(1)
    
    sectors: Set[str] = set()
    
    tickers_to_process = tickers[:sample] if sample else tickers
    total = len(tickers_to_process)
    
    print(f"Processing {total} tickers to discover sectors...")
    
    for i, symbol in enumerate(tickers_to_process, 1):
        try:
            t = Ticker(symbol)
            info_df = t.info()
            
            if info_df is not None and not info_df.empty:
                sector = info_df.iloc[0].get("sector")
                if isinstance(sector, str) and sector.strip():
                    sectors.add(sector.strip())
            
            if i % 100 == 0:
                print(f"  Processed {i}/{total} tickers, found {len(sectors)} unique sectors...")
                
        except Exception as e:
            # Silently skip errors
            continue
    
    return sectors


def get_sectors_via_fastapi(fastapi_url: str, tickers: list[str]) -> Set[str]:
    """
    Get sectors using FastAPI /industries endpoint (faster, uses parallel processing).
    
    Args:
        fastapi_url: Base URL of FastAPI service
        tickers: List of ticker symbols
    
    Returns:
        Set of distinct sector names
    """
    import requests
    from urllib.parse import urljoin
    
    print(f"Querying FastAPI at {fastapi_url} for sectors from {len(tickers)} tickers...")
    
    try:
        response = requests.post(
            urljoin(fastapi_url, "/industries"),
            json={"symbols": tickers},
            timeout=300,  # 5 minute timeout for large lists
        )
        response.raise_for_status()
        data = response.json()
        sectors = set(data.get("sectors", []))
        return sectors
    except Exception as e:
        print(f"ERROR: Failed to query FastAPI: {e}")
        return set()


def load_tickers_from_stocks_json(stocks_json_path: str = "stocks.json") -> list[str]:
    """Load ticker symbols from stocks.json."""
    print(f"Loading tickers from {stocks_json_path}...")
    
    with open(stocks_json_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    
    tickers: list[str] = []
    
    # Handle different JSON formats
    if isinstance(raw, dict) and not ("data" in raw and "rows" in raw.get("data", {})):
        iterable = raw.values()
    elif isinstance(raw, dict) and "data" in raw:
        iterable = raw.get("data", {}).get("rows", []) or []
    elif isinstance(raw, list):
        iterable = raw
    else:
        print(f"ERROR: Unrecognized format in {stocks_json_path}")
        return []
    
    seen = set()
    for entry in iterable:
        if not isinstance(entry, dict):
            continue
        
        symbol = (entry.get("ticker") or entry.get("symbol") or "").strip().upper()
        if symbol and symbol not in seen:
            tickers.append(symbol)
            seen.add(symbol)
    
    print(f"Loaded {len(tickers)} unique tickers")
    return tickers


def main():
    parser = argparse.ArgumentParser(description="Get all distinct sectors from defeatbeta")
    parser.add_argument(
        "--stocks-json",
        default="stocks.json",
        help="Path to stocks.json file (default: stocks.json)",
    )
    parser.add_argument(
        "--sample",
        type=int,
        help="Sample only first N tickers (faster for testing)",
    )
    parser.add_argument(
        "--fastapi",
        help="Use FastAPI endpoint instead of direct defeatbeta queries (e.g., http://localhost:8000)",
    )
    parser.add_argument(
        "--output",
        help="Output file path (default: print to stdout)",
    )
    
    args = parser.parse_args()
    
    # Load tickers
    tickers = load_tickers_from_stocks_json(args.stocks_json)
    if not tickers:
        print("ERROR: No tickers loaded")
        sys.exit(1)
    
    # Get sectors
    if args.fastapi:
        sectors = get_sectors_via_fastapi(args.fastapi, tickers)
    else:
        sectors = get_sectors_from_tickers(tickers, sample=args.sample)
    
    # Sort sectors
    sectors_sorted = sorted(sectors)
    
    # Output results
    output_data = {
        "sectors": sectors_sorted,
        "count": len(sectors_sorted),
        "tickers_processed": len(tickers) if not args.sample else min(args.sample, len(tickers)),
    }
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"\n✓ Saved {len(sectors_sorted)} sectors to {args.output}")
    else:
        print("\n" + "=" * 60)
        print(f"Found {len(sectors_sorted)} distinct sectors:")
        print("=" * 60)
        for sector in sectors_sorted:
            print(f"  - {sector}")
        print("=" * 60)
        print(f"\nTotal: {len(sectors_sorted)} sectors")
    
    return sectors_sorted


if __name__ == "__main__":
    main()

