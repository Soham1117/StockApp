#!/usr/bin/env python3
"""
Select top N stocks per sector and market-cap bucket based on a
composite score designed to capture "best risk/reward within a sector"
using valuation, growth, quality, financial health, and cash-flow metrics.

Inputs:
- data/sector-stocks.json   (unfiltered buckets for each sector)
- data/sector-metrics.json  (full metric set per symbol & sector)

Output:
- data/sector-stocks-top30.json
  For each sector:
    - large: top N symbols by composite score
    - mid:   top N symbols by composite score
    - small: top N symbols by composite score

By default N = 10 (so 30 per sector).
"""

import argparse
import bisect
import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple

SECTOR_STOCKS_PATH = os.path.join("data", "sector-stocks.json")
SECTOR_METRICS_PATH = os.path.join("data", "sector-metrics.json")
OUTPUT_PATH = os.path.join("data", "sector-stocks-top30.json")


MetricSpec = Dict[str, Any]


# Metric recipe: what we use to rank "best risk/reward" within a sector.
# Each metric is used via a percentile within its sector, then weighted.
# For metrics where lower is better (e.g. P/E), we invert the percentile.
METRIC_SPECS: List[MetricSpec] = [
  # Valuation: lower is better
  {"name": "peRatioTTM", "path": ["peRatioTTM"], "higher_is_better": False, "weight": 1.0},
  {"name": "priceToSalesRatioTTM", "path": ["priceToSalesRatioTTM"], "higher_is_better": False, "weight": 0.7},
  {"name": "priceToBookRatioTTM", "path": ["priceToBookRatioTTM"], "higher_is_better": False, "weight": 0.7},
  {"name": "enterpriseValueOverEBITTTM", "path": ["enterpriseValueOverEBITTTM"], "higher_is_better": False, "weight": 1.0},
  {"name": "enterpriseValueOverEBITDATTM", "path": ["enterpriseValueOverEBITDATTM"], "higher_is_better": False, "weight": 0.7},
  {"name": "enterpriseValueToSalesTTM", "path": ["enterpriseValueToSalesTTM"], "higher_is_better": False, "weight": 0.5},
  # Dividend yield: higher is better, but modest weight to avoid yield traps
  {"name": "dividendYieldTTM", "path": ["dividendYieldTTM"], "higher_is_better": True, "weight": 0.4},
  # PEG: lower is better
  {"name": "valuationExtras.pegRatio", "path": ["valuationExtras", "pegRatio"], "higher_is_better": False, "weight": 0.7},

  # Growth: higher is better
  {"name": "growth.revenueGrowthTTM", "path": ["growth", "revenueGrowthTTM"], "higher_is_better": True, "weight": 1.0},
  {"name": "growth.epsGrowthTTM", "path": ["growth", "epsGrowthTTM"], "higher_is_better": True, "weight": 1.0},
  {"name": "growth.ebitGrowthTTM", "path": ["growth", "ebitGrowthTTM"], "higher_is_better": True, "weight": 0.7},
  {"name": "growth.fcfGrowthTTM", "path": ["growth", "fcfGrowthTTM"], "higher_is_better": True, "weight": 0.5},

  # Quality / profitability: higher is better
  {"name": "profitability.roic", "path": ["profitability", "roic"], "higher_is_better": True, "weight": 1.0},
  {"name": "profitability.roe", "path": ["profitability", "roe"], "higher_is_better": True, "weight": 0.5},
  {"name": "profitability.operatingMargin", "path": ["profitability", "operatingMargin"], "higher_is_better": True, "weight": 0.7},
  {"name": "profitability.netMargin", "path": ["profitability", "netMargin"], "higher_is_better": True, "weight": 0.5},

  # Financial health
  {"name": "financialHealth.debtToEquity", "path": ["financialHealth", "debtToEquity"], "higher_is_better": False, "weight": 0.7},
  {"name": "financialHealth.interestCoverage", "path": ["financialHealth", "interestCoverage"], "higher_is_better": True, "weight": 0.7},

  # Cash-flow & yield
  {"name": "cashFlow.fcfMargin", "path": ["cashFlow", "fcfMargin"], "higher_is_better": True, "weight": 0.7},
  {"name": "cashFlow.fcfYield", "path": ["cashFlow", "fcfYield"], "higher_is_better": True, "weight": 1.0},
  {"name": "financialHealth.ocfToDebt", "path": ["financialHealth", "ocfToDebt"], "higher_is_better": True, "weight": 0.5},
]


def load_json(path: str) -> Dict[str, Any]:
  if not os.path.exists(path):
    raise FileNotFoundError(f"{path} not found")
  with open(path, "r", encoding="utf-8") as f:
    return json.load(f)


def _get_nested_value(obj: Dict[str, Any], path: List[str]) -> Optional[float]:
  cur: Any = obj
  for key in path:
    if not isinstance(cur, dict) or key not in cur:
      return None
    cur = cur[key]
  try:
    if cur is None:
      return None
    val = float(cur)
    if not math.isfinite(val):
      return None
    return val
  except (TypeError, ValueError):
    return None


def _build_metric_distributions(metrics_list: List[Dict[str, Any]]) -> Dict[str, List[float]]:
  """
  For a given sector's metrics list, build sorted value lists per metric name.
  """
  distributions: Dict[str, List[float]] = {spec["name"]: [] for spec in METRIC_SPECS}

  for m in metrics_list:
    for spec in METRIC_SPECS:
      val = _get_nested_value(m, spec["path"])
      if val is not None:
        distributions[spec["name"]].append(val)

  # Sort and de-duplicate per metric for percentile computation
  for name, values in distributions.items():
    if values:
      # Use sorted unique values to make percentile computation stable
      uniq = sorted(set(values))
      distributions[name] = uniq

  return distributions


def _percentile_rank(sorted_values: List[float], value: float) -> Optional[float]:
  """
  Compute a simple percentile rank in [0, 1] for `value` within `sorted_values`.
  Returns None if distribution is empty.
  """
  if not sorted_values:
    return None
  if len(sorted_values) == 1:
    return 0.5

  # Clamp value inside min/max to avoid weird percentiles for outliers
  lo = sorted_values[0]
  hi = sorted_values[-1]
  if value <= lo:
    return 0.0
  if value >= hi:
    return 1.0

  idx = bisect.bisect_left(sorted_values, value)
  # Normalize index to [0,1]
  return idx / (len(sorted_values) - 1)


def _compute_composite_score(
  metrics_obj: Dict[str, Any],
  distributions: Dict[str, List[float]],
) -> float:
  """
  Compute a composite score in [0, 100] for a single stock in a sector.

  - For each metric spec:
      - Get percentile p in [0,1] within sector.
      - If higher_is_better: contribution = p * weight.
      - If lower_is_better:  contribution = (1 - p) * weight.
  - Normalize by the sum of weights for which we actually have data.
  """
  total_weight = 0.0
  weighted_sum = 0.0

  for spec in METRIC_SPECS:
    name = spec["name"]
    path = spec["path"]
    higher_is_better = bool(spec["higher_is_better"])
    weight = float(spec["weight"])

    dist = distributions.get(name) or []
    if not dist:
      continue

    val = _get_nested_value(metrics_obj, path)
    if val is None:
      continue

    p = _percentile_rank(dist, val)
    if p is None:
      continue

    contribution = p if higher_is_better else (1.0 - p)
    weighted_sum += contribution * weight
    total_weight += weight

  if total_weight == 0.0:
    return 0.0

  # Scale to [0, 100] for readability
  score = (weighted_sum / total_weight) * 100.0
  return float(score)


def build_score_index(sector_metrics: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
  """
  Build an index: sector -> symbol -> composite score,
  using the metric recipe defined in METRIC_SPECS.
  """
  index: Dict[str, Dict[str, float]] = {}

  for sector, entry in sector_metrics.items():
    if sector.startswith("__"):
      # Skip __meta__ entry
      continue

    metrics_list: List[Dict[str, Any]] = entry.get("metrics", [])
    if not metrics_list:
      continue

    # Precompute distributions for this sector
    distributions = _build_metric_distributions(metrics_list)

    symbol_scores: Dict[str, float] = {}

    for m in metrics_list:
      symbol = (m.get("symbol") or "").upper()
      if not symbol:
        continue

      score = _compute_composite_score(m, distributions)
      symbol_scores[symbol] = score

    index[sector] = symbol_scores

  return index


def select_top_for_sector(
  sector: str,
  buckets: Dict[str, List[Dict[str, Any]]],
  scores: Dict[str, float],
  top_n: int,
) -> Dict[str, List[Dict[str, Any]]]:
  """
  For a given sector:
  - Take existing large/mid/small buckets from sector-stocks.json
  - Rank symbols in each bucket by composite score (desc)
  - Return top_n per bucket (if fewer than top_n exist, keep all)
  """
  result: Dict[str, List[Dict[str, Any]]] = {}

  for bucket_name in ("large", "mid", "small"):
    stocks = buckets.get(bucket_name, []) or []

    # Attach score for sorting; missing scores go to the bottom
    scored: List[Dict[str, Any]] = []
    for stock in stocks:
      symbol = (stock.get("symbol") or "").upper()
      score = scores.get(symbol)
      stock_copy = dict(stock)  # avoid mutating original structure
      stock_copy["_score"] = score
      scored.append(stock_copy)

    # Sort: higher score first; None scores last
    scored.sort(
      key=lambda s: (-s["_score"], s.get("symbol", ""))
      if isinstance(s.get("_score"), (int, float))
      else (float("inf"), s.get("symbol", ""))
    )

    # Take top N with a real score first
    top: List[Dict[str, Any]] = []
    for stock in scored:
      if len(top) >= top_n:
        break
      if not isinstance(stock.get("_score"), (int, float)):
        # Skip stocks without a score for the primary top-N list
        continue
      # Strip helper field
      stock.pop("_score", None)
      top.append(stock)

    # If we have fewer than top_n and there are unscored stocks,
    # we can optionally backfill them (keep deterministic order).
    if len(top) < top_n:
      for stock in scored:
        if len(top) >= top_n:
          break
        if isinstance(stock.get("_score"), (int, float)):
          # Already included above
          continue
        stock.pop("_score", None)
        top.append(stock)

    result[bucket_name] = top

  return result


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Select top N stocks per sector & bucket based on 6-fundamentals score"
  )
  parser.add_argument(
    "--top-per-bucket",
    type=int,
    default=10,
    help="Number of stocks per market-cap bucket to keep (default: 10)",
  )
  parser.add_argument(
    "--output",
    default=OUTPUT_PATH,
    help=f"Output path for selected stocks (default: {OUTPUT_PATH})",
  )
  args = parser.parse_args()

  print("Loading input files...")
  sector_stocks = load_json(SECTOR_STOCKS_PATH)
  sector_metrics = load_json(SECTOR_METRICS_PATH)

  print("Building score index (sector -> symbol -> score)...")
  score_index = build_score_index(sector_metrics)

  sectors = sorted(k for k in sector_stocks.keys() if not k.startswith("__"))
  print(f"Sectors in sector-stocks.json: {len(sectors)}")

  output: Dict[str, Any] = {}
  total_kept = 0

  for sector in sectors:
    buckets = sector_stocks.get(sector, {})
    scores = score_index.get(sector, {})

    if not buckets or not scores:
      print(f"  [warn] Sector '{sector}': missing buckets or scores, skipping")
      continue

    print(f"  Processing sector '{sector}'...")
    selected = select_top_for_sector(sector, buckets, scores, args.top_per_bucket)

    # Count totals
    sector_count = sum(len(selected[b]) for b in ("large", "mid", "small"))
    total_kept += sector_count

    output[sector] = selected
    print(
      f"    Kept {sector_count} stocks "
      f"({len(selected['large'])} large, {len(selected['mid'])} mid, {len(selected['small'])} small)"
    )

  # Carry over meta if present
  meta = sector_metrics.get("__meta__") or sector_stocks.get("__meta__")
  if meta:
    output["__meta__"] = {
      **meta,
      "top_per_bucket": args.top_per_bucket,
      "source_stocks_file": SECTOR_STOCKS_PATH,
      "source_metrics_file": SECTOR_METRICS_PATH,
    }

  os.makedirs(os.path.dirname(args.output), exist_ok=True)
  with open(args.output, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
    f.write("\n")

  print()
  print(f"✓ Wrote top-per-bucket selection to: {args.output}")
  print(f"  Total stocks kept: {total_kept}")
  print(f"  Top per bucket:   {args.top_per_bucket}")


if __name__ == "__main__":
  main()


