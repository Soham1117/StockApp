#!/usr/bin/env python3
"""
Generate precomputed metrics per sector to eliminate the slow first-load hit.

This script calls the FastAPI `/metrics` endpoint for each sector found in
`data/sector-stocks.json` and writes the results to `data/sector-metrics.json`.

The precomputed metrics include:
- Valuation ratios (P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales, Dividend Yield)
- Profitability metrics (ROE, ROA, ROIC, margins)
- Financial health metrics (debt-to-equity, interest coverage, liquidity ratios)
- Cash flow metrics (FCF, OCF, yields)
- Growth metrics (revenue, EBIT, EPS, FCF growth)
- Valuation extras (Forward P/E, PEG ratio)

Usage:
    python scripts/generate-sector-metrics.py [--fastapi-base-url http://localhost:8000] [--batch-size 200]

For local parquet files (fastest):
    python scripts/generate-sector-metrics.py --batch-size 200 --workers 8
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Any
from urllib.parse import urljoin

import requests

# Fix Windows console encoding for Unicode characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
        # After reconfiguration, check if UTF-8 is actually available
        use_unicode = True
    except Exception:
        use_unicode = False
else:
    # On non-Windows, try to detect UTF-8 support
    try:
        use_unicode = sys.stdout.encoding and "utf" in sys.stdout.encoding.lower()
    except Exception:
        use_unicode = False

# ASCII-safe symbols for cross-platform compatibility
CHECK_MARK = "✓" if use_unicode else "[OK]"
CROSS_MARK = "✗" if use_unicode else "[ERROR]"
WARNING_MARK = "⚠" if use_unicode else "[WARN]"

SECTOR_STOCKS_PATH = os.path.join("data", "sector-stocks.json")
OUTPUT_PATH = os.path.join("data", "sector-metrics.json")
SCHEMA_VERSION = "v3"  # bumped to v3 for dividend yield and expanded metrics

# Optimized defaults for local parquet files
# Reduced default batch size to prevent timeouts with large sectors
DEFAULT_BATCH_SIZE = int(os.getenv("GENERATE_SECTOR_METRICS_BATCH_SIZE", "100"))
DEFAULT_BATCH_DELAY = float(os.getenv("GENERATE_SECTOR_METRICS_BATCH_DELAY", "0"))
DEFAULT_WORKERS = int(os.getenv("GENERATE_SECTOR_METRICS_WORKERS", "4"))
DEFAULT_TIMEOUT = int(os.getenv("GENERATE_SECTOR_METRICS_TIMEOUT", "1200"))  # 20 minutes default


def load_sector_stocks(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_batch(base_url: str, batch: List[str], batch_num: int, timeout: int = 1200) -> tuple:
    """Fetch a single batch of symbols. Returns (batch_num, metrics, error)."""
    # Adaptive timeout: 30 seconds per symbol, minimum 600s, maximum 1800s (30 min)
    # This ensures large batches get enough time to complete
    adaptive_timeout = max(600, min(1800, len(batch) * 30))
    actual_timeout = max(timeout, adaptive_timeout)
    
    try:
        response = requests.post(
            urljoin(base_url, "/metrics"),
            json={"symbols": batch},
            timeout=actual_timeout,
        )
        response.raise_for_status()
        payload = response.json()
        return (batch_num, payload.get("metrics", []), None)
    except Exception as e:
        return (batch_num, [], str(e))


def fetch_metrics_parallel(
    base_url: str,
    symbols: List[str],
    batch_size: int = 50,
    max_workers: int = 4,
    timeout: int = 1200,
) -> List[Dict[str, Any]]:
    """
    Fetch metrics for a list of symbols from FastAPI using parallel requests.
    Optimized for local parquet files - no rate limiting needed.
    
    Uses adaptive batch sizing: smaller batches for large symbol lists to avoid timeouts.
    """
    # Adaptive batch sizing: reduce batch size for very large symbol lists
    # This prevents timeouts when processing large sectors
    if len(symbols) > 500:
        # For very large sectors (500+ symbols), use smaller batches
        batch_size = min(batch_size, 100)
    elif len(symbols) > 300:
        # For large sectors (300-500 symbols), use medium batches
        batch_size = min(batch_size, 150)
    """
    Fetch metrics for a list of symbols from FastAPI using parallel requests.
    Optimized for local parquet files - no rate limiting needed.
    """
    all_metrics: List[Dict[str, Any]] = [None] * len(symbols)  # Pre-allocate for ordering

    # Split symbols into batches
    batches = [symbols[i:i + batch_size] for i in range(0, len(symbols), batch_size)]
    total_batches = len(batches)
    total_symbols = len(symbols)

    if total_batches == 0:
        return []

    fetch_start = time.time()
    completed = 0
    failed_batches = 0
    symbol_idx = 0
    batch_to_idx = {}  # Map batch_num to starting symbol index

    for i, batch in enumerate(batches):
        batch_to_idx[i + 1] = symbol_idx
        symbol_idx += len(batch)

    # Use thread pool for parallel fetching
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_batch, base_url, batch, i + 1, timeout): i + 1
            for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            batch_num = futures[future]
            batch_num_result, metrics, error = future.result()

            if error:
                print(f"      {CROSS_MARK} Batch {batch_num}/{total_batches} failed: {error}")
                failed_batches += 1
            else:
                # Insert metrics at correct position to maintain order
                start_idx = batch_to_idx[batch_num]
                for j, m in enumerate(metrics):
                    if start_idx + j < len(all_metrics):
                        all_metrics[start_idx + j] = m

                completed += 1
                elapsed = time.time() - fetch_start
                fetched_count = sum(1 for m in all_metrics if m is not None)
                percent = (fetched_count / total_symbols) * 100
                rate = fetched_count / elapsed if elapsed > 0 else 0
                remaining = total_symbols - fetched_count
                eta_seconds = (remaining / rate) if rate > 0 else 0

                print(f"      {CHECK_MARK} Batch {batch_num:3d}/{total_batches} ({len(metrics):3d} symbols) | "
                      f"{fetched_count:5d}/{total_symbols} ({percent:5.1f}%) | "
                      f"Rate: {rate:5.1f}/s | ETA: {eta_seconds/60:5.1f} min")

    # Filter out None entries (failed batches)
    result = [m for m in all_metrics if m is not None]

    total_duration = time.time() - fetch_start
    print(f"      {'-' * 69}")
    print(f"      {CHECK_MARK} Fetched {len(result)} metrics in {total_duration:.1f}s ({total_duration/60:.1f} min)")
    if total_duration > 0:
        print(f"        Average rate: {len(result)/total_duration:.1f} symbols/s")
    if failed_batches > 0:
        print(f"        Failed batches: {failed_batches}")

    return result


def fetch_metrics_sequential(
    base_url: str,
    symbols: List[str],
    batch_size: int = 50,
    batch_delay: float = 0,
) -> List[Dict[str, Any]]:
    """
    Fetch metrics sequentially (original behavior, for compatibility).
    """
    all_metrics: List[Dict[str, Any]] = []

    batches = [symbols[i:i + batch_size] for i in range(0, len(symbols), batch_size)]
    total_batches = len(batches)
    total_symbols = len(symbols)

    fetch_start = time.time()

    for batch_num, batch in enumerate(batches, 1):
        batch_start = time.time()
        print(f"      [DEBUG] Starting batch {batch_num}/{total_batches} with {len(batch)} symbols: {batch[:5]}{'...' if len(batch) > 5 else ''}")

        try:
            print(f"      [DEBUG] Sending POST request to {base_url}/metrics...")
            response = requests.post(
                urljoin(base_url, "/metrics"),
                json={"symbols": batch},
                timeout=120,  # Reduced timeout to 2 minutes
            )
            print(f"      [DEBUG] Got response: status={response.status_code}, elapsed={response.elapsed.total_seconds():.1f}s")

            response.raise_for_status()

            print(f"      [DEBUG] Parsing JSON response...")
            payload = response.json()
            batch_metrics = payload.get("metrics", [])
            print(f"      [DEBUG] Got {len(batch_metrics)} metrics from response")

            all_metrics.extend(batch_metrics)

            batch_duration = time.time() - batch_start
            elapsed = time.time() - fetch_start
            percent = (len(all_metrics) / total_symbols) * 100
            rate = len(all_metrics) / elapsed if elapsed > 0 else 0
            remaining = total_symbols - len(all_metrics)
            eta_seconds = (remaining / rate) if rate > 0 else 0

            print(f"      {CHECK_MARK} Batch {batch_num:3d}/{total_batches} ({len(batch_metrics):3d} symbols) | "
                  f"{len(all_metrics):5d}/{total_symbols} ({percent:5.1f}%) | "
                  f"Rate: {rate:5.1f}/s | ETA: {eta_seconds/60:5.1f} min | "
                  f"Batch: {batch_duration:.1f}s")

            if batch_num < total_batches and batch_delay > 0:
                time.sleep(batch_delay)

        except requests.exceptions.Timeout:
            batch_duration = time.time() - batch_start
            print(f"      {CROSS_MARK} Batch {batch_num}/{total_batches} TIMEOUT after {batch_duration:.1f}s")
            print(f"        Symbols in batch: {batch}")
            continue
        except requests.exceptions.RequestException as e:
            batch_duration = time.time() - batch_start
            print(f"      {CROSS_MARK} Batch {batch_num}/{total_batches} REQUEST ERROR after {batch_duration:.1f}s: {e}")
            continue
        except Exception as e:
            batch_duration = time.time() - batch_start
            print(f"      {CROSS_MARK} Batch {batch_num}/{total_batches} UNEXPECTED ERROR after {batch_duration:.1f}s: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            continue

    total_duration = time.time() - fetch_start
    print(f"      {'-' * 69}")
    print(f"      {CHECK_MARK} Fetched {len(all_metrics)} metrics in {total_duration:.1f}s ({total_duration/60:.1f} min)")
    if total_duration > 0:
        print(f"        Average rate: {len(all_metrics)/total_duration:.1f} symbols/s")

    return all_metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate precomputed sector metrics")
    parser.add_argument(
        "--fastapi-base-url",
        default=os.getenv("FASTAPI_BASE_URL", "http://localhost:8000"),
        help="Base URL for the FastAPI service",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of symbols per /metrics request (default: {DEFAULT_BATCH_SIZE}, auto-reduced for large sectors)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"Request timeout in seconds (default: {DEFAULT_TIMEOUT}s = {DEFAULT_TIMEOUT/60:.1f} min)",
    )
    parser.add_argument(
        "--batch-delay",
        type=float,
        default=DEFAULT_BATCH_DELAY,
        help=f"Seconds to sleep between batches - only used in sequential mode (default: {DEFAULT_BATCH_DELAY}s)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Number of parallel workers for fetching batches (default: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Use sequential fetching instead of parallel (slower but more predictable)",
    )
    parser.add_argument(
        "--sector",
        help="Only generate metrics for a specific sector (for testing/debugging)",
    )
    args = parser.parse_args()

    if not os.path.exists(SECTOR_STOCKS_PATH):
        print(f"ERROR: {SECTOR_STOCKS_PATH} not found. Run generate-universe.py first.")
        return

    sector_data = load_sector_stocks(SECTOR_STOCKS_PATH)

    # Load existing data if updating specific sectors
    output: Dict[str, Dict[str, Any]] = {}
    if args.sector and os.path.exists(OUTPUT_PATH):
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                # Preserve existing sectors and metadata
                output = existing_data.copy()
                print(f"[info] Loaded existing data with {len([k for k in output.keys() if k != '__meta__'])} sectors")
        except Exception as e:
            print(f"[warn] Could not load existing data: {e}, starting fresh")
            output = {}

    # Initialize metadata if not present
    if "__meta__" not in output:
        output["__meta__"] = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "includes": [
                "valuation_ratios",
                "profitability_metrics",
                "financial_health_metrics",
                "cash_flow_metrics",
                "growth_metrics",
                "valuation_extras",
                "dividend_yield",
                "shares_outstanding",
            ],
        }
    else:
        # Update generation timestamp
        output["__meta__"]["generated_at"] = datetime.utcnow().isoformat() + "Z"

    sectors_to_process = [args.sector] if args.sector else sorted(sector_data.keys())
    total_sectors = len(sectors_to_process)

    # Calculate total symbols across all sectors
    total_symbols = sum(
        len(buckets.get("large", [])) + len(buckets.get("mid", [])) + len(buckets.get("small", []))
        for sector in sectors_to_process
        if sector in sector_data
        for buckets in [sector_data[sector]]
    )

    mode = "Sequential" if args.sequential else f"Parallel ({args.workers} workers)"

    print("=" * 70)
    print(f"GENERATING PRECOMPUTED METRICS")
    print("=" * 70)
    print(f"  Sectors to process: {total_sectors}")
    print(f"  Total symbols:      {total_symbols:,}")
    print(f"  FastAPI URL:        {args.fastapi_base_url}")
    print(f"  Batch size:         {args.batch_size}")
    print(f"  Mode:               {mode}")
    if args.sequential:
        print(f"  Batch delay:        {args.batch_delay}s")
    print("=" * 70)
    print()

    start_time = time.time()
    successful_sectors = 0
    failed_sectors = 0

    for sector_idx, sector in enumerate(sectors_to_process, 1):
        if sector not in sector_data:
            print(f"[{sector_idx}/{total_sectors}] [skip] Sector '{sector}' not found in sector-stocks.json")
            continue

        buckets = sector_data[sector]
        symbols = sorted(
            {
                *(s.get("symbol", "").upper() for s in buckets.get("large", [])),
                *(s.get("symbol", "").upper() for s in buckets.get("mid", [])),
                *(s.get("symbol", "").upper() for s in buckets.get("small", [])),
            }
        )
        symbols = [s for s in symbols if s]

        if not symbols:
            print(f"[{sector_idx}/{total_sectors}] [skip] No symbols for sector '{sector}'")
            continue

        try:
            # Calculate overall progress
            overall_percent = ((sector_idx - 1) / total_sectors) * 100
            elapsed_total = time.time() - start_time
            avg_time_per_sector = elapsed_total / (sector_idx - 1) if sector_idx > 1 else 0
            eta_seconds = avg_time_per_sector * (total_sectors - sector_idx + 1)
            eta_minutes = eta_seconds / 60

            print(f"\n{'='*70}")
            print(f"[{sector_idx:2d}/{total_sectors}] Processing sector: '{sector}'")
            print(f"{'='*70}")
            print(f"  Symbols:          {len(symbols):,}")
            print(f"  Overall progress: {overall_percent:5.1f}%")
            if sector_idx > 1:
                print(f"  ETA remaining:    {eta_minutes:5.1f} min ({total_sectors - sector_idx + 1} sectors)")
            print()

            sector_start = time.time()

            # Adaptive batch sizing based on sector size
            adaptive_batch_size = args.batch_size
            if len(symbols) > 500:
                # Very large sectors: use smaller batches to prevent timeouts
                adaptive_batch_size = min(args.batch_size, 100)
                print(f"  [info] Large sector detected ({len(symbols)} symbols), using batch size: {adaptive_batch_size}")
            elif len(symbols) > 300:
                # Large sectors: use medium batches
                adaptive_batch_size = min(args.batch_size, 150)
                print(f"  [info] Medium-large sector ({len(symbols)} symbols), using batch size: {adaptive_batch_size}")
            
            if args.sequential:
                metrics = fetch_metrics_sequential(
                    args.fastapi_base_url,
                    symbols,
                    batch_size=adaptive_batch_size,
                    batch_delay=args.batch_delay,
                )
            else:
                metrics = fetch_metrics_parallel(
                    args.fastapi_base_url,
                    symbols,
                    batch_size=adaptive_batch_size,
                    max_workers=args.workers,
                    timeout=args.timeout,
                )

            sector_duration = time.time() - sector_start

            # Validate that we got metrics
            if not metrics:
                print(f"  {WARNING_MARK} WARNING: No metrics returned for sector '{sector}'")
                failed_sectors += 1
                continue

            # Count metrics with dividend yield and shares outstanding
            div_count = sum(1 for m in metrics if m.get("dividendYieldTTM") is not None)
            shares_count = sum(1 for m in metrics if m.get("sharesOutstanding") is not None)

            print(f"\n  {CHECK_MARK} Sector '{sector}' complete:")
            print(f"    Metrics fetched:       {len(metrics):,}")
            print(f"    With dividend yield:   {div_count:,}")
            print(f"    With shares outstanding: {shares_count:,}")
            print(f"    Duration:              {sector_duration:.1f}s ({sector_duration/60:.1f} min)")
            if sector_duration > 0:
                print(f"    Rate:                  {len(symbols)/sector_duration:.1f} symbols/s")

            output[sector] = {
                "metrics": metrics,
                "updated_at": datetime.utcnow().isoformat() + "Z",
                "schema_version": SCHEMA_VERSION,
                "symbol_count": len(metrics),
                "dividend_yield_count": div_count,
                "shares_outstanding_count": shares_count,
            }
            successful_sectors += 1

        except Exception as exc:
            print(f"  [error] Failed to fetch metrics for sector '{sector}': {exc}")
            failed_sectors += 1
            import traceback
            traceback.print_exc()

    total_duration = time.time() - start_time

    # Calculate totals (all sectors in output, not just processed ones)
    all_sectors = [k for k in output.keys() if k != "__meta__"]
    total_metrics = sum(len(output[s].get("metrics", [])) for s in all_sectors if s in output)
    total_div_count = sum(output[s].get("dividend_yield_count", 0) for s in all_sectors if s in output)
    total_shares_count = sum(output[s].get("shares_outstanding_count", 0) for s in all_sectors if s in output)

    # Write output file
    print(f"\n{'='*70}")
    print("Writing output file...")
    print(f"{'='*70}")
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{CHECK_MARK} Written: {OUTPUT_PATH}")

    print("\n" + "=" * 70)
    print(f"{CHECK_MARK} GENERATION COMPLETE!")
    print("=" * 70)
    print(f"  Successful sectors:  {successful_sectors:3d}/{total_sectors}")
    print(f"  Failed sectors:      {failed_sectors:3d}")
    print(f"  Total metrics:       {total_metrics:,}")
    print(f"  With dividend yield: {total_div_count:,}")
    print(f"  With shares:         {total_shares_count:,}")
    print(f"  Total duration:      {total_duration:.1f}s ({total_duration/60:.1f} min)")
    if total_metrics > 0 and total_duration > 0:
        print(f"  Average rate:        {total_metrics/total_duration:.1f} symbols/s")
    print(f"  Output file:         {OUTPUT_PATH}")
    print(f"  Schema version:      {SCHEMA_VERSION}")
    print("=" * 70)
    print()


if __name__ == "__main__":
    main()
