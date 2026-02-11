"""
Train ARIMA models for RRG predictions.
Loads historical RRG data and trains models for each sector and metric.

Run from project root:
  python scripts/train_rrg_models.py [--lookback 180]

Dependencies:
  pip install statsmodels pandas numpy scikit-learn
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Add project root to Python path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi_app.rrg_arima import train_all_models


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RRG_HISTORY_PATH = DATA_DIR / "rrg-history.json"
MODELS_METADATA_PATH = DATA_DIR / "rrg-models-metadata.json"


def main():
    """Main function to train ARIMA models."""
    # Parse lookback period from command line
    lookback_days = 180
    if "--lookback" in sys.argv:
        idx = sys.argv.index("--lookback")
        if idx + 1 < len(sys.argv):
            try:
                lookback_days = int(sys.argv[idx + 1])
            except ValueError:
                print(f"Invalid lookback value: {sys.argv[idx + 1]}")
                return
    
    print(f"[train-models] Training ARIMA models for lookback={lookback_days}d")
    
    # Load historical RRG data
    if not RRG_HISTORY_PATH.exists():
        print(f"[train-models] ERROR: RRG history file not found: {RRG_HISTORY_PATH}")
        print("[train-models] Run scripts/generate_rrg_history.py first")
        return
    
    with open(RRG_HISTORY_PATH, "r", encoding="utf-8") as f:
        history_data = json.load(f)
    
    historical_points = history_data.get("data", [])
    
    if not historical_points:
        print("[train-models] ERROR: No historical RRG data found")
        return
    
    print(f"[train-models] Loaded {len(historical_points)} historical RRG data points")
    
    # Train models
    models_info = train_all_models(historical_points, lookback_days=lookback_days)
    
    # Save metadata
    metadata = {
        "lookback_days": lookback_days,
        "trained_at": __import__("datetime").datetime.now().isoformat(),
        "total_models": len(models_info),
        "models": models_info,
    }
    
    MODELS_METADATA_PATH.write_text(
        json.dumps(metadata, indent=2, sort_keys=True),
        encoding="utf-8"
    )
    
    print(f"\n[train-models] ✓ Trained {len(models_info)} models")
    print(f"[train-models] ✓ Saved metadata to {MODELS_METADATA_PATH}")
    
    # Print summary
    print("\n[train-models] Model Summary:")
    for key, info in sorted(models_info.items()):
        print(f"  {key:20s}: AIC={info['aic']:8.2f}, MAE={info['mae']:6.2f}, RMSE={info['rmse']:6.2f}")


if __name__ == "__main__":
    main()

