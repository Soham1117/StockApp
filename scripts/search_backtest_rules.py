#!/usr/bin/env python3
"""
Grid search backtest rules across sector/cap/holding-year combinations.

This uses the existing FastAPI backtest logic (imported directly),
and only varies the rule sets. To avoid rebalances, each run uses
years == holding_years so there is a single as_of point per combo.
"""

import argparse
import csv
import datetime as dt
import itertools
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Dict, Iterable, List, Optional, Tuple


DEFAULT_SECTOR_ALIASES = {
    "information technology": "Technology",
    "financials": "Financial Services",
    "consumer discretionary": "Consumer Cyclical",
    "consumer staples": "Consumer Defensive",
    "health care": "Healthcare",
    "materials": "Basic Materials",
}

FUNDAMENTAL_METRICS = ["pe", "ps", "pb", "ev_ebit", "ev_ebitda", "ev_sales"]
DEFAULT_OPERATORS = ["gt_zero", "lt_mean", "lt_median"]
_BACKTEST_CONTEXT: Dict[str, Any] = {}


def load_fastapi_backtest():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    fastapi_path = os.path.join(repo_root, "backend", "main.py")
    if not os.path.exists(fastapi_path):
        raise FileNotFoundError(f"backend/main.py not found at {fastapi_path}")

    fastapi_dir = os.path.join(repo_root, "backend")
    if fastapi_dir not in sys.path:
        sys.path.insert(0, fastapi_dir)

    import importlib.util

    spec = importlib.util.spec_from_file_location("fastapi_main", fastapi_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load FastAPI module spec.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[arg-type]
    return module


def load_sector_labels(repo_root: str) -> List[str]:
    sector_path = os.path.join(repo_root, "data", "sector-metrics.json")
    if not os.path.exists(sector_path):
        return []
    try:
        with open(sector_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return []
    labels = [k for k in payload.keys() if k != "__meta__"]
    return labels


def normalize_sector_labels(requested: List[str], available: List[str]) -> List[str]:
    if not requested:
        return []
    available_map = {s.lower(): s for s in available}
    normalized: List[str] = []
    for raw in requested:
        key = raw.strip().lower()
        if not key:
            continue
        alias = DEFAULT_SECTOR_ALIASES.get(key)
        candidate = alias or raw
        candidate_key = candidate.strip().lower()
        if candidate_key in available_map:
            normalized.append(available_map[candidate_key])
        else:
            normalized.append(raw)
    return normalized


def _ensure_backtest_context():
    if _BACKTEST_CONTEXT:
        return
    fastapi_main = load_fastapi_backtest()

    def _cache_wrapper(func, key_fn):
        cache: Dict[Any, Any] = {}

        def wrapped(*args, **kwargs):
            key = key_fn(*args, **kwargs)
            if key in cache:
                return cache[key]
            result = func(*args, **kwargs)
            cache[key] = result
            return result

        wrapped._cache = cache  # type: ignore[attr-defined]
        return wrapped

    def _symbols_key(symbols: List[str]) -> Tuple[str, ...]:
        try:
            return tuple(sorted(symbols))
        except Exception:
            return tuple(symbols)

    def _date_key(d: Any) -> str:
        try:
            return d.isoformat()
        except Exception:
            return str(d)

    if getattr(fastapi_main, "_query_latest_prices", None):
        fastapi_main._query_latest_prices = _cache_wrapper(
            fastapi_main._query_latest_prices,
            lambda symbols, as_of, **_kwargs: (_symbols_key(symbols), _date_key(as_of)),
        )
    if getattr(fastapi_main, "_query_latest_shares", None):
        fastapi_main._query_latest_shares = _cache_wrapper(
            fastapi_main._query_latest_shares,
            lambda symbols, as_of, **_kwargs: (_symbols_key(symbols), _date_key(as_of)),
        )
    if getattr(fastapi_main, "_query_split_events", None):
        fastapi_main._query_split_events = _cache_wrapper(
            fastapi_main._query_split_events,
            lambda symbols, start, end, **_kwargs: (_symbols_key(symbols), _date_key(start), _date_key(end)),
        )
    if getattr(fastapi_main, "_query_dividend_events", None):
        fastapi_main._query_dividend_events = _cache_wrapper(
            fastapi_main._query_dividend_events,
            lambda symbols, start, end, **_kwargs: (_symbols_key(symbols), _date_key(start), _date_key(end)),
        )
    if getattr(fastapi_main, "_query_latest_annual_items_aligned", None):
        def _key_aligned(*args, **kwargs):
            symbols = kwargs.get("symbols") if "symbols" in kwargs else args[0]
            cutoff = kwargs.get("cutoff") if "cutoff" in kwargs else args[1]
            income_items = kwargs.get("income_item_names") if "income_item_names" in kwargs else args[2]
            balance_items = kwargs.get("balance_item_names") if "balance_item_names" in kwargs else args[3]
            return (
                _symbols_key(symbols),
                _date_key(cutoff),
                tuple(income_items),
                tuple(balance_items),
            )

        fastapi_main._query_latest_annual_items_aligned = _cache_wrapper(
            fastapi_main._query_latest_annual_items_aligned,
            _key_aligned,
        )

    _BACKTEST_CONTEXT.update(
        {
            "BacktestSectorRequest": fastapi_main.BacktestSectorRequest,
            "BacktestRulesPayload": fastapi_main.BacktestRulesPayload,
            "ScreenerFiltersPayload": fastapi_main.ScreenerFiltersPayload,
            "FundamentalRulePayload": fastapi_main.FundamentalRulePayload,
            "backtest_sector": fastapi_main.backtest_sector,
            "HTTPException": fastapi_main.HTTPException,
        }
    )


def _run_combo(task: Tuple[str, str, int, str, List[Dict[str, str]], int, int, float]) -> Dict[str, Any]:
    _ensure_backtest_context()
    sector, cap, hold, rule_id, rules, top_n, lag_days, train_ratio = task
    years_for_run = hold

    BacktestSectorRequest = _BACKTEST_CONTEXT["BacktestSectorRequest"]
    BacktestRulesPayload = _BACKTEST_CONTEXT["BacktestRulesPayload"]
    ScreenerFiltersPayload = _BACKTEST_CONTEXT["ScreenerFiltersPayload"]
    FundamentalRulePayload = _BACKTEST_CONTEXT["FundamentalRulePayload"]
    backtest_sector = _BACKTEST_CONTEXT["backtest_sector"]
    HTTPException = _BACKTEST_CONTEXT["HTTPException"]

    rules_payload = BacktestRulesPayload(
        pe_positive=False,
        pe_below_universe_mean=False,
        fundamental_rules=[FundamentalRulePayload(**r) for r in rules],
    )
    filters_payload = ScreenerFiltersPayload(cap=cap)

    try:
        payload = BacktestSectorRequest(
            sector=sector,
            years=years_for_run,
            holding_years=hold,
            top_n=top_n,
            benchmark="SPY",
            fundamentals_lag_days=lag_days,
            rules=rules_payload,
            weights=None,
            filters=filters_payload,
        )
        result = backtest_sector(payload)
    except HTTPException as exc:
        return {
            "sector": sector,
            "cap": cap,
            "holding_years": hold,
            "years": years_for_run,
            "rule_id": rule_id,
            "error": str(exc.detail),
        }
    except Exception as exc:
        return {
            "sector": sector,
            "cap": cap,
            "holding_years": hold,
            "years": years_for_run,
            "rule_id": rule_id,
            "error": str(exc),
        }

    points = result.get("data") or []
    train_points, test_points = split_train_test(points, train_ratio)
    train_stats = compute_stats(train_points)
    test_stats = compute_stats(test_points)

    selected_by_point: List[Dict[str, Any]] = []
    tickers_used: List[str] = []
    tickers_set = set()
    for point in points:
        selected = point.get("selected") or []
        symbols = [
            s.get("symbol")
            for s in selected
            if isinstance(s, dict) and s.get("symbol") and s.get("total_return") is not None
        ]
        if symbols:
            selected_by_point.append(
                {
                    "as_of": point.get("as_of"),
                    "end_date": point.get("end_date"),
                    "symbols": symbols,
                }
            )
            tickers_set.update(symbols)
    if tickers_set:
        tickers_used = sorted(tickers_set)

    avg_filtered_size = None
    filtered_sizes = [
        p.get("filtered_size")
        for p in points
        if isinstance(p.get("filtered_size"), (int, float))
    ]
    if filtered_sizes:
        avg_filtered_size = sum(filtered_sizes) / len(filtered_sizes)

    return {
        "sector": sector,
        "cap": cap,
        "holding_years": hold,
        "years": years_for_run,
        "rule_id": rule_id,
        "rules": rules,
        "train_points": train_stats["count"],
        "test_points": test_stats["count"],
        "train_avg_portfolio": train_stats["avg_portfolio"],
        "train_avg_benchmark": train_stats["avg_benchmark"],
        "train_avg_excess": train_stats["avg_excess"],
        "train_win_rate": train_stats["win_rate"],
        "test_avg_portfolio": test_stats["avg_portfolio"],
        "test_avg_benchmark": test_stats["avg_benchmark"],
        "test_avg_excess": test_stats["avg_excess"],
        "test_win_rate": test_stats["win_rate"],
        "avg_filtered_size": avg_filtered_size,
        "points_total": len(points),
        "tickers_used": tickers_used,
        "selected_by_point": selected_by_point,
    }


def clamp_int(value: int, min_val: int, max_val: int) -> int:
    return max(min_val, min(max_val, int(value)))


def parse_csv_list(value: str) -> List[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def build_rule_sets(
    metrics: List[str],
    operators: List[str],
    max_metrics: int,
    max_rule_sets: Optional[int] = None,
) -> List[Tuple[str, List[Dict[str, str]]]]:
    rule_sets: List[Tuple[str, List[Dict[str, str]]]] = []
    max_metrics = clamp_int(max_metrics, 1, len(metrics))

    for size in range(1, max_metrics + 1):
        for metric_combo in itertools.combinations(metrics, size):
            for op_combo in itertools.product(operators, repeat=size):
                rules = [
                    {"metric": metric, "operator": op}
                    for metric, op in zip(metric_combo, op_combo)
                ]
                rule_id = "|".join([f"{r['metric']}:{r['operator']}" for r in rules])
                rule_sets.append((rule_id, rules))
                if max_rule_sets and len(rule_sets) >= max_rule_sets:
                    return rule_sets
    return rule_sets


def compute_stats(points: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    if not points:
        return {
            "avg_portfolio": None,
            "avg_benchmark": None,
            "avg_excess": None,
            "win_rate": None,
            "count": 0,
        }

    port = [
        p.get("portfolio_total_return")
        for p in points
        if isinstance(p.get("portfolio_total_return"), (int, float))
        and math.isfinite(p.get("portfolio_total_return"))
    ]
    bench = [
        p.get("benchmark_total_return")
        for p in points
        if isinstance(p.get("benchmark_total_return"), (int, float))
        and math.isfinite(p.get("benchmark_total_return"))
    ]

    if not port or not bench:
        return {
            "avg_portfolio": None,
            "avg_benchmark": None,
            "avg_excess": None,
            "win_rate": None,
            "count": len(points),
        }

    avg_port = sum(port) / len(port)
    avg_bench = sum(bench) / len(bench)
    wins = 0
    for p in points:
        ptf = p.get("portfolio_total_return")
        sp = p.get("benchmark_total_return")
        if isinstance(ptf, (int, float)) and isinstance(sp, (int, float)) and math.isfinite(ptf) and math.isfinite(sp):
            if ptf > sp:
                wins += 1
    win_rate = wins / len(points) if points else None

    return {
        "avg_portfolio": avg_port,
        "avg_benchmark": avg_bench,
        "avg_excess": avg_port - avg_bench,
        "win_rate": win_rate,
        "count": len(points),
    }


def _result_key(row: Dict[str, Any]) -> Tuple[str, str, int, str]:
    return (
        str(row.get("sector") or ""),
        str(row.get("cap") or ""),
        int(row.get("holding_years") or 0),
        str(row.get("rule_id") or ""),
    )


def _load_existing_results(path: str) -> List[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_outputs(csv_path: str, json_path: str, results: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    csv_tmp = f"{csv_path}.tmp"
    json_tmp = f"{json_path}.tmp" if json_path else ""

    with open(csv_tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in results:
            csv_row = {k: row.get(k) for k in fieldnames}
            if csv_row.get("tickers_used"):
                csv_row["tickers_used"] = ";".join(csv_row["tickers_used"])
            writer.writerow(csv_row)
    os.replace(csv_tmp, csv_path)

    if json_path:
        with open(json_tmp, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        os.replace(json_tmp, json_path)


def split_train_test(points: List[Dict[str, Any]], train_ratio: float) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if len(points) < 2:
        return points, []
    split_idx = max(1, int(len(points) * train_ratio))
    if split_idx >= len(points):
        split_idx = len(points) - 1
    return points[:split_idx], points[split_idx:]


def main() -> int:
    parser = argparse.ArgumentParser(description="Search backtest rules across sector/cap combos.")
    parser.add_argument(
        "--years",
        type=int,
        default=3,
        help="(Ignored) Single-point mode uses years == holding_years to avoid rebalances.",
    )
    parser.add_argument("--holding-years", default="1,2,3", help="Holding years list (default: 1,2,3).")
    parser.add_argument("--sectors", default="all", help="Comma list of sectors or 'all'.")
    parser.add_argument("--caps", default="large,mid,small", help="Comma list of caps (large,mid,small).")
    parser.add_argument("--top-n", type=int, default=10, help="Top N picks per run (default: 10).")
    parser.add_argument("--lag-days", type=int, default=90, help="Fundamentals lag days (default: 90).")
    parser.add_argument("--max-metrics", type=int, default=1, help="Max number of metrics per rule set.")
    parser.add_argument("--operators", default=",".join(DEFAULT_OPERATORS), help="Rule operators CSV.")
    parser.add_argument("--max-rule-sets", type=int, default=0, help="Limit total rule sets (0 = no limit).")
    parser.add_argument("--train-ratio", type=float, default=0.67, help="Train ratio for split (default: 0.67).")
    parser.add_argument("--workers", type=int, default=0, help="Parallel workers (0 = auto, 1 = disabled).")
    parser.add_argument("--chunksize", type=int, default=1, help="Task chunk size per worker (default: 1).")
    parser.add_argument("--checkpoint-every", type=int, default=100, help="Save results every N runs.")
    parser.add_argument("--resume", action="store_true", help="Resume from existing JSON output if present.")
    parser.add_argument("--out", default="", help="Output CSV path.")
    parser.add_argument("--json-out", default="", help="Output JSON path (optional).")

    args = parser.parse_args()

    _ = clamp_int(args.years, 1, 30)
    holding_years_list = [int(v) for v in parse_csv_list(args.holding_years)]
    caps = parse_csv_list(args.caps)
    operators = parse_csv_list(args.operators)
    max_rule_sets = args.max_rule_sets if args.max_rule_sets and args.max_rule_sets > 0 else None

    available_sectors = load_sector_labels(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    sectors_raw = available_sectors if args.sectors.lower() == "all" else parse_csv_list(args.sectors)
    sectors = normalize_sector_labels(sectors_raw, available_sectors) or sectors_raw
    if not sectors:
        print("No sectors provided.", file=sys.stderr)
        return 1

    rule_sets = build_rule_sets(FUNDAMENTAL_METRICS, operators, args.max_metrics, max_rule_sets)
    if not rule_sets:
        print("No rule sets generated.", file=sys.stderr)
        return 1

    out_dir = os.path.join(os.getcwd(), "reports")
    os.makedirs(out_dir, exist_ok=True)
    date_str = dt.datetime.utcnow().strftime("%Y%m%d")
    csv_path = args.out or os.path.join(out_dir, f"backtest_rule_search_{date_str}.csv")
    json_path = args.json_out or ""

    fieldnames = [
        "sector",
        "cap",
        "holding_years",
        "years",
        "rule_id",
        "train_points",
        "test_points",
        "train_avg_portfolio",
        "train_avg_benchmark",
        "train_avg_excess",
        "train_win_rate",
        "test_avg_portfolio",
        "test_avg_benchmark",
        "test_avg_excess",
        "test_win_rate",
        "avg_filtered_size",
        "points_total",
        "tickers_used",
        "error",
    ]

    results: List[Dict[str, Any]] = []
    completed: set[Tuple[str, str, int, str]] = set()
    if args.resume and json_path:
        results = _load_existing_results(json_path)
        completed = {_result_key(row) for row in results}
        if completed:
            print(f"[resume] Loaded {len(completed)} completed results from {json_path}")
    tasks: List[Tuple[str, str, int, str, List[Dict[str, str]], int, int, float]] = []
    for sector in sectors:
        for cap in caps:
            for hold in holding_years_list:
                for rule_id, rules in rule_sets:
                    key = (sector, cap, hold, rule_id)
                    if key in completed:
                        continue
                    tasks.append(
                        (sector, cap, hold, rule_id, rules, args.top_n, args.lag_days, args.train_ratio)
                    )
    tasks.sort(key=lambda t: (t[0], t[2], t[1], t[3]))

    total_runs = len(tasks)
    if total_runs == 0:
        if results and csv_path:
            _write_outputs(csv_path, json_path, results, fieldnames)
        print("No remaining tasks to run.")
        return 0

    workers = args.workers
    if workers <= 0:
        cpu_count = os.cpu_count() or 1
        workers = max(1, cpu_count - 1)

    if workers <= 1:
        _ensure_backtest_context()
        for run_idx, task in enumerate(tasks, start=1):
            sector, cap, hold, rule_id, _rules, _top_n, _lag_days, _ratio = task
            print(f"[{run_idx}/{total_runs}] sector={sector} cap={cap} hold={hold} rules={rule_id}")
            results.append(_run_combo(task))
            if args.checkpoint_every and run_idx % args.checkpoint_every == 0:
                _write_outputs(csv_path, json_path, results, fieldnames)
    else:
        chunksize = max(1, int(args.chunksize))
        with ProcessPoolExecutor(max_workers=workers) as executor:
            for run_idx, result in enumerate(executor.map(_run_combo, tasks, chunksize=chunksize), start=1):
                print(
                    f"[{run_idx}/{total_runs}] sector={result.get('sector')} cap={result.get('cap')} "
                    f"hold={result.get('holding_years')} rules={result.get('rule_id')}"
                )
                results.append(result)
                if args.checkpoint_every and run_idx % args.checkpoint_every == 0:
                    _write_outputs(csv_path, json_path, results, fieldnames)

    _write_outputs(csv_path, json_path, results, fieldnames)

    print(f"Saved CSV: {csv_path}")
    if json_path:
        print(f"Saved JSON: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
