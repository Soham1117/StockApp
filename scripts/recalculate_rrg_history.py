"""
Recalculate all historical RRG data with corrected formulas.

This script:
1. Loads historical price data for sector ETFs
2. Applies corrected RS-Ratio (52-week rolling average) and RS-Momentum (EMA) calculations
3. Saves recalculated data to cache
4. Shows progress bar for user feedback

Usage:
    python scripts/recalculate_rrg_history.py [--lookback 180] [--start-date 2014-01-01]
    python scripts/recalculate_rrg_history.py --all [--start-date 2014-01-01]
"""
import sys
import os
import platform
from pathlib import Path

# Set up paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FASTAPI_DIR = PROJECT_ROOT / "backend"

# Add repo root and backend to path so local packages are preferred.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(FASTAPI_DIR) not in sys.path:
    sys.path.insert(0, str(FASTAPI_DIR))

# Set DefeatBeta environment variables (same as run.ps1)
os.environ.setdefault("DEFEATBETA_LOCAL_DATA", str(FASTAPI_DIR / "local_data"))
os.environ.setdefault("DEFEATBETA_NO_WELCOME", "1")
os.environ.setdefault("DEFEATBETA_NO_NLTK_DOWNLOAD", "1")

import argparse
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pandas as pd
from tqdm import tqdm

# Import corrected RRG calculation functions
from rrg_history import calculate_rrg_corrected, determine_quadrant


def _build_duckdb_config():
    """Return a Windows-safe DuckDB config that skips cache_httpfs."""
    from defeatbeta_api.client.duckdb_conf import Configuration

    class WindowsCompatibleDuckDBConfig(Configuration):
        def get_duckdb_settings(self):
            settings = super().get_duckdb_settings()
            if platform.system() != "Windows":
                return settings
            return [setting for setting in settings if "cache_httpfs" not in setting]

    if platform.system() == "Windows":
        return WindowsCompatibleDuckDBConfig()
    return None


_DUCKDB_CONFIG = _build_duckdb_config()
_LOCAL_ETF_CACHE: Optional[Dict[str, List[Dict[str, Any]]]] = None



SECTOR_ETFS = [
    "XLK", "XLF", "XLY", "XLP", "XLI", "XLE", 
    "XLV", "XLB", "XLU", "XLC", "IYR"
]

BENCHMARK = "SPY"
LOOKBACK_PERIODS = [90, 180, 360, 720, 1800, 3600]

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "backend" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _required_window_days(lookback_days: int) -> int:
    """
    Minimum calendar-day window to ensure enough trading days for corrected RRG.

    The corrected method needs ~252 trading days for the 52-week average plus
    extra history for EMA stabilization. Use a conservative calendar buffer.
    """
    return max(lookback_days, 365) + 120


def _load_local_etf_cache() -> Dict[str, List[Dict[str, Any]]]:
    """Load local ETF prices cache produced by scripts/fetch_etf_prices_extended.py."""
    global _LOCAL_ETF_CACHE
    if _LOCAL_ETF_CACHE is not None:
        return _LOCAL_ETF_CACHE
    cache_path = PROJECT_ROOT / "data" / "etf-prices.json"
    if not cache_path.exists():
        _LOCAL_ETF_CACHE = {}
        return _LOCAL_ETF_CACHE
    try:
        _LOCAL_ETF_CACHE = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[WARN] Failed to load local ETF cache {cache_path}: {exc}")
        _LOCAL_ETF_CACHE = {}
    return _LOCAL_ETF_CACHE


def _load_prices_from_local_cache(symbol: str, start_date: str, end_date: str) -> Dict[str, float]:
    """Fallback to local ETF cache when DefeatBeta price data is unavailable."""
    cache = _load_local_etf_cache()
    series = cache.get(symbol, [])
    if not isinstance(series, list) or not series:
        return {}
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    price_dict: Dict[str, float] = {}
    for row in series:
        if not isinstance(row, dict):
            continue
        date_str = row.get("date")
        price_val = row.get("adj_close")
        if not date_str or price_val is None:
            continue
        try:
            dt = datetime.strptime(str(date_str), "%Y-%m-%d")
        except Exception:
            continue
        if dt < start_dt or dt > end_dt:
            continue
        try:
            price = float(price_val)
        except (TypeError, ValueError):
            continue
        price_dict[dt.strftime("%Y-%m-%d")] = price
    if price_dict:
        print(f"[OK] {symbol}: Loaded {len(price_dict)} price points from local ETF cache")
    return price_dict


def load_price_data(symbol: str, start_date: str, end_date: str) -> Dict[str, float]:
    """
    Load historical price data for a symbol from DefeatBeta API.
    
    Returns:
        Dict mapping date strings (YYYY-MM-DD) to closing prices
    """
    print(f"[INFO] Loading price data for {symbol} from {start_date} to {end_date}")
    
    try:
        # Import DefeatBeta API
        from defeatbeta_api.data.ticker import Ticker
        
        # Get ticker object
        if _DUCKDB_CONFIG is not None:
            t = Ticker(symbol, config=_DUCKDB_CONFIG)
        else:
            t = Ticker(symbol)
        
        # Fetch historical prices
        # Prefer historical_price_full() when available; otherwise fall back to price().
        df = None
        prices_fn = getattr(t, "historical_price_full", None)
        if prices_fn and callable(prices_fn):
            df = prices_fn()
        else:
            price_fn = getattr(t, "price", None)
            if not price_fn or not callable(price_fn):
                print(f"[ERROR] {symbol}: no price method available")
                return {}
            df = price_fn()
        
        if df is None or df.empty:
            print(f"[WARN] {symbol}: No price data returned from DefeatBeta, falling back to local ETF cache")
            fallback = _load_prices_from_local_cache(symbol, start_date, end_date)
            if fallback:
                return fallback
            print(f"[ERROR] {symbol}: No price data returned")
            return {}
        
        # Filter by date range
        df = df.copy()
        if 'date' not in df.columns and 'report_date' not in df.columns:
            # Date might be in index
            df = df.reset_index()
        
        # Ensure date column is datetime
        if 'date' in df.columns:
            date_col = 'date'
        elif 'report_date' in df.columns:
            date_col = 'report_date'
        else:
            print(f"[ERROR] {symbol}: No date column found. Available: {list(df.columns)}")
            return {}
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df = df.dropna(subset=[date_col])
        
        # Filter date range
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        df = df[(df[date_col] >= start_dt) & (df[date_col] <= end_dt)]
        
        if df.empty:
            print(f"[WARN] {symbol}: No data in date range {start_date} to {end_date}")
            return {}
        
        # Extract close prices
        price_col = None
        for candidate in ("adj_close", "adj_close_price", "close", "close_price"):
            if candidate in df.columns:
                price_col = candidate
                break
        if price_col is None:
            print(f"[WARN] {symbol}: No close column found. Available: {list(df.columns)}")
            fallback = _load_prices_from_local_cache(symbol, start_date, end_date)
            if fallback:
                return fallback
            print(f"[ERROR] {symbol}: No close column found")
            return {}
        
        # Build dict mapping date string -> close price
        price_dict = {}
        for _, row in df.iterrows():
            date_str = row[date_col].strftime("%Y-%m-%d")
            close_price = float(row[price_col])
            price_dict[date_str] = close_price
        
        if price_dict:
            print(f"[OK] {symbol}: Loaded {len(price_dict)} price points")
            return price_dict
        print(f"[WARN] {symbol}: No data after filtering, trying local ETF cache")
        fallback = _load_prices_from_local_cache(symbol, start_date, end_date)
        if fallback:
            return fallback
        return {}
        
    except Exception as e:
        print(f"[ERROR] Failed to load {symbol}: {e}")
        import traceback
        traceback.print_exc()
        return {}



def recalculate_rrg_for_symbol(
    symbol: str,
    benchmark_prices: Dict[str, float],
    lookback_days: int,
    start_date: datetime,
    end_date: datetime
) -> List[Dict]:
    """
    Recalculate RRG data for a single symbol.
    
    Returns:
        List of RRG data points with corrected calculations
    """
    # Load symbol prices
    window_days = _required_window_days(lookback_days)
    symbol_prices = load_price_data(
        symbol,
        (start_date - timedelta(days=window_days)).strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d")
    )
    
    if not symbol_prices:
        print(f"[WARN] No price data for {symbol}, skipping")
        return []
    
    # Calculate RRG for each date in range
    results = []
    current_date = start_date
    
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        
        # Get lookback window
        lookback_start = current_date - timedelta(days=window_days)
        
        # Collect aligned prices
        stock_prices = []
        bench_prices = []
        dates = []
        
        check_date = lookback_start
        while check_date <= current_date:
            check_str = check_date.strftime("%Y-%m-%d")
            if check_str in symbol_prices and check_str in benchmark_prices:
                stock_prices.append(symbol_prices[check_str])
                bench_prices.append(benchmark_prices[check_str])
                dates.append(check_str)
            check_date += timedelta(days=1)
        
        # Need at least 252 trading days for 52-week average
        if len(stock_prices) >= 252:
            try:
                rs_ratio, rs_momentum = calculate_rrg_corrected(
                    stock_prices,
                    bench_prices,
                    lookback_days
                )
                
                quadrant = determine_quadrant(rs_ratio, rs_momentum)
                
                results.append({
                    "symbol": symbol,
                    "date": date_str,
                    "lookback_days": lookback_days,
                    "rsRatio": round(rs_ratio, 2),
                    "rsMomentum": round(rs_momentum, 2),
                    "quadrant": quadrant
                })
            except Exception as e:
                print(f"[ERROR] Failed to calculate RRG for {symbol} on {date_str}: {e}")
        
        # Move to next week (weekly data points)
        current_date += timedelta(days=7)
    
    return results


def _run_recalculation(lookback_days: int, start_date: datetime, end_date: datetime) -> bool:
    print(f"\n{'='*60}")
    print("RRG Historical Data Recalculation")
    print(f"{'='*60}")
    print(f"Lookback Period: {lookback_days} days")
    print(f"Date Range: {start_date.date()} to {end_date.date()}")
    print(f"Symbols: {len(SECTOR_ETFS)} sector ETFs")
    print(f"{'='*60}\n")
    
    # Load benchmark prices
    print(f"[1/3] Loading benchmark ({BENCHMARK}) prices...")
    window_days = _required_window_days(lookback_days)
    benchmark_prices = load_price_data(
        BENCHMARK,
        (start_date - timedelta(days=window_days)).strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d")
    )
    
    if not benchmark_prices:
        print("[ERROR] Failed to load benchmark prices. Skipping.")
        return False
    
    print(f"[OK] Loaded {len(benchmark_prices)} benchmark price points\n")
    
    # Recalculate for each symbol
    print(f"[2/3] Recalculating RRG data for {len(SECTOR_ETFS)} symbols...")
    all_results = []
    
    for symbol in tqdm(SECTOR_ETFS, desc="Processing symbols"):
        symbol_results = recalculate_rrg_for_symbol(
            symbol,
            benchmark_prices,
            lookback_days,
            start_date,
            end_date
        )
        all_results.extend(symbol_results)
    
    print(f"\n[OK] Calculated {len(all_results)} RRG data points\n")
    
    # Save results
    print(f"[3/3] Saving results...")
    output_file = OUTPUT_DIR / f"rrg_history_{lookback_days}d.json"
    
    with open(output_file, "w") as f:
        json.dump({
            "metadata": {
                "lookback_days": lookback_days,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "symbols": SECTOR_ETFS,
                "benchmark": BENCHMARK,
                "calculation_method": "corrected_52w_ema",
                "generated_at": datetime.now().isoformat()
            },
            "data": all_results
        }, f, indent=2)
    
    print(f"[OK] Saved to {output_file}")
    print(f"\n{'='*60}")
    print("Recalculation complete!")
    print(f"Total data points: {len(all_results)}")
    print(f"Output file: {output_file}")
    print(f"{'='*60}\n")
    return True


def main():
    parser = argparse.ArgumentParser(description="Recalculate historical RRG data")
    parser.add_argument("--lookback", type=int, default=180, help="Lookback period in days")
    parser.add_argument("--all", action="store_true", help="Recalculate all standard lookback periods")
    parser.add_argument("--start-date", type=str, default="2014-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default=None, help="End date (YYYY-MM-DD), defaults to today")
    args = parser.parse_args()
    
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d")
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d") if args.end_date else datetime.now()
    
    lookbacks = LOOKBACK_PERIODS if args.all else [args.lookback]
    
    if args.all:
        print(f"[INFO] Recalculating all lookbacks: {', '.join(str(x) for x in lookbacks)}")
    
    for lookback_days in lookbacks:
        _run_recalculation(lookback_days, start_date, end_date)


if __name__ == "__main__":
    main()
