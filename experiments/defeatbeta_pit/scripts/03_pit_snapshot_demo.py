from __future__ import annotations

import sys
from pathlib import Path
import argparse
from datetime import date, timedelta

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.defeatbeta_setup import get_ticker


def parse_date(s: str) -> date:
    return date.fromisoformat(s)


def statement_to_long(df: pd.DataFrame) -> pd.DataFrame:
    """
    DefeatBeta statements come in a 'wide' format:
      Breakdown | 2024-03-31 | 2023-12-31 | ...
    Convert to a long format for easier PIT handling.
    """
    if "Breakdown" not in df.columns:
        raise ValueError("Expected a 'Breakdown' column in statement df() output")

    value_cols = [c for c in df.columns if c != "Breakdown"]
    out = df.melt(id_vars=["Breakdown"], value_vars=value_cols, var_name="period_end", value_name="value")
    out["period_end"] = pd.to_datetime(out["period_end"], format="%Y-%m-%d", errors="coerce").dt.date
    out = out.dropna(subset=["period_end"])
    return out


def pick_latest_period_asof(period_ends: list[date], as_of: date, assumed_lag_days: int) -> date | None:
    """
    DIY PIT approximation: a period becomes 'known' lag_days after period end.
    """
    usable = []
    for pe in period_ends:
        available_on = pe + timedelta(days=assumed_lag_days)
        if available_on <= as_of:
            usable.append(pe)
    return max(usable) if usable else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="AAPL")
    parser.add_argument("--as-of", required=True, help="As-of date (YYYY-MM-DD), e.g. 2019-12-31")
    parser.add_argument("--frequency", choices=["quarterly", "annual"], default="quarterly")
    parser.add_argument(
        "--lag-days",
        type=int,
        default=None,
        help="Reporting lag days (default: 45 quarterly, 90 annual)",
    )
    args = parser.parse_args()

    as_of = parse_date(args.as_of)
    t = get_ticker(args.symbol)

    if args.frequency == "annual":
        stmt = t.annual_income_statement()
        lag_days = 90 if args.lag_days is None else args.lag_days
    else:
        stmt = t.quarterly_income_statement()
        lag_days = 45 if args.lag_days is None else args.lag_days

    df = stmt.df() if hasattr(stmt, "df") else stmt
    if not isinstance(df, pd.DataFrame):
        raise RuntimeError(f"Unexpected statement type: {type(df)}")

    long_df = statement_to_long(df)
    period_ends = sorted({d for d in long_df["period_end"].tolist() if isinstance(d, date)})
    chosen = pick_latest_period_asof(period_ends, as_of, assumed_lag_days=lag_days)

    print(f"Symbol: {args.symbol.upper()}")
    print(f"As-of: {as_of.isoformat()}")
    print(f"Frequency: {args.frequency}")
    print(f"Assumed reporting lag: {lag_days} days")
    print(f"Latest usable period_end: {chosen.isoformat() if chosen else 'NONE'}")

    if not chosen:
        if period_ends:
            print(f"Available period_end range: {min(period_ends).isoformat()} → {max(period_ends).isoformat()}")
            print("Tip: try a later as-of date, or switch to --frequency annual.")
        return

    snapshot = long_df[long_df["period_end"] == chosen].copy()
    interesting = {
        "Total Revenue",
        "Operating Income",
        "Net Income Common Stockholders",
        "Diluted EPS",
        "EBIT",
        "EBITDA",
    }
    snap2 = snapshot[snapshot["Breakdown"].isin(interesting)]
    if snap2.empty:
        snap2 = snapshot.head(12)
    print("\nSnapshot rows:")
    print(snap2.to_string(index=False))


if __name__ == "__main__":
    main()
