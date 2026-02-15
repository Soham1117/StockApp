"""
RRG Hybrid Prediction Module.

Replaces ARIMA with probabilistic predictions using:
1. Transition probabilities (historical quadrant transitions)
2. Historical analogs (similar past RRG states)

This provides honest uncertainty estimates instead of false precision.
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import math


DATA_DIR = Path(__file__).resolve().parent / "data"


def _transitions_file(lookback_days: int) -> Path:
    return DATA_DIR / f"rrg_transitions_{lookback_days}d.json"


def _analogs_file(lookback_days: int) -> Path:
    return DATA_DIR / f"rrg_analogs_{lookback_days}d.pkl"


def load_transition_probabilities(lookback_days: int) -> Dict:
    """Load pre-computed transition probability matrices."""
    transitions_file = _transitions_file(lookback_days)
    if not transitions_file.exists():
        fallback = DATA_DIR / "rrg_transitions.json"
        if fallback.exists():
            transitions_file = fallback
        else:
            print(f"[WARN] Transition probabilities not found: {transitions_file}")
            print("[INFO] Run scripts/build_transition_matrices.py first")
            return {}
    
    with open(transitions_file, "r") as f:
        data = json.load(f)
    
    return data.get("transitions", {})


def load_analog_database(lookback_days: int) -> Dict:
    """Load pre-computed historical analog database."""
    analogs_file = _analogs_file(lookback_days)
    if not analogs_file.exists():
        fallback = DATA_DIR / "rrg_analogs.pkl"
        if fallback.exists():
            analogs_file = fallback
        else:
            print(f"[WARN] Analog database not found: {analogs_file}")
            print("[INFO] Run scripts/build_analog_database.py first")
            return {}
    
    with open(analogs_file, "rb") as f:
        data = pickle.load(f)
    
    return data.get("analog_db", {})


def calculate_transition_probabilities(
    symbol: str,
    current_quadrant: str,
    lookback_days: int = 180
) -> Dict[str, float]:
    """
    Get transition probabilities for a symbol from its current quadrant.
    
    Args:
        symbol: ETF symbol (e.g., "XLK")
        current_quadrant: Current quadrant ("LEADING", "WEAKENING", etc.)
        lookback_days: Lookback period used for RRG calculation
    
    Returns:
        Dict mapping quadrant -> probability
    """
    transitions = load_transition_probabilities(lookback_days)
    
    # Try to find exact match
    key = f"{symbol}_{lookback_days}d"
    if symbol in transitions and current_quadrant in transitions[symbol]:
        return transitions[symbol][current_quadrant]
    
    # Fallback to uniform distribution
    return {
        "LEADING": 0.25,
        "WEAKENING": 0.25,
        "LAGGING": 0.25,
        "IMPROVING": 0.25
    }


def find_historical_analogs(
    symbol: str,
    current_state: Dict,
    n_analogs: int = 5,
    lookback_days: int = 180,
) -> List[Dict]:
    """
    Find historical RRG states similar to the current state.
    
    Args:
        symbol: ETF symbol
        current_state: Dict with rsRatio, rsMomentum, quadrant
        n_analogs: Number of analogs to return
    
    Returns:
        List of historical analogs with similarity scores and outcomes
    """
    analog_db = load_analog_database(lookback_days)
    
    if symbol not in analog_db:
        print(f"[WARN] No analog data for {symbol}")
        return []
    
    db = analog_db[symbol]
    query_point = [current_state["rsRatio"], current_state["rsMomentum"]]
    
    # Find nearest neighbors using KD-tree
    try:
        distances, indices = db["tree"].query([query_point], k=min(n_analogs, len(db["states"])))
    except Exception as e:
        print(f"[ERROR] Analog search failed for {symbol}: {e}")
        return []
    
    # Build result list
    analogs = []
    for dist, idx in zip(distances[0], indices[0]):
        analog_state = db["states"][idx]
        analog_outcome = db["outcomes"][idx]
        
        # Calculate similarity score (0-1, higher is more similar)
        similarity = 1.0 / (1.0 + dist)
        
        analogs.append({
            "date": analog_state["date"],
            "similarity": round(similarity, 3),
            "initial_state": {
                "rsRatio": analog_state["rsRatio"],
                "rsMomentum": analog_state["rsMomentum"],
                "quadrant": analog_state["quadrant"]
            },
            "outcome_30d": {
                "rsRatio": analog_outcome["rsRatio"],
                "rsMomentum": analog_outcome["rsMomentum"],
                "quadrant": analog_outcome["quadrant"]
            }
        })
    
    return analogs


def generate_hybrid_prediction(
    symbol: str,
    current_state: Dict,
    lookback_days: int = 180,
    n_analogs: int = 5
) -> Dict:
    """
    Generate hybrid prediction combining transition probabilities and historical analogs.
    
    Args:
        symbol: ETF symbol
        current_state: Dict with rsRatio, rsMomentum, quadrant
        lookback_days: Lookback period used for RRG calculation
        n_analogs: Number of historical analogs to include
    
    Returns:
        Dict with transition probabilities, historical analogs, and disclaimer
    """
    # Get transition probabilities
    transition_probs = calculate_transition_probabilities(
        symbol,
        current_state["quadrant"],
        lookback_days
    )
    
    # Find historical analogs
    analogs = find_historical_analogs(symbol, current_state, n_analogs, lookback_days)
    
    # Calculate average outcome from analogs (for context)
    if analogs:
        avg_outcome_ratio = sum(a["outcome_30d"]["rsRatio"] for a in analogs) / len(analogs)
        avg_outcome_momentum = sum(a["outcome_30d"]["rsMomentum"] for a in analogs) / len(analogs)
        ratio_values = [a["outcome_30d"]["rsRatio"] for a in analogs]
        momentum_values = [a["outcome_30d"]["rsMomentum"] for a in analogs]
        ratio_range = {"lower": min(ratio_values), "upper": max(ratio_values)}
        momentum_range = {"lower": min(momentum_values), "upper": max(momentum_values)}
    else:
        avg_outcome_ratio = current_state["rsRatio"]
        avg_outcome_momentum = current_state["rsMomentum"]
        ratio_range = {"lower": avg_outcome_ratio, "upper": avg_outcome_ratio}
        momentum_range = {"lower": avg_outcome_momentum, "upper": avg_outcome_momentum}

    most_likely_quadrant = max(transition_probs, key=transition_probs.get)
    confidence = transition_probs.get(most_likely_quadrant, 0.25)
    
    return {
        "symbol": symbol,
        "current_state": current_state,
        "transition_probabilities": transition_probs,
        "most_likely_quadrant": most_likely_quadrant,
        "historical_analogs": analogs,
        "analog_average_outcome": {
            "rsRatio": round(avg_outcome_ratio, 2),
            "rsMomentum": round(avg_outcome_momentum, 2)
        } if analogs else None,
        "predicted_rsRatio": round(avg_outcome_ratio, 2),
        "predicted_rsMomentum": round(avg_outcome_momentum, 2),
        "predicted_quadrant": most_likely_quadrant,
        "confidence": round(confidence, 3),
        "rsRatio_range": {
            "lower": round(ratio_range["lower"], 2),
            "upper": round(ratio_range["upper"], 2),
        },
        "rsMomentum_range": {
            "lower": round(momentum_range["lower"], 2),
            "upper": round(momentum_range["upper"], 2),
        },
        "disclaimer": "Based on historical patterns. Past performance does not guarantee future results."
    }


def batch_generate_predictions(
    symbols: List[str],
    current_states: Dict[str, Dict],
    lookback_days: int = 180,
    n_analogs: int = 5
) -> List[Dict]:
    """
    Generate predictions for multiple symbols.
    
    Args:
        symbols: List of ETF symbols
        current_states: Dict mapping symbol -> current RRG state
        lookback_days: Lookback period
        n_analogs: Number of analogs per symbol
    
    Returns:
        List of prediction dicts
    """
    predictions = []
    
    for symbol in symbols:
        if symbol not in current_states:
            continue
        
        try:
            prediction = generate_hybrid_prediction(
                symbol,
                current_states[symbol],
                lookback_days,
                n_analogs
            )
            predictions.append(prediction)
        except Exception as e:
            print(f"[ERROR] Prediction failed for {symbol}: {e}")
            continue
    
    return predictions
