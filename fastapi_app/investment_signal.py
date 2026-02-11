"""
Investment recommendation signal generation.
Combines factor scores, valuation models, and risk assessment to generate
BUY_CANDIDATE, WATCHLIST, or AVOID signals.
"""

from typing import Dict, Any, Optional, List


def generate_investment_signal(
    composite_score: Optional[float],
    valuation_score: Optional[float],
    quality_score: Optional[float],
    growth_score: Optional[float],
    risk_score: Optional[float],
    dcf_upside_pct: Optional[float],
    dcf_rating: Optional[str],
    relative_valuation_score: Optional[float],
    relative_valuation_interpretation: Optional[str],
    high_severity_risks: int = 0,
    medium_severity_risks: int = 0,
    revenue_growth: Optional[float] = None,
    debt_to_equity: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Generate investment recommendation signal based on comprehensive analysis.

    Signal logic:
        BUY_CANDIDATE: Strong scores + attractive valuation + manageable risks
        WATCHLIST: Mixed signals or moderate concerns
        AVOID: Weak fundamentals or overvaluation or excessive risk

    Args:
        composite_score: Overall factor score (0-100)
        valuation_score: Valuation factor score (0-100)
        quality_score: Quality factor score (0-100)
        growth_score: Growth factor score (0-100)
        risk_score: Risk factor score (0-100)
        dcf_upside_pct: DCF upside/downside percentage
        dcf_rating: DCF rating (undervalued/fairly_valued/overvalued)
        relative_valuation_score: Relative valuation score (0-100)
        relative_valuation_interpretation: cheap/fairly_valued/expensive
        high_severity_risks: Count of high severity risks
        medium_severity_risks: Count of medium severity risks
        revenue_growth: Revenue growth rate (for context)
        debt_to_equity: Debt to equity ratio (for context)

    Returns:
        Dictionary with signal, confidence, and reasoning
    """

    # Collect reasons for the signal
    positive_reasons = []
    negative_reasons = []
    neutral_reasons = []

    # Default signal
    signal = "WATCHLIST"
    confidence = "MEDIUM"

    # Check data availability
    has_composite = composite_score is not None
    has_dcf = dcf_upside_pct is not None
    has_relative_val = relative_valuation_score is not None

    if not has_composite and not has_dcf and not has_relative_val:
        return {
            "signal": "INSUFFICIENT_DATA",
            "confidence": "LOW",
            "composite_score": None,
            "positive_reasons": [],
            "negative_reasons": ["Insufficient data for comprehensive analysis"],
            "neutral_reasons": [],
            "recommendation_text": "Insufficient data to generate investment recommendation."
        }

    # --- Analyze Valuation ---
    valuation_attractive = False
    valuation_expensive = False

    # DCF valuation check
    if dcf_rating == "undervalued" and dcf_upside_pct and dcf_upside_pct >= 20:
        valuation_attractive = True
        positive_reasons.append(f"DCF model suggests {dcf_upside_pct:.1f}% upside (undervalued)")
    elif dcf_rating == "overvalued" and dcf_upside_pct and dcf_upside_pct <= -20:
        valuation_expensive = True
        negative_reasons.append(f"DCF model suggests {abs(dcf_upside_pct):.1f}% downside (overvalued)")
    elif dcf_upside_pct is not None:
        neutral_reasons.append(f"DCF model suggests {dcf_upside_pct:+.1f}% from fair value")

    # Relative valuation check
    if relative_valuation_interpretation == "cheap" or (valuation_score and valuation_score >= 65):
        valuation_attractive = True
        positive_reasons.append("Trading at attractive multiples vs peers")
    elif relative_valuation_interpretation == "expensive" or (valuation_score and valuation_score <= 35):
        valuation_expensive = True
        negative_reasons.append("Trading at premium multiples vs peers")

    # --- Analyze Quality ---
    high_quality = quality_score and quality_score >= 65
    low_quality = quality_score and quality_score <= 35

    if high_quality:
        positive_reasons.append("Strong profitability and returns on capital")
    elif low_quality:
        negative_reasons.append("Below-average profitability and returns")

    # --- Analyze Growth ---
    high_growth = growth_score and growth_score >= 65
    low_growth = growth_score and growth_score <= 35

    if high_growth:
        positive_reasons.append("Above-average revenue and earnings growth")
    elif low_growth:
        negative_reasons.append("Below-average growth trajectory")

    # --- Analyze Risk ---
    low_risk = risk_score and risk_score >= 65
    high_risk = risk_score and risk_score <= 35

    if high_severity_risks >= 3:
        negative_reasons.append(f"{high_severity_risks} high-severity risks identified in filings")
    elif high_severity_risks >= 1:
        neutral_reasons.append(f"{high_severity_risks} high-severity risk(s) to monitor")

    if high_risk or high_severity_risks >= 3:
        negative_reasons.append("Elevated financial or operational risk profile")
    elif low_risk:
        positive_reasons.append("Strong balance sheet and low risk profile")

    # Excessive leverage check
    if debt_to_equity and debt_to_equity > 2.0:
        negative_reasons.append(f"High leverage (D/E: {debt_to_equity:.2f})")

    # --- Composite Score Assessment ---
    strong_composite = composite_score and composite_score >= 70
    weak_composite = composite_score and composite_score <= 30

    # --- Generate Signal ---

    # BUY_CANDIDATE criteria:
    # 1. Attractive valuation (DCF undervalued OR cheap relative valuation)
    # 2. Strong composite score (>=70) OR (high quality AND high growth)
    # 3. No excessive risks (high_severity_risks < 3 AND not high_risk)
    if valuation_attractive and (strong_composite or (high_quality and high_growth)) and not high_risk and high_severity_risks < 3:
        signal = "BUY_CANDIDATE"
        confidence = "HIGH"
        if strong_composite and high_quality and high_growth:
            confidence = "VERY_HIGH"

    # AVOID criteria:
    # 1. Overvalued (DCF overvalued AND expensive relative valuation)
    # 2. OR weak fundamentals (composite < 30)
    # 3. OR excessive risk (high_severity_risks >= 3 OR high_risk)
    elif (valuation_expensive and relative_valuation_interpretation == "expensive") or weak_composite or high_severity_risks >= 3 or (high_risk and low_quality):
        signal = "AVOID"
        confidence = "HIGH"
        if valuation_expensive and weak_composite and high_risk:
            confidence = "VERY_HIGH"

    # WATCHLIST (default for mixed signals)
    else:
        signal = "WATCHLIST"
        # Determine confidence based on number of positive vs negative reasons
        if len(positive_reasons) > len(negative_reasons) + 2:
            confidence = "MEDIUM_HIGH"
            neutral_reasons.append("Leans positive but missing key criteria for BUY_CANDIDATE")
        elif len(negative_reasons) > len(positive_reasons) + 2:
            confidence = "MEDIUM_LOW"
            neutral_reasons.append("Leans negative but not severe enough for AVOID")
        else:
            confidence = "MEDIUM"
            neutral_reasons.append("Mixed signals require further monitoring")

    # Generate recommendation text
    recommendation_text = _generate_recommendation_text(
        signal, confidence, positive_reasons, negative_reasons, neutral_reasons
    )

    return {
        "signal": signal,
        "confidence": confidence,
        "composite_score": round(composite_score, 1) if composite_score else None,
        "positive_reasons": positive_reasons,
        "negative_reasons": negative_reasons,
        "neutral_reasons": neutral_reasons,
        "recommendation_text": recommendation_text
    }


def _generate_recommendation_text(
    signal: str,
    confidence: str,
    positive_reasons: List[str],
    negative_reasons: List[str],
    neutral_reasons: List[str]
) -> str:
    """Generate human-readable recommendation text."""

    if signal == "BUY_CANDIDATE":
        intro = f"**{signal}** ({confidence} confidence) — "
        if confidence in ["VERY_HIGH", "HIGH"]:
            intro += "This stock exhibits strong fundamentals with attractive valuation."
        else:
            intro += "This stock shows promising characteristics worth considering."

    elif signal == "AVOID":
        intro = f"**{signal}** ({confidence} confidence) — "
        if confidence in ["VERY_HIGH", "HIGH"]:
            intro += "This stock has significant concerns that outweigh potential upside."
        else:
            intro += "This stock has notable issues that suggest caution."

    else:  # WATCHLIST
        intro = f"**{signal}** ({confidence} confidence) — "
        intro += "This stock shows mixed signals requiring further analysis before taking a position."

    # Build detailed reasoning
    sections = []
    if positive_reasons:
        sections.append("**Positive factors:** " + "; ".join(positive_reasons))
    if negative_reasons:
        sections.append("**Concerns:** " + "; ".join(negative_reasons))
    if neutral_reasons:
        sections.append("**Considerations:** " + "; ".join(neutral_reasons))

    return intro + " " + ". ".join(sections) + "."
