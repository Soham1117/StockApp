#!/usr/bin/env python3
"""
Offline batch script to summarize earnings call transcripts via Gemini and
persist structured TranscriptInsights JSON artifacts.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from fastapi_app.insight_jobs import generate_transcript_insights_for_symbol  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate TranscriptInsights via Gemini.")
    parser.add_argument("--symbol", required=True, help="Ticker symbol (e.g., AMD)")
    parser.add_argument("--limit", type=int, default=2, help="Max quarters to process")
    args = parser.parse_args()

    generated = generate_transcript_insights_for_symbol(args.symbol, limit=args.limit)
    if generated:
        for path in generated:
            print(f"[transcripts] Saved insights -> {path}")
    else:
        print(f"[transcripts] No transcripts processed for {args.symbol}")


if __name__ == "__main__":
    main()


