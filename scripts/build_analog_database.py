"""
Build historical analog database for RRG predictions.

This script:
1. Loads recalculated historical RRG data
2. Creates spatial index (KD-tree) for fast similarity search
3. Stores each historical state with its 30-day outcome
4. Saves to pickle file for fast API lookups

Usage:
    python scripts/build_analog_database.py [--lookback 180]
    python scripts/build_analog_database.py --all
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "fastapi_app"))

import argparse
import json
import pickle
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import numpy as np
from scipy.spatial import KDTree


DATA_DIR = Path(__file__).resolve().parents[1] / "fastapi_app" / "data"
LOOKBACK_PERIODS = [90, 180, 360, 720, 1800, 3600]


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
    return DATA_DIR / f"rrg_analogs_{lookback_days}d.pkl"


def build_analog_database(
    rrg_data: List[Dict],
    horizon_days: int = 30
) -> Dict[str, Dict]:
    """
    Build analog database with spatial index for each symbol.
    
    Returns:
        Dict mapping symbol -> {
            "tree": KDTree,
            "states": List of (rsRatio, rsMomentum, date, quadrant),
            "outcomes": List of outcome states 30 days later
        }
    """
    # Group by symbol
    by_symbol = {}
    
    for point in rrg_data:
        symbol = point["symbol"]
        if symbol not in by_symbol:
            by_symbol[symbol] = []
        by_symbol[symbol].append(point)
    
    # Sort each symbol's data by date
    for symbol in by_symbol:
        by_symbol[symbol].sort(key=lambda x: x["date"])
    
    # Build spatial index for each symbol
    analog_db = {}
    
    for symbol, points in by_symbol.items():
        states = []
        outcomes = []
        coordinates = []
        
        for i in range(len(points)):
            current = points[i]
            current_date = datetime.strptime(current["date"], "%Y-%m-%d")
            target_date = current_date + timedelta(days=horizon_days)
            
            # Find outcome 30 days later
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
                # Store state
                states.append({
                    "date": current["date"],
                    "rsRatio": current["rsRatio"],
                    "rsMomentum": current["rsMomentum"],
                    "quadrant": current["quadrant"]
                })
                
                # Store outcome
                outcomes.append({
                    "date": future_point["date"],
                    "rsRatio": future_point["rsRatio"],
                    "rsMomentum": future_point["rsMomentum"],
                    "quadrant": future_point["quadrant"]
                })
                
                # Store coordinates for KDTree
                coordinates.append([
                    current["rsRatio"],
                    current["rsMomentum"]
                ])
        
        if coordinates:
            # Build KDTree for fast nearest neighbor search
            tree = KDTree(np.array(coordinates))
            
            analog_db[symbol] = {
                "tree": tree,
                "states": states,
                "outcomes": outcomes,
                "n_samples": len(states)
            }
    
    return analog_db


def test_analog_search(analog_db: Dict, symbol: str, n_analogs: int = 5):
    """Test analog search for a sample query."""
    if symbol not in analog_db:
        print(f"[WARN] No analog data for {symbol}")
        return
    
    db = analog_db[symbol]
    
    # Use the most recent state as query
    query_state = db["states"][-1]
    query_point = [query_state["rsRatio"], query_state["rsMomentum"]]
    
    # Find nearest neighbors
    distances, indices = db["tree"].query([query_point], k=min(n_analogs, len(db["states"])))
    
    print(f"\n  Query: {symbol} on {query_state['date']}")
    print(f"    RS-Ratio: {query_state['rsRatio']:.2f}, RS-Momentum: {query_state['rsMomentum']:.2f}")
    print(f"    Quadrant: {query_state['quadrant']}")
    print(f"\n  Top {len(indices[0])} historical analogs:")
    
    for i, (dist, idx) in enumerate(zip(distances[0], indices[0]), 1):
        analog_state = db["states"][idx]
        analog_outcome = db["outcomes"][idx]
        
        print(f"\n    {i}. {analog_state['date']} (similarity: {1 / (1 + dist):.3f})")
        print(f"       Initial: RS-Ratio={analog_state['rsRatio']:.2f}, RS-Momentum={analog_state['rsMomentum']:.2f}, {analog_state['quadrant']}")
        print(f"       Outcome: RS-Ratio={analog_outcome['rsRatio']:.2f}, RS-Momentum={analog_outcome['rsMomentum']:.2f}, {analog_outcome['quadrant']}")


def _run_for_lookback(lookback_days: int, horizon_days: int) -> bool:
    print(f"\n{'='*60}")
    print("RRG Historical Analog Database Builder")
    print(f"{'='*60}")
    print(f"Lookback Period: {lookback_days} days")
    print(f"Outcome Horizon: {horizon_days} days")
    print(f"{'='*60}\n")
    
    # Load RRG history
    print("[1/3] Loading RRG historical data...")
    rrg_data = load_rrg_history(lookback_days)
    
    if not rrg_data:
        print("[ERROR] No RRG data loaded. Skipping.")
        return False
    
    symbols = sorted(set(point["symbol"] for point in rrg_data))
    print(f"[OK] Loaded {len(rrg_data)} data points for {len(symbols)} symbols\n")
    
    # Build analog database
    print("[2/3] Building spatial index for analog matching...")
    analog_db = build_analog_database(rrg_data, horizon_days)
    
    print(f"[OK] Built analog database for {len(analog_db)} symbols")
    for symbol in symbols:
        if symbol in analog_db:
            n = analog_db[symbol]["n_samples"]
            print(f"  {symbol}: {n} historical states indexed")
    
    # Test analog search
    print("\n[3/3] Testing analog search...")
    for symbol in list(symbols)[:2]:
        test_analog_search(analog_db, symbol, n_analogs=3)
    
    # Save to pickle
    print("\nSaving analog database...")
    output_data = {
        "metadata": {
            "lookback_days": lookback_days,
            "horizon_days": horizon_days,
            "symbols": symbols,
            "generated_at": datetime.now().isoformat(),
            "method": "kdtree_spatial_index"
        },
        "analog_db": analog_db
    }
    
    output_file = _output_file_for_lookback(lookback_days)
    with open(output_file, "wb") as f:
        pickle.dump(output_data, f)
    
    print(f"[OK] Saved analog database to {output_file}")
    print(f"     File size: {output_file.stat().st_size / 1024:.1f} KB")
    
    print(f"\n{'='*60}")
    print("Analog database built successfully!")
    print(f"Output file: {output_file}")
    print(f"{'='*60}\n")
    return True


def main():
    parser = argparse.ArgumentParser(description="Build RRG historical analog database")
    parser.add_argument("--lookback", type=int, default=180, help="Lookback period in days")
    parser.add_argument("--all", action="store_true", help="Build analogs for all standard lookbacks")
    parser.add_argument("--horizon", type=int, default=30, help="Outcome horizon in days")
    args = parser.parse_args()
    
    lookbacks = LOOKBACK_PERIODS if args.all else [args.lookback]
    if args.all:
        print(f"[INFO] Building analog databases for lookbacks: {', '.join(str(x) for x in lookbacks)}")
    
    for lookback_days in lookbacks:
        _run_for_lookback(lookback_days, args.horizon)


if __name__ == "__main__":
    main()
