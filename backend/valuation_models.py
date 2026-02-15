"""
DCF-Lite valuation model and relative valuation calculations.
Provides intrinsic value estimates and upside/downside percentages.
"""

from typing import Optional, Dict, Any
import math


def calculate_dcf_lite(
    revenue_ttm: float,
    fcf_margin: float,
    revenue_growth_rate: float,
    wacc: float = 0.10,
    terminal_growth: float = 0.03,
    projection_years: int = 5,
    shares_outstanding: Optional[float] = None,
    market_cap: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calculate DCF-Lite intrinsic value.

    Args:
        revenue_ttm: Trailing twelve months revenue
        fcf_margin: Free cash flow margin (FCF / Revenue)
        revenue_growth_rate: Annual revenue growth rate (e.g., 0.15 for 15%)
        wacc: Weighted average cost of capital (default 10% for tech)
        terminal_growth: Terminal growth rate (default 3%)
        projection_years: Number of years to project (default 5)
        shares_outstanding: Shares outstanding (optional, for per-share value)
        market_cap: Current market cap (optional, for upside calculation)

    Returns:
        Dictionary with intrinsic_value, upside_pct, rating, etc.
    """

    if revenue_ttm <= 0 or fcf_margin <= 0:
        return {
            "intrinsic_value_total": None,
            "intrinsic_value_per_share": None,
            "current_market_cap": market_cap,
            "upside_downside_pct": None,
            "rating": "insufficient_data",
            "projected_fcf": [],
            "terminal_value": None,
            "error": "Invalid revenue or FCF margin"
        }

    # Validate WACC > terminal growth
    if wacc <= terminal_growth:
        return {
            "intrinsic_value_total": None,
            "intrinsic_value_per_share": None,
            "current_market_cap": market_cap,
            "upside_downside_pct": None,
            "rating": "insufficient_data",
            "projected_fcf": [],
            "terminal_value": None,
            "error": "WACC must be greater than terminal growth rate"
        }

    # Step 1: Calculate current FCF
    current_fcf = revenue_ttm * fcf_margin

    # Cap growth rate at 25% to avoid unrealistic valuations
    # (even high-growth companies rarely sustain >25% for 5 years)
    capped_growth = min(revenue_growth_rate, 0.25)
    if revenue_growth_rate > 0.25:
        print(f"[DCF] Growth rate capped: {revenue_growth_rate:.2%} -> 25%")

    # Step 2: Project FCF for next N years
    projected_fcf = []
    for year in range(1, projection_years + 1):
        # Revenue projection with growth decay (conservative)
        # Growth rate decays 10% per year (e.g., 15% -> 13.5% -> 12.15%...)
        year_growth = capped_growth * (0.9 ** (year - 1))
        year_revenue = revenue_ttm * ((1 + year_growth) ** year)
        year_fcf = year_revenue * fcf_margin

        # Discount to present value
        discount_factor = (1 + wacc) ** year
        pv_fcf = year_fcf / discount_factor

        projected_fcf.append({
            "year": year,
            "fcf": round(year_fcf, 2),
            "pv_fcf": round(pv_fcf, 2),
            "growth_rate": round(year_growth * 100, 2)
        })

    # Step 3: Calculate terminal value
    final_year_fcf = projected_fcf[-1]["fcf"]
    terminal_fcf = final_year_fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (wacc - terminal_growth)

    # Discount terminal value to present
    discount_factor_terminal = (1 + wacc) ** projection_years
    pv_terminal_value = terminal_value / discount_factor_terminal

    # Step 4: Sum all present values
    total_pv_fcf = sum(proj["pv_fcf"] for proj in projected_fcf)
    intrinsic_value_total = total_pv_fcf + pv_terminal_value

    # Step 5: Calculate per-share value if shares outstanding available
    intrinsic_value_per_share = None
    if shares_outstanding and shares_outstanding > 0:
        intrinsic_value_per_share = intrinsic_value_total / shares_outstanding

    # Step 6: Calculate upside/downside
    upside_downside_pct = None
    rating = "fairly_valued"

    if market_cap and market_cap > 0:
        upside_downside_pct = ((intrinsic_value_total - market_cap) / market_cap) * 100

        # Rating thresholds
        if upside_downside_pct >= 20:
            rating = "undervalued"
        elif upside_downside_pct <= -20:
            rating = "overvalued"
        else:
            rating = "fairly_valued"

    return {
        "intrinsic_value_total": round(intrinsic_value_total, 2),
        "intrinsic_value_per_share": round(intrinsic_value_per_share, 2) if intrinsic_value_per_share else None,
        "current_market_cap": market_cap,
        "upside_downside_pct": round(upside_downside_pct, 2) if upside_downside_pct is not None else None,
        "rating": rating,
        "projected_fcf": projected_fcf,
        "terminal_value": round(terminal_value, 2),
        "pv_terminal_value": round(pv_terminal_value, 2),
        "assumptions": {
            "wacc": wacc,
            "terminal_growth": terminal_growth,
            "fcf_margin": fcf_margin,
            "revenue_growth_rate": revenue_growth_rate,
            "projection_years": projection_years
        }
    }


def calculate_relative_valuation_percentiles(
    pe_ratio: Optional[float],
    ps_ratio: Optional[float],
    pb_ratio: Optional[float],
    ev_ebit: Optional[float],
    industry_pe_median: Optional[float],
    industry_ps_median: Optional[float],
    industry_pb_median: Optional[float],
    industry_ev_ebit_median: Optional[float],
    industry_pe_p25: Optional[float] = None,
    industry_pe_p75: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calculate relative valuation percentiles vs industry.
    Lower multiples = cheaper = higher percentile score (0-100).

    Returns:
        Dictionary with percentile scores and interpretation
    """

    def calculate_percentile_score(value: Optional[float], median: Optional[float],
                                   p25: Optional[float] = None, p75: Optional[float] = None) -> Optional[float]:
        """
        Score where 100 = cheapest (far below median), 0 = most expensive (far above median).
        Uses p25/p75 if available, otherwise estimates range.
        """
        if value is None or median is None or value <= 0 or median <= 0:
            return None

        # Use quartiles if available, otherwise estimate as +/- 50% of median
        if p25 and p75:
            lower = p25
            upper = p75
        else:
            lower = median * 0.5
            upper = median * 1.5

        # Linear interpolation
        if value <= lower:
            return 100.0  # Very cheap
        elif value >= upper:
            return 0.0  # Very expensive
        else:
            # Linear scale: lower=100, median=50, upper=0
            if value <= median:
                return 50 + 50 * (median - value) / (median - lower)
            else:
                return 50 * (upper - value) / (upper - median)

    pe_percentile = calculate_percentile_score(pe_ratio, industry_pe_median, industry_pe_p25, industry_pe_p75)
    ps_percentile = calculate_percentile_score(ps_ratio, industry_ps_median)
    pb_percentile = calculate_percentile_score(pb_ratio, industry_pb_median)
    ev_ebit_percentile = calculate_percentile_score(ev_ebit, industry_ev_ebit_median)

    # Calculate average valuation score (only non-None values)
    scores = [s for s in [pe_percentile, ps_percentile, pb_percentile, ev_ebit_percentile] if s is not None]
    avg_valuation_score = sum(scores) / len(scores) if scores else None

    # Interpretation
    interpretation = "insufficient_data"
    if avg_valuation_score is not None:
        if avg_valuation_score >= 70:
            interpretation = "cheap"
        elif avg_valuation_score >= 40:
            interpretation = "fairly_valued"
        else:
            interpretation = "expensive"

    return {
        "pe_percentile": round(pe_percentile, 1) if pe_percentile else None,
        "ps_percentile": round(ps_percentile, 1) if ps_percentile else None,
        "pb_percentile": round(pb_percentile, 1) if pb_percentile else None,
        "ev_ebit_percentile": round(ev_ebit_percentile, 1) if ev_ebit_percentile else None,
        "avg_valuation_score": round(avg_valuation_score, 1) if avg_valuation_score else None,
        "interpretation": interpretation
    }


def calculate_peg_ratio(pe_ratio: Optional[float], eps_growth_rate: Optional[float]) -> Optional[float]:
    """
    Calculate PEG ratio (P/E divided by EPS growth rate).

    Args:
        pe_ratio: P/E ratio
        eps_growth_rate: EPS growth rate as percentage (e.g., 15.5 for 15.5%)

    Returns:
        PEG ratio or None if invalid inputs
    """
    if pe_ratio is None or eps_growth_rate is None or eps_growth_rate <= 0 or pe_ratio <= 0:
        return None

    return pe_ratio / eps_growth_rate
