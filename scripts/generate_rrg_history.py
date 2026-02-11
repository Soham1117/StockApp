"""
Generate historical RRG data for all sector ETFs.
Pre-computes RRG data points at weekly intervals going back up to 20 years.

Run from project root:
  python scripts/generate_rrg_history.py

This script:
1. Loads ETF prices from data/etf-prices.json
2. Calculates RRG for each sector at weekly intervals
3. Supports multiple lookback periods (90d, 180d, 360d, etc.)
4. Stores results in data/rrg-history.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

# Add project root to Python path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi_app.rrg_history import (
    calculate_rrg_for_date,
    generate_weekly_dates,
    generate_monthly_dates,
)


# Project root (already set above for sys.path)
DATA_DIR = PROJECT_ROOT / "data"
ETF_PRICES_PATH = DATA_DIR / "etf-prices.json"
RRG_HISTORY_PATH = DATA_DIR / "rrg-history.json"

# Sector ETFs (excluding benchmark SPY)
SECTOR_ETFS = [
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

BENCHMARK = "SPY"

# Lookback periods to calculate (in days)
LOOKBACK_PERIODS = [90, 180, 360, 720, 1800, 3600]  # 90d, 180d, 360d, 2y, 5y, 10y


def load_etf_prices() -> Dict[str, List[Dict]]:
    """Load ETF prices from JSON file."""
    if not ETF_PRICES_PATH.exists():
        raise FileNotFoundError(f"ETF prices file not found: {ETF_PRICES_PATH}")
    
    with open(ETF_PRICES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"[rrg-history] Loaded prices for {len(data)} ETFs")
    return data


def prices_to_dict(price_list: List[Dict]) -> Dict[str, float]:
    """Convert list of {date, adj_close} to dict mapping date -> price."""
    return {item["date"]: item["adj_close"] for item in price_list}


def calculate_historical_rrg(
    etf_prices: Dict[str, List[Dict]],
    symbols: List[str],
    benchmark: str,
    lookback_days: int,
    interval: str = "weekly",
    max_years: int = 20,
) -> List[Dict]:
    """
    Calculate historical RRG data for given symbols.
    
    Args:
        etf_prices: Dict mapping symbol -> list of {date, adj_close}
        symbols: List of sector ETF symbols
        benchmark: Benchmark symbol (e.g., "SPY")
        lookback_days: Number of days to look back for RRG calculation
        interval: "weekly" or "monthly"
        max_years: Maximum years of history to calculate
    
    Returns:
        List of RRG data points: [{symbol, date, rsRatio, rsMomentum, quadrant, lookback_days}, ...]
    """
    # Get benchmark prices
    benchmark_prices_list = etf_prices.get(benchmark, [])
    if not benchmark_prices_list:
        print(f"[rrg-history] WARNING: No benchmark prices found for {benchmark}")
        return []
    
    benchmark_prices_by_date = prices_to_dict(benchmark_prices_list)
    
    # Determine date range
    if benchmark_prices_list:
        first_date_str = benchmark_prices_list[0]["date"]
        last_date_str = benchmark_prices_list[-1]["date"]
        first_date = datetime.strptime(first_date_str, "%Y-%m-%d")
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        
        # Limit to max_years
        max_start_date = last_date - timedelta(days=max_years * 365)
        if first_date < max_start_date:
            first_date = max_start_date
        
        # Start from lookback_days after first_date to ensure we have enough data
        calculation_start = first_date + timedelta(days=lookback_days)
    else:
        return []
    
    # Generate dates based on interval
    if interval == "weekly":
        dates = generate_weekly_dates(calculation_start, last_date)
    elif interval == "monthly":
        dates = generate_monthly_dates(calculation_start, last_date)
    else:
        raise ValueError(f"Unknown interval: {interval}")
    
    print(f"[rrg-history] Calculating RRG for {len(symbols)} symbols, {len(dates)} dates, lookback={lookback_days}d")
    
    results: List[Dict] = []
    
    for symbol in symbols:
        stock_prices_list = etf_prices.get(symbol, [])
        if not stock_prices_list:
            print(f"[rrg-history] WARNING: No prices found for {symbol}")
            continue
        
        stock_prices_by_date = prices_to_dict(stock_prices_list)
        
        for date in dates:
            rrg_data = calculate_rrg_for_date(
                date,
                stock_prices_by_date,
                benchmark_prices_by_date,
                lookback_days,
            )
            
            if rrg_data:
                results.append({
                    "symbol": symbol,
                    **rrg_data,
                    "lookback_days": lookback_days,
                })
        
        print(f"[rrg-history] {symbol}: {len([r for r in results if r['symbol'] == symbol])} data points")
    
    return results


def main():
    """Main function to generate historical RRG data."""
    print("[rrg-history] Starting historical RRG data generation...")
    
    # Load ETF prices
    etf_prices = load_etf_prices()
    
    # Verify benchmark exists
    if BENCHMARK not in etf_prices:
        raise ValueError(f"Benchmark {BENCHMARK} not found in ETF prices")
    
    # Calculate RRG for each lookback period
    all_results: List[Dict] = []
    
    for lookback_days in LOOKBACK_PERIODS:
        print(f"\n[rrg-history] Processing lookback period: {lookback_days} days")
        
        # Use weekly interval for shorter periods, monthly for longer
        interval = "weekly" if lookback_days <= 360 else "monthly"
        
        results = calculate_historical_rrg(
            etf_prices,
            SECTOR_ETFS,
            BENCHMARK,
            lookback_days,
            interval=interval,
            max_years=20,
        )
        
        all_results.extend(results)
        print(f"[rrg-history] Added {len(results)} data points for {lookback_days}d lookback")
    
    # Sort by symbol, then date, then lookback_days
    all_results.sort(key=lambda x: (x["symbol"], x["date"], x["lookback_days"]))
    
    # Write to JSON
    output_data = {
        "generated_at": datetime.now().isoformat(),
        "benchmark": BENCHMARK,
        "symbols": SECTOR_ETFS,
        "lookback_periods": LOOKBACK_PERIODS,
        "total_points": len(all_results),
        "data": all_results,
    }
    
    RRG_HISTORY_PATH.write_text(
        json.dumps(output_data, indent=2, sort_keys=True),
        encoding="utf-8"
    )
    
    # Keep output ASCII-only for Windows consoles with legacy encodings.
    print(f"\n[rrg-history] OK Generated {len(all_results)} RRG data points")
    print(f"[rrg-history] OK Saved to {RRG_HISTORY_PATH}")
    
    # Print summary
    print("\n[rrg-history] Summary by symbol:")
    for symbol in SECTOR_ETFS:
        symbol_points = [r for r in all_results if r["symbol"] == symbol]
        if symbol_points:
            dates = sorted(set(r["date"] for r in symbol_points))
            print(f"  {symbol}: {len(symbol_points)} points ({dates[0]} to {dates[-1]})")


if __name__ == "__main__":
    main()

