"""
Fetch daily ETF prices from Yahoo Finance and write them to data/etf-prices.json
in the JSON shape expected by backend (see _load_etf_prices in main.py).

Run from project root:
  python scripts/fetch_etf_prices_from_yahoo.py

Dependencies (install once):
  pip install yfinance
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import yfinance as yf


# Project root = parent of this scripts/ directory
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ETF_PRICES_PATH = DATA_DIR / "etf-prices.json"


# Benchmark + GICS sector ETFs we care about
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


def fetch_history(symbol: str, period: str = "5y") -> List[Dict]:
    """
    Fetch daily history from Yahoo Finance for a single ETF.

    Returns a list of records: [{ "date": "YYYY-MM-DD", "adj_close": float }, ...]
    """
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval="1d", auto_adjust=False)

    if df is None or df.empty:
        print(f"[etf-fetch] WARNING: no data returned for {symbol}")
        return []

    # Prefer Adj Close if available, else Close
    if "Adj Close" in df.columns:
        price_col = "Adj Close"
    elif "Close" in df.columns:
        price_col = "Close"
    else:
        print(f"[etf-fetch] WARNING: no Close/Adj Close column for {symbol}")
        return []

    records: List[Dict] = []
    for idx, row in df.iterrows():
        try:
            dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else datetime.fromisoformat(str(idx))
        except Exception:
            continue
        price_val = row.get(price_col)
        if price_val is None:
            continue
        try:
            price_float = float(price_val)
        except (TypeError, ValueError):
            continue
        if not (price_float == price_float):  # NaN check without importing math
            continue
        records.append(
            {
                "date": dt.strftime("%Y-%m-%d"),
                "adj_close": price_float,
            }
        )

    print(f"[etf-fetch] {symbol}: {len(records)} daily points fetched")
    return records


def main() -> None:
    all_data: Dict[str, List[Dict]] = {}

    for sym in ETF_SYMBOLS:
        try:
            records = fetch_history(sym)
            if records:
                all_data[sym] = records
        except Exception as exc:
            print(f"[etf-fetch] ERROR fetching {sym}: {exc}")

    if not all_data:
        print("[etf-fetch] No data fetched for any ETF. Not writing file.")
        return

    # Write pretty but compact JSON
    ETF_PRICES_PATH.write_text(json.dumps(all_data, indent=2, sort_keys=True), encoding="utf-8")
    print(f"[etf-fetch] Wrote {len(all_data)} ETFs to {ETF_PRICES_PATH}")


if __name__ == "__main__":
    main()


