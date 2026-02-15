#!/usr/bin/env python3
"""
Offline batch script to extract key sections from SEC filings, call Gemini to
summarize them into structured JSON, and persist the result via backend.sec_insights.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))
from backend.insight_jobs import generate_filing_insights_for_symbol  # type: ignore




def main() -> None:
    parser = argparse.ArgumentParser(description="Generate FilingInsights via Gemini.")
    parser.add_argument("--symbol", required=True, help="Ticker symbol (e.g., AAPL)")
    parser.add_argument("--cik", required=True, help="CIK (10-digit, leading zeros ok)")
    parser.add_argument(
        "--forms",
        nargs="+",
        default=["10-K", "10-Q"],
        help="Filing types to process (default: 10-K 10-Q)",
    )
    parser.add_argument("--max-filings", type=int, default=2, help="Max filings per symbol")
    args = parser.parse_args()

    generated = generate_filing_insights_for_symbol(
        args.symbol,
        args.cik,
        forms=args.forms,
        max_filings=args.max_filings,
    )
    if generated:
        for path in generated:
            print(f"[filings] Saved insights -> {path}")
    else:
        print(f"[filings] No filings processed for {args.symbol}")


if __name__ == "__main__":
    main()


