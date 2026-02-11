from __future__ import annotations

import sys
from pathlib import Path
import argparse

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.defeatbeta_setup import get_ticker


def _try_statement(obj):
    """
    DefeatBeta statement objects are usually `defeatbeta_api.data.statement.Statement`
    and expose `.df()` to get a pandas DataFrame.
    """
    if hasattr(obj, "df") and callable(getattr(obj, "df")):
        return obj.df()
    if isinstance(obj, pd.DataFrame):
        return obj
    return None


def show_statement(name: str, obj) -> None:
    df = _try_statement(obj)
    print(f"\n== {name} ==")
    if df is None:
        print(f"Unsupported type: {type(obj)}")
        return
    print("shape:", getattr(df, "shape", None))
    print("columns (first 20):", list(df.columns)[:20])
    print(df.head(8).to_string(index=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="AAPL")
    args = parser.parse_args()

    t = get_ticker(args.symbol)

    # Quarterly statements (best for backtest sampling cadence)
    show_statement("quarterly_income_statement", t.quarterly_income_statement())
    show_statement("quarterly_balance_sheet", t.quarterly_balance_sheet())
    show_statement("quarterly_cash_flow", t.quarterly_cash_flow())

    # Annual statements (useful for longer-term fundamentals)
    show_statement("annual_income_statement", t.annual_income_statement())
    show_statement("annual_balance_sheet", t.annual_balance_sheet())
    show_statement("annual_cash_flow", t.annual_cash_flow())

    # Earnings table (often includes period dates; check if there's any publish date)
    earnings = t.earnings()
    print("\n== earnings ==")
    print("type:", type(earnings))
    if isinstance(earnings, pd.DataFrame):
        print("columns:", list(earnings.columns))
        print(earnings.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
