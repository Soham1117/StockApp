#!/usr/bin/env python3
"""
Script to get Price-to-Sales (P/S) ratio for ticker(s) using defeatbeta_api.

Usage:
    python scripts/get-ps-ratio.py AAPL
    python scripts/get-ps-ratio.py AAPL MSFT NVDA
    python scripts/get-ps-ratio.py --fastapi http://localhost:8000 AAPL MSFT
"""

import argparse
import sys
from typing import Optional

# Try to import defeatbeta_api (optional if using FastAPI)
try:
    from defeatbeta_api.data.ticker import Ticker
    HAS_DEFEATBETA = True
except ImportError:
    HAS_DEFEATBETA = False


def get_ps_ratio_direct(ticker_symbol: str) -> Optional[float]:
    """
    Get P/S ratio directly from defeatbeta_api.
    """
    if not HAS_DEFEATBETA:
        print("ERROR: defeatbeta_api not installed. Use --fastapi option instead.")
        return None
    
    try:
        t = Ticker(ticker_symbol)
        ps_df = t.ps_ratio()
        
        if ps_df is not None and not ps_df.empty:
            # Get the latest P/S ratio (last row)
            latest_ps = ps_df.iloc[-1]
            
            # Check common column names
            for col in ["ps_ratio", "price_to_sales", "ps", "price_to_sales_ratio"]:
                if col in latest_ps.index:
                    value = latest_ps[col]
                    if value is not None and not (isinstance(value, float) and (value != value or not value)):  # Check for NaN
                        return float(value)
            
            # If no specific column found, try first numeric column
            for col in ps_df.columns:
                value = latest_ps[col]
                if isinstance(value, (int, float)) and value == value:  # Not NaN
                    return float(value)
        
        return None
    except Exception as e:
        print(f"ERROR: Failed to get P/S ratio for {ticker_symbol}: {e}")
        return None


def get_ps_ratio_via_fastapi(fastapi_url: str, ticker_symbol: str) -> Optional[float]:
    """
    Get P/S ratio via FastAPI /metrics endpoint.
    """
    import requests
    from urllib.parse import urljoin
    
    try:
        response = requests.post(
            urljoin(fastapi_url, "/metrics"),
            json={"symbols": [ticker_symbol]},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        
        metrics = data.get("metrics", [])
        if metrics and len(metrics) > 0:
            metric_data = metrics[0]
            ps_ratio = metric_data.get("priceToSalesRatioTTM")
            
            # Debug output for TSLA
            if ticker_symbol.upper() == "TSLA":
                print(f"\n[DEBUG] Full response for {ticker_symbol}:")
                import json
                print(json.dumps(metric_data, indent=2, default=str))
            
            if ps_ratio is not None:
                return float(ps_ratio)
        
        return None
    except Exception as e:
        print(f"ERROR: Failed to get P/S ratio via FastAPI for {ticker_symbol}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    parser = argparse.ArgumentParser(description="Get P/S ratio for ticker(s)")
    parser.add_argument(
        "tickers",
        nargs="+",
        help="One or more ticker symbols (e.g., AAPL MSFT NVDA)",
    )
    parser.add_argument(
        "--fastapi",
        help="Use FastAPI endpoint instead of direct defeatbeta queries (e.g., http://localhost:8000)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed information",
    )
    
    args = parser.parse_args()
    
    results = []
    
    for ticker in args.tickers:
        symbol = ticker.strip().upper()
        
        if args.fastapi:
            ps_ratio = get_ps_ratio_via_fastapi(args.fastapi, symbol)
        else:
            ps_ratio = get_ps_ratio_direct(symbol)
        
        if ps_ratio is not None:
            results.append({"symbol": symbol, "ps_ratio": ps_ratio})
            print(f"{symbol}: {ps_ratio:.2f}")
        else:
            results.append({"symbol": symbol, "ps_ratio": None})
            print(f"{symbol}: No P/S ratio data available")
    
    # Summary
    if len(results) > 1:
        print("\n" + "=" * 50)
        print("Summary:")
        print("=" * 50)
        valid_count = sum(1 for r in results if r["ps_ratio"] is not None)
        print(f"Found P/S ratios for {valid_count}/{len(results)} tickers")
        
        if valid_count > 0:
            avg_ps = sum(r["ps_ratio"] for r in results if r["ps_ratio"] is not None) / valid_count
            print(f"Average P/S ratio: {avg_ps:.2f}")


if __name__ == "__main__":
    main()

