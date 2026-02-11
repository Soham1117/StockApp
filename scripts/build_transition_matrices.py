"""
Build transition probability matrices for RRG predictions.

This script:
1. Loads recalculated historical RRG data
2. Counts quadrant transitions over 30-day horizons
3. Calculates probability distributions
4. Saves to JSON cache for fast API lookups

Usage:
    python scripts/build_transition_matrices.py [--lookback 180] [--horizon 30]
    python scripts/build_transition_matrices.py --all [--horizon 30]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "fastapi_app"))

import argparse
import json
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List


DATA_DIR = Path(__file__).resolve().parents[1] / "fastapi_app" / "data"
LOOKBACK_PERIODS = [90, 180, 360, 720, 1800, 3600]

QUADRANTS = ["LEADING", "WEAKENING", "LAGGING", "IMPROVING"]


def load_rrg_history(lookback_days: int) -> List[Dict]:
    """Load recalculated RRG historical data."""
    input_file = DATA_DIR / f"rrg_history_{lookback_days}d.json"
    
    if not input_file.exists():
        print(f"[ERROR] RRG history file not found: {input_file}")
        print(f"[INFO] Run recalculate_rrg_history.py first")
        return []
    
    with open(input_file, "r") as f:
        data = json.load(f)
    
    return data.get("data", [])


def _output_file_for_lookback(lookback_days: int) -> Path:
    return DATA_DIR / f"rrg_transitions_{lookback_days}d.json"


def calculate_transitions(
    rrg_data: List[Dict],
    horizon_days: int
) -> Dict[str, Dict[str, Dict[str, int]]]:
    """
    Calculate transition counts for each symbol.
    
    Returns:
        Dict mapping symbol -> from_quadrant -> to_quadrant -> count
    """
    # Group by symbol
    by_symbol = defaultdict(list)
    for point in rrg_data:
        by_symbol[point["symbol"]].append(point)
    
    # Sort each symbol's data by date
    for symbol in by_symbol:
        by_symbol[symbol].sort(key=lambda x: x["date"])
    
    # Count transitions
    transitions = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    
    for symbol, points in by_symbol.items():
        for i in range(len(points)):
            current = points[i]
            current_date = datetime.strptime(current["date"], "%Y-%m-%d")
            target_date = current_date + timedelta(days=horizon_days)
            
            # Find point closest to target_date (within ±7 days)
            future_point = None
            min_diff = timedelta(days=999)
            
            for j in range(i + 1, len(points)):
                future = points[j]
                future_date = datetime.strptime(future["date"], "%Y-%m-%d")
                diff = abs(future_date - target_date)
                
                if diff < min_diff and diff <= timedelta(days=7):
                    min_diff = diff
                    future_point = future
                
                if future_date > target_date + timedelta(days=7):
                    break
            
            if future_point:
                from_quad = current["quadrant"]
                to_quad = future_point["quadrant"]
                transitions[symbol][from_quad][to_quad] += 1
    
    return transitions


def normalize_to_probabilities(
    transitions: Dict[str, Dict[str, Dict[str, int]]]
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """
    Convert transition counts to probabilities.
    
    Returns:
        Dict mapping symbol -> from_quadrant -> to_quadrant -> probability
    """
    probabilities = {}
    
    for symbol, from_quads in transitions.items():
        probabilities[symbol] = {}
        
        for from_quad, to_quads in from_quads.items():
            total = sum(to_quads.values())
            
            if total > 0:
                probabilities[symbol][from_quad] = {
                    to_quad: count / total
                    for to_quad, count in to_quads.items()
                }
            else:
                # Default to uniform distribution if no data
                probabilities[symbol][from_quad] = {
                    quad: 0.25 for quad in QUADRANTS
                }
    
    return probabilities


def _run_for_lookback(lookback_days: int, horizon_days: int) -> bool:
    print(f"\n{'='*60}")
    print("RRG Transition Probability Matrix Builder")
    print(f"{'='*60}")
    print(f"Lookback Period: {lookback_days} days")
    print(f"Prediction Horizon: {horizon_days} days")
    print(f"{'='*60}\n")
    
    # Load RRG history
    print("[1/3] Loading RRG historical data...")
    rrg_data = load_rrg_history(lookback_days)
    
    if not rrg_data:
        print("[ERROR] No RRG data loaded. Skipping.")
        return False
    
    symbols = sorted(set(point["symbol"] for point in rrg_data))
    print(f"[OK] Loaded {len(rrg_data)} data points for {len(symbols)} symbols\n")
    
    # Calculate transitions
    print("[2/3] Calculating transition counts...")
    transitions = calculate_transitions(rrg_data, horizon_days)
    
    # Show sample counts
    for symbol in list(symbols)[:3]:
        print(f"\n  {symbol} transition counts:")
        for from_quad in QUADRANTS:
            if from_quad in transitions[symbol]:
                counts = transitions[symbol][from_quad]
                total = sum(counts.values())
                print(f"    {from_quad:12} -> {dict(counts)} (total: {total})")
    
    print(f"\n[OK] Calculated transitions for {len(symbols)} symbols\n")
    
    # Normalize to probabilities
    print("[3/3] Normalizing to probabilities...")
    probabilities = normalize_to_probabilities(transitions)
    
    # Save results
    output_data = {
        "metadata": {
            "lookback_days": lookback_days,
            "horizon_days": horizon_days,
            "symbols": symbols,
            "generated_at": datetime.now().isoformat(),
            "method": "historical_frequency"
        },
        "transitions": probabilities
    }
    
    output_file = _output_file_for_lookback(lookback_days)
    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"[OK] Saved transition matrices to {output_file}")
    
    # Show sample probabilities
    print("\nSample transition probabilities:")
    for symbol in list(symbols)[:2]:
        print(f"\n  {symbol}:")
        for from_quad in QUADRANTS:
            if from_quad in probabilities[symbol]:
                probs = probabilities[symbol][from_quad]
                print(f"    {from_quad:12} -> ", end="")
                print(" | ".join([f"{q}: {p:.1%}" for q, p in sorted(probs.items())]))
    
    print(f"\n{'='*60}")
    print("Transition matrices built successfully!")
    print(f"Output file: {output_file}")
    print(f"{'='*60}\n")
    return True


def main():
    parser = argparse.ArgumentParser(description="Build RRG transition probability matrices")
    parser.add_argument("--lookback", type=int, default=180, help="Lookback period in days")
    parser.add_argument("--all", action="store_true", help="Build matrices for all standard lookbacks")
    parser.add_argument("--horizon", type=int, default=30, help="Prediction horizon in days")
    args = parser.parse_args()
    
    lookbacks = LOOKBACK_PERIODS if args.all else [args.lookback]
    if args.all:
        print(f"[INFO] Building transition matrices for lookbacks: {', '.join(str(x) for x in lookbacks)}")
    
    for lookback_days in lookbacks:
        _run_for_lookback(lookback_days, args.horizon)


if __name__ == "__main__":
    main()
