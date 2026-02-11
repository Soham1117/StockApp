#!/usr/bin/env python3
"""
Auto-refresh generated data when defeatbeta-api publishes a new dataset.
Configured to always use local parquet files.

Logic:
1) Read defeatbeta_api.data_update_time (pulled from huggingface spec.json).
2) Compare against a local marker file (data/last_defeatbeta_update.json).
3) If different (or marker missing), run:
   - scripts/generate-universe.py
   - scripts/generate-sector-metrics.py (requires FastAPI running)
4) Persist the new update_time to the marker file on success.

Usage:
    python scripts/auto-refresh-data.py [--fastapi-base-url http://localhost:8000]
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Set environment variables for local setup
ROOT = Path(__file__).resolve().parent.parent
FASTAPI_DIR = ROOT / "fastapi_app"
LOCAL_DATA_DIR = FASTAPI_DIR / "local_data"

# Configure environment variables for local file usage
os.environ["DEFEATBETA_LOCAL_DATA"] = str(LOCAL_DATA_DIR)
os.environ.setdefault("FASTAPI_BASE_URL", "http://localhost:8000")
os.environ.setdefault("GENERATE_UNIVERSE_MAX_WORKERS", "16")
os.environ.setdefault("GENERATE_UNIVERSE_TIMEOUT", "300")  # 5 minutes for large batches
os.environ.setdefault("GENERATE_SECTOR_METRICS_BATCH_SIZE", "100")  # Reduced to prevent timeouts
os.environ.setdefault("GENERATE_SECTOR_METRICS_TIMEOUT", "1200")  # 20 minutes for large batches
os.environ.setdefault("GENERATE_SECTOR_METRICS_WORKERS", "4")
os.environ.setdefault("GENERATE_SECTOR_METRICS_BATCH_DELAY", "0")

try:
    from defeatbeta_api import data_update_time
except Exception as exc:  # pragma: no cover - runtime guard
    print(f"[auto-refresh] Failed to import defeatbeta_api: {exc}", file=sys.stderr)
    sys.exit(1)

MARKER_PATH = Path("data/last_defeatbeta_update.json")


def read_marker() -> Optional[str]:
    try:
        with MARKER_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
            return payload.get("data_update_time")
    except FileNotFoundError:
        return None
    except Exception as exc:
        print(f"[auto-refresh] Warning: failed to read marker: {exc}", file=sys.stderr)
        return None


def write_marker(update_time: str) -> None:
    MARKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MARKER_PATH.open("w", encoding="utf-8") as f:
        json.dump({"data_update_time": update_time}, f, indent=2)
        f.write("\n")


def run_script(cmd: list[str]) -> None:
    """Run a script with environment variables set."""
    print(f"[auto-refresh] Running: {' '.join(cmd)}")
    # Pass current environment (which includes our set variables) to subprocess
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=os.environ.copy())
    if proc.returncode != 0:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        raise RuntimeError(f"Command failed with code {proc.returncode}: {' '.join(cmd)}")
    if proc.stdout:
        print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Auto-refresh generated data when defeatbeta updates (local files only)")
    parser.add_argument(
        "--fastapi-base-url",
        default=os.environ["FASTAPI_BASE_URL"],
        help="FastAPI base URL for generate-sector-metrics.py",
    )
    args = parser.parse_args()
    
    # Update FASTAPI_BASE_URL if provided via command line
    if args.fastapi_base_url != os.environ["FASTAPI_BASE_URL"]:
        os.environ["FASTAPI_BASE_URL"] = args.fastapi_base_url

    # Verify local data directory exists
    if not LOCAL_DATA_DIR.exists():
        print(f"[auto-refresh] WARNING: Local data directory not found: {LOCAL_DATA_DIR}", file=sys.stderr)
        print(f"[auto-refresh] Please run scripts/download-parquet-data.ps1 first to download parquet files", file=sys.stderr)
        sys.exit(1)
    
    print(f"[auto-refresh] Using local data directory: {LOCAL_DATA_DIR}")
    print(f"[auto-refresh] FastAPI URL: {os.environ['FASTAPI_BASE_URL']}")
    print(f"[auto-refresh] Universe workers: {os.environ['GENERATE_UNIVERSE_MAX_WORKERS']}")
    print(f"[auto-refresh] Universe timeout: {os.environ['GENERATE_UNIVERSE_TIMEOUT']}s")
    print(f"[auto-refresh] Metrics batch size: {os.environ['GENERATE_SECTOR_METRICS_BATCH_SIZE']} (adaptive for large sectors)")
    print(f"[auto-refresh] Metrics timeout: {os.environ['GENERATE_SECTOR_METRICS_TIMEOUT']}s ({int(os.environ['GENERATE_SECTOR_METRICS_TIMEOUT'])/60:.1f} min)")
    print(f"[auto-refresh] Metrics workers: {os.environ['GENERATE_SECTOR_METRICS_WORKERS']}")
    print()

    current = data_update_time
    previous = read_marker()

    print(f"[auto-refresh] defeatbeta_api data_update_time: {current}")
    if previous:
        print(f"[auto-refresh] last processed data_update_time: {previous}")

    if previous == current:
        print("[auto-refresh] Data is already up to date. Nothing to do.")
        return

    try:
        # Regenerate universe (stocks.json -> ticker-universe/sector-stocks)
        print("[auto-refresh] Step 1/2: Generating ticker universe and sector stocks...")
        run_script([sys.executable, "scripts/generate-universe.py"])

        # Regenerate sector metrics (requires FastAPI running)
        print("[auto-refresh] Step 2/2: Generating sector metrics...")
        run_script([
            sys.executable, 
            "scripts/generate-sector-metrics.py", 
            "--fastapi-base-url", 
            os.environ["FASTAPI_BASE_URL"]
        ])

        # Persist marker
        write_marker(current)
        print(f"[auto-refresh] ✓ Updated marker to {current}")
        print("[auto-refresh] ✓ Data refresh complete!")
    except Exception as exc:
        print(f"[auto-refresh] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":  # pragma: no cover
    main()
