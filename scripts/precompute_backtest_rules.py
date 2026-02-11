#!/usr/bin/env python3
"""
Precompute all backtest rule combinations in one run and store results.

This is a thin wrapper around scripts/search_backtest_rules.py that writes
fixed outputs into fastapi_app/data so the UI can load them later.
"""

import argparse
import importlib
import os
import sys
from typing import List


def _load_search_module():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    scripts_dir = os.path.join(repo_root, "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    return importlib.import_module("search_backtest_rules")


def _build_args(data_dir: str, extra_args: List[str]) -> List[str]:
    csv_path = os.path.join(data_dir, "backtest_rule_search.csv")
    json_path = os.path.join(data_dir, "backtest_rule_search.json")
    base_args = [
        "--out",
        csv_path,
        "--json-out",
        json_path,
    ]
    return base_args + extra_args


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Precompute backtest rule combinations and store results in fastapi_app/data."
    )
    parser.add_argument(
        "--data-dir",
        default="",
        help="Output directory for results (default: fastapi_app/data).",
    )
    args, extra_args = parser.parse_known_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_dir = args.data_dir or os.path.join(repo_root, "fastapi_app", "data")
    os.makedirs(data_dir, exist_ok=True)

    search_module = _load_search_module()
    run_args = _build_args(data_dir, extra_args)

    old_argv = sys.argv[:]
    try:
        sys.argv = [sys.argv[0]] + run_args
        return int(search_module.main())
    finally:
        sys.argv = old_argv


if __name__ == "__main__":
    raise SystemExit(main())
