"""
6-Factor scoring system for stocks.
Each factor scored 0-100 using percentile ranking vs industry peers.
"""

from typing import List, Dict, Any, Optional
import statistics


def percentile_rank(value: float, peer_values: List[float], higher_is_better: bool = True) -> float:
    """
    Calculate percentile rank (0-100) of value within peer_values.

    Args:
        value: The value to rank
        peer_values: List of peer values
        higher_is_better: If True, higher values get higher scores

    Returns:
        Percentile score 0-100
    """
    if not peer_values or value is None:
        return 50.0  # Default to median if no data

    # Remove None values
    valid_peers = [v for v in peer_values if v is not None]
    if not valid_peers:
        return 50.0

    # Count how many peers are worse than this value
    if higher_is_better:
        worse_count = sum(1 for v in valid_peers if v < value)
    else:
        worse_count = sum(1 for v in valid_peers if v > value)

    # Calculate percentile
    percentile = (worse_count / len(valid_peers)) * 100
    return min(100.0, max(0.0, percentile))


def calculate_valuation_factor(
    pe_ratio: Optional[float],
    ps_ratio: Optional[float],
    pb_ratio: Optional[float],
    ev_ebit: Optional[float],
    ev_ebitda: Optional[float],
    ev_sales: Optional[float],
    peer_pe: List[float],
    peer_ps: List[float],
    peer_pb: List[float],
    peer_ev_ebit: List[float],
    peer_ev_ebitda: List[float],
    peer_ev_sales: List[float],
    weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Valuation factor: Lower multiples = higher score (cheaper is better).
    Score 0-100 where 100 = cheapest in peer group.

    Supports optional per-multiple weights. If no weights are provided,
    all available components are weighted equally (equivalent to a simple mean).
    """
    # Track individual component scores (even if some end up missing)
    component_scores: Dict[str, Optional[float]] = {
        "pe": None,
        "ps": None,
        "pb": None,
        "ev_ebit": None,
        "ev_ebitda": None,
        "ev_sales": None,
    }

    scores: List[float] = []

    if pe_ratio and peer_pe:
        pe_score = percentile_rank(pe_ratio, peer_pe, higher_is_better=False)
        component_scores["pe"] = pe_score
        scores.append(pe_score)

    if ps_ratio and peer_ps:
        ps_score = percentile_rank(ps_ratio, peer_ps, higher_is_better=False)
        component_scores["ps"] = ps_score
        scores.append(ps_score)

    if pb_ratio and peer_pb:
        pb_score = percentile_rank(pb_ratio, peer_pb, higher_is_better=False)
        component_scores["pb"] = pb_score
        scores.append(pb_score)

    if ev_ebit and peer_ev_ebit:
        ev_ebit_score = percentile_rank(ev_ebit, peer_ev_ebit, higher_is_better=False)
        component_scores["ev_ebit"] = ev_ebit_score
        scores.append(ev_ebit_score)

    if ev_ebitda and peer_ev_ebitda:
        ev_ebitda_score = percentile_rank(ev_ebitda, peer_ev_ebitda, higher_is_better=False)
        component_scores["ev_ebitda"] = ev_ebitda_score
        scores.append(ev_ebitda_score)

    if ev_sales and peer_ev_sales:
        ev_sales_score = percentile_rank(ev_sales, peer_ev_sales, higher_is_better=False)
        component_scores["ev_sales"] = ev_sales_score
        scores.append(ev_sales_score)

    # Fallback: no data -> no score, keep existing API behaviour
    if not scores:
        return {
            "score": None,
            "component_count": 0,
            "components": component_scores,
            "weights": None,
            "interpretation": "insufficient_data",
        }

    # Default: equal weights for all valuation components.
    # Using 1.0 for each is equivalent to 16.67% each once normalized.
    default_weights: Dict[str, float] = {
        "pe": 1.0,
        "ps": 1.0,
        "pb": 1.0,
        "ev_ebit": 1.0,
        "ev_ebitda": 1.0,
        "ev_sales": 1.0,
    }

    raw_weights = {**default_weights, **(weights or {})}

    # Only consider metrics that actually have a score
    active_components = {k: v for k, v in component_scores.items() if v is not None}

    # Collect weights for active components and normalize
    active_weight_items = {k: max(0.0, float(raw_weights.get(k, 0.0))) for k in active_components.keys()}
    weight_sum = sum(active_weight_items.values())

    if weight_sum <= 0:
        # Degenerate case (all weights zero or negative) -> fall back to simple mean
        overall_score = statistics.mean(scores)
        normalized_weights = None
    else:
        normalized_weights = {k: w / weight_sum for k, w in active_weight_items.items()}
        overall_score = sum(active_components[k] * normalized_weights[k] for k in active_components.keys())

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(scores),
        "components": component_scores,
        "weights": normalized_weights,
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data",
    }


def calculate_quality_factor(
    roe: Optional[float],
    roa: Optional[float],
    roic: Optional[float],
    gross_margin: Optional[float],
    operating_margin: Optional[float],
    net_margin: Optional[float],
    fcf_margin: Optional[float],
    peer_roe: List[float],
    peer_roa: List[float],
    peer_roic: List[float],
    peer_gross_margin: List[float],
    peer_operating_margin: List[float],
    peer_net_margin: List[float],
    peer_fcf_margin: List[float],
) -> Dict[str, Any]:
    """
    Quality factor: Higher profitability metrics = higher score.
    Score 0-100 where 100 = highest quality in peer group.
    """
    scores = []

    if roe and peer_roe:
        scores.append(percentile_rank(roe, peer_roe, higher_is_better=True))

    if roa and peer_roa:
        scores.append(percentile_rank(roa, peer_roa, higher_is_better=True))

    if roic and peer_roic:
        scores.append(percentile_rank(roic, peer_roic, higher_is_better=True))

    if gross_margin and peer_gross_margin:
        scores.append(percentile_rank(gross_margin, peer_gross_margin, higher_is_better=True))

    if operating_margin and peer_operating_margin:
        scores.append(percentile_rank(operating_margin, peer_operating_margin, higher_is_better=True))

    if net_margin and peer_net_margin:
        scores.append(percentile_rank(net_margin, peer_net_margin, higher_is_better=True))

    if fcf_margin and peer_fcf_margin:
        scores.append(percentile_rank(fcf_margin, peer_fcf_margin, higher_is_better=True))

    overall_score = statistics.mean(scores) if scores else None

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(scores),
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data"
    }


def calculate_growth_factor(
    revenue_growth: Optional[float],
    ebit_growth: Optional[float],
    eps_growth: Optional[float],
    fcf_growth: Optional[float],
    peer_revenue_growth: List[float],
    peer_ebit_growth: List[float],
    peer_eps_growth: List[float],
    peer_fcf_growth: List[float],
) -> Dict[str, Any]:
    """
    Growth factor: Higher growth rates = higher score.
    Score 0-100 where 100 = fastest growing in peer group.
    """
    scores = []

    if revenue_growth is not None and peer_revenue_growth:
        scores.append(percentile_rank(revenue_growth, peer_revenue_growth, higher_is_better=True))

    if ebit_growth is not None and peer_ebit_growth:
        scores.append(percentile_rank(ebit_growth, peer_ebit_growth, higher_is_better=True))

    if eps_growth is not None and peer_eps_growth:
        scores.append(percentile_rank(eps_growth, peer_eps_growth, higher_is_better=True))

    if fcf_growth is not None and peer_fcf_growth:
        scores.append(percentile_rank(fcf_growth, peer_fcf_growth, higher_is_better=True))

    overall_score = statistics.mean(scores) if scores else None

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(scores),
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data"
    }


def calculate_momentum_factor(
    return_1m: Optional[float],
    return_3m: Optional[float],
    return_6m: Optional[float],
    peer_return_1m: List[float],
    peer_return_3m: List[float],
    peer_return_6m: List[float],
) -> Dict[str, Any]:
    """
    Momentum factor: Higher recent returns = higher score.
    Score 0-100 where 100 = strongest momentum in peer group.
    """
    scores = []

    if return_1m is not None and peer_return_1m:
        scores.append(percentile_rank(return_1m, peer_return_1m, higher_is_better=True))

    if return_3m is not None and peer_return_3m:
        scores.append(percentile_rank(return_3m, peer_return_3m, higher_is_better=True))

    if return_6m is not None and peer_return_6m:
        scores.append(percentile_rank(return_6m, peer_return_6m, higher_is_better=True))

    overall_score = statistics.mean(scores) if scores else None

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(scores),
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data"
    }


def calculate_sentiment_factor(
    news_sentiment_avg: Optional[float],
    news_sentiment_recent: Optional[float],
    analyst_rating_score: Optional[float],
) -> Dict[str, Any]:
    """
    Sentiment factor: Positive sentiment = higher score.
    Score 0-100 where 100 = most positive sentiment.

    Args:
        news_sentiment_avg: Average news sentiment (-1 to +1)
        news_sentiment_recent: Recent news sentiment (-1 to +1)
        analyst_rating_score: Analyst rating score (0-100, derived from strong buy/buy/hold/sell counts)
    """
    scores = []

    # Convert news sentiment from -1/+1 to 0-100 scale
    if news_sentiment_avg is not None:
        news_avg_score = (news_sentiment_avg + 1) * 50  # -1 -> 0, 0 -> 50, +1 -> 100
        scores.append(news_avg_score)

    if news_sentiment_recent is not None:
        # Weight recent sentiment more heavily
        news_recent_score = (news_sentiment_recent + 1) * 50
        scores.append(news_recent_score)
        scores.append(news_recent_score)  # Add twice for 2x weight

    if analyst_rating_score is not None:
        scores.append(analyst_rating_score)

    overall_score = statistics.mean(scores) if scores else None

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(set(scores)) if scores else 0,  # Unique components
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data"
    }


def calculate_risk_factor(
    debt_to_equity: Optional[float],
    current_ratio: Optional[float],
    interest_coverage: Optional[float],
    beta: Optional[float],
    risk_count_high: int = 0,
    risk_count_medium: int = 0,
    risk_count_low: int = 0,
    peer_debt_to_equity: List[float] = [],
    peer_current_ratio: List[float] = [],
    peer_interest_coverage: List[float] = [],
) -> Dict[str, Any]:
    """
    Risk factor: Lower financial risk + fewer SEC risks = higher score.
    Score 0-100 where 100 = lowest risk in peer group.

    Risk scoring is INVERSE (lower risk = higher score).
    """
    scores = []

    # Financial risk metrics (lower is better for D/E, higher is better for ratios)
    if debt_to_equity is not None and peer_debt_to_equity:
        de_score = percentile_rank(debt_to_equity, peer_debt_to_equity, higher_is_better=False)
        scores.append(de_score)

    if current_ratio and peer_current_ratio:
        cr_score = percentile_rank(current_ratio, peer_current_ratio, higher_is_better=True)
        scores.append(cr_score)

    if interest_coverage and peer_interest_coverage:
        ic_score = percentile_rank(interest_coverage, peer_interest_coverage, higher_is_better=True)
        scores.append(ic_score)

    # Beta: lower is better (less volatile)
    if beta is not None:
        # Beta of 1.0 = market risk (50 score)
        # Beta < 1.0 = lower risk (higher score)
        # Beta > 1.0 = higher risk (lower score)
        beta_score = max(0, min(100, 100 - (beta - 0.5) * 50))
        scores.append(beta_score)

    # SEC categorized risks: high severity hurts score more
    # Typical stock might have 5-10 risks total
    risk_penalty = (risk_count_high * 10) + (risk_count_medium * 5) + (risk_count_low * 2)
    risk_score = max(0, 100 - risk_penalty)
    scores.append(risk_score)

    overall_score = statistics.mean(scores) if scores else None

    return {
        "score": round(overall_score, 1) if overall_score else None,
        "component_count": len(scores),
        "risk_breakdown": {
            "high_severity_risks": risk_count_high,
            "medium_severity_risks": risk_count_medium,
            "low_severity_risks": risk_count_low
        },
        "interpretation": _interpret_score(overall_score) if overall_score else "insufficient_data"
    }


def calculate_composite_score(
    valuation_score: Optional[float],
    quality_score: Optional[float],
    growth_score: Optional[float],
    momentum_score: Optional[float],
    sentiment_score: Optional[float],
    risk_score: Optional[float],
    weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Calculate weighted composite score from all 6 factors.

    Default weights (equal):
        valuation: 20%, quality: 20%, growth: 20%, momentum: 10%, sentiment: 10%, risk: 20%
    """
    default_weights = {
        "valuation": 0.20,
        "quality": 0.20,
        "growth": 0.20,
        "momentum": 0.10,
        "sentiment": 0.10,
        "risk": 0.20
    }

    weights = weights or default_weights

    scores_dict = {
        "valuation": valuation_score,
        "quality": quality_score,
        "growth": growth_score,
        "momentum": momentum_score,
        "sentiment": sentiment_score,
        "risk": risk_score
    }

    # Calculate weighted average (only non-None scores)
    weighted_sum = 0
    weight_sum = 0

    for factor, score in scores_dict.items():
        if score is not None:
            weighted_sum += score * weights[factor]
            weight_sum += weights[factor]

    composite_score = weighted_sum / weight_sum if weight_sum > 0 else None

    return {
        "composite_score": round(composite_score, 1) if composite_score else None,
        "interpretation": _interpret_score(composite_score) if composite_score else "insufficient_data",
        "factors": scores_dict,
        "weights": weights
    }


def _interpret_score(score: Optional[float]) -> str:
    """Interpret factor score (0-100)."""
    if score is None:
        return "insufficient_data"
    elif score >= 75:
        return "excellent"
    elif score >= 60:
        return "above_average"
    elif score >= 40:
        return "average"
    elif score >= 25:
        return "below_average"
    else:
        return "poor"
