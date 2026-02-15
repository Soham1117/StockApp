"""
Historical RRG calculation service.
Computes Relative Rotation Graph data points for multiple time periods.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import math


def calculate_ema(values: List[float], period: int) -> List[float]:
    """
    Calculate Exponential Moving Average (EMA).
    
    Args:
        values: List of values to smooth
        period: EMA period (e.g., 12 for 12-period EMA)
    
    Returns:
        List of EMA values (same length as input)
    """
    if not values or period <= 0:
        return []
    
    ema = []
    multiplier = 2.0 / (period + 1)
    
    # First EMA value is simple moving average
    if len(values) >= period:
        sma = sum(values[:period]) / period
        ema.append(sma)
        
        # Calculate subsequent EMA values
        for i in range(period, len(values)):
            ema_value = (values[i] - ema[-1]) * multiplier + ema[-1]
            ema.append(ema_value)
        
        # Pad beginning with None to match input length
        return [None] * (period - 1) + ema
    else:
        # Not enough data for EMA
        return [None] * len(values)


def calculate_rrg(
    stock_prices: List[float],
    benchmark_prices: List[float],
) -> Tuple[float, float]:
    """
    Calculate RS-Ratio and RS-Momentum for RRG (LEGACY - uses incorrect normalization).
    
    DEPRECATED: Use calculate_rrg_corrected() instead.
    This function is kept for backward compatibility but uses flawed methodology:
    - RS-Ratio baseline changes with lookback period (first value in window)
    - RS-Momentum uses arbitrary scaling factor
    
    Args:
        stock_prices: List of stock prices (ascending by date)
        benchmark_prices: List of benchmark prices (ascending by date)
    
    Returns:
        Tuple of (rs_ratio, rs_momentum)
    """
    # Require at least some history for both series
    len_stock = len(stock_prices)
    len_bench = len(benchmark_prices)
    
    if len_stock < 2 or len_bench < 2:
        return 100.0, 100.0
    
    # Align series from the most recent data
    min_len = min(len_stock, len_bench)
    aligned_stock = stock_prices[-min_len:]
    aligned_bench = benchmark_prices[-min_len:]
    
    # Compute relative strength (stock / benchmark)
    relative_strength = [
        s / b if b != 0 and math.isfinite(s) and math.isfinite(b) else None
        for s, b in zip(aligned_stock, aligned_bench)
    ]
    relative_strength = [rs for rs in relative_strength if rs is not None]
    
    if len(relative_strength) < 2:
        return 100.0, 100.0
    
    # Normalize to baseline 100
    baseline = relative_strength[0]
    if not math.isfinite(baseline) or baseline == 0:
        return 100.0, 100.0
    
    last_rs = relative_strength[-1]
    rs_ratio = (last_rs / baseline) * 100
    
    # Calculate momentum (rate of change over last 1/3 of period)
    momentum_period = max(1, len(relative_strength) // 3)
    
    if len(relative_strength) < momentum_period * 2:
        return rs_ratio, 100.0
    
    recent_rs = relative_strength[-momentum_period:]
    older_rs = relative_strength[-momentum_period * 2:-momentum_period]
    
    if len(recent_rs) == 0 or len(older_rs) == 0:
        return rs_ratio, 100.0
    
    recent_avg = sum(recent_rs) / len(recent_rs)
    older_avg = sum(older_rs) / len(older_rs)
    
    if not math.isfinite(older_avg) or older_avg == 0:
        return rs_ratio, 100.0
    
    raw_momentum = ((recent_avg - older_avg) / older_avg) * 1000 + 100
    rs_momentum = raw_momentum if math.isfinite(raw_momentum) else 100.0
    
    return rs_ratio, rs_momentum


def calculate_rrg_corrected(
    stock_prices: List[float],
    benchmark_prices: List[float],
    lookback_days: int = 180
) -> Tuple[float, float]:
    """
    Calculate RS-Ratio and RS-Momentum for RRG using CORRECTED methodology.
    
    This implements the proper RRG calculation:
    - RS-Ratio: Normalized to 52-week rolling average (not first value in lookback)
    - RS-Momentum: 12-period EMA of RS-Ratio / 12-period EMA of that EMA
    
    Args:
        stock_prices: List of stock prices (ascending by date)
        benchmark_prices: List of benchmark prices (ascending by date)
        lookback_days: Lookback period (for context, not used in normalization)
    
    Returns:
        Tuple of (rs_ratio, rs_momentum)
    """
    # Require at least 252 trading days (~1 year) for 52-week average
    len_stock = len(stock_prices)
    len_bench = len(benchmark_prices)
    
    if len_stock < 252 or len_bench < 252:
        # Fallback to legacy method if insufficient data
        return calculate_rrg(stock_prices, benchmark_prices)
    
    # Align series from the most recent data
    min_len = min(len_stock, len_bench)
    aligned_stock = stock_prices[-min_len:]
    aligned_bench = benchmark_prices[-min_len:]
    
    # Compute relative strength (stock / benchmark)
    relative_strength = [
        s / b if b != 0 and math.isfinite(s) and math.isfinite(b) else None
        for s, b in zip(aligned_stock, aligned_bench)
    ]
    relative_strength = [rs for rs in relative_strength if rs is not None]
    
    if len(relative_strength) < 252:
        return 100.0, 100.0
    
    # Calculate RS-Ratio: current RS / 52-week average RS
    # Use last 252 trading days (~52 weeks) for rolling average
    rs_52w = relative_strength[-252:]
    rs_52w_avg = sum(rs_52w) / len(rs_52w)
    
    if not math.isfinite(rs_52w_avg) or rs_52w_avg == 0:
        return 100.0, 100.0
    
    current_rs = relative_strength[-1]
    rs_ratio = (current_rs / rs_52w_avg) * 100
    
    # Calculate RS-Ratio time series for momentum calculation
    # We need at least 12 + 12 = 24 periods for double EMA
    rs_ratio_series = []
    for i in range(max(0, len(relative_strength) - 252), len(relative_strength)):
        # Calculate 52-week average up to this point
        start_idx = max(0, i - 251)  # 252 days including current
        window = relative_strength[start_idx:i+1]
        if len(window) >= 252:
            window_avg = sum(window[-252:]) / 252
            if window_avg != 0 and math.isfinite(window_avg):
                ratio = (relative_strength[i] / window_avg) * 100
                rs_ratio_series.append(ratio)
    
    # Calculate RS-Momentum: 12-period EMA of RS-Ratio / 12-period EMA of that EMA
    if len(rs_ratio_series) < 24:  # Need at least 24 points for double EMA
        return rs_ratio, 100.0
    
    # First EMA (12-period)
    ema_12 = calculate_ema(rs_ratio_series, 12)
    
    # Filter out None values from EMA
    ema_12_clean = [v for v in ema_12 if v is not None]
    
    if len(ema_12_clean) < 12:
        return rs_ratio, 100.0
    
    # Second EMA (12-period EMA of the first EMA)
    ema_12_12 = calculate_ema(ema_12_clean, 12)
    
    # Filter out None values
    ema_12_12_clean = [v for v in ema_12_12 if v is not None]
    
    if not ema_12_12_clean or not ema_12_clean:
        return rs_ratio, 100.0
    
    # RS-Momentum = (EMA_12 / EMA_12_12) * 100
    current_ema_12 = ema_12_clean[-1]
    current_ema_12_12 = ema_12_12_clean[-1]
    
    if not math.isfinite(current_ema_12_12) or current_ema_12_12 == 0:
        return rs_ratio, 100.0
    
    rs_momentum = (current_ema_12 / current_ema_12_12) * 100
    
    if not math.isfinite(rs_momentum):
        rs_momentum = 100.0
    
    return rs_ratio, rs_momentum


def determine_quadrant(
    rs_ratio: float,
    rs_momentum: float,
) -> str:
    """
    Determine RRG quadrant based on RS-Ratio and RS-Momentum.
    
    Returns:
        'LEADING', 'WEAKENING', 'LAGGING', or 'IMPROVING'
    """
    if rs_ratio >= 100 and rs_momentum >= 100:
        return "LEADING"
    if rs_ratio >= 100 and rs_momentum < 100:
        return "WEAKENING"
    if rs_ratio < 100 and rs_momentum < 100:
        return "LAGGING"
    return "IMPROVING"


__all__ = [
    "calculate_ema",
    "calculate_rrg",
    "calculate_rrg_corrected",
    "determine_quadrant",
    "calculate_rrg_for_date",
    "generate_weekly_dates",
    "generate_monthly_dates",
]


def calculate_rrg_for_date(
    date: datetime,
    stock_prices_by_date: Dict[str, float],
    benchmark_prices_by_date: Dict[str, float],
    lookback_days: int,
) -> Optional[Dict]:
    """
    Calculate RRG data point for a specific date.
    
    Args:
        date: Target date for RRG calculation
        stock_prices_by_date: Dict mapping date strings (YYYY-MM-DD) to prices
        benchmark_prices_by_date: Dict mapping date strings (YYYY-MM-DD) to prices
        lookback_days: Number of days to look back for calculation
    
    Returns:
        Dict with rsRatio, rsMomentum, quadrant, or None if insufficient data
    """
    # Get date range
    end_date = date
    start_date = end_date - timedelta(days=lookback_days)
    
    # Collect *aligned* prices in the lookback window (same dates for both series).
    # This avoids zipping mismatched calendars which produces incorrect RS values.
    stock_prices: List[float] = []
    benchmark_prices: List[float] = []

    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        if date_str in stock_prices_by_date and date_str in benchmark_prices_by_date:
            stock_prices.append(stock_prices_by_date[date_str])
            benchmark_prices.append(benchmark_prices_by_date[date_str])
        current_date += timedelta(days=1)

    # Need at least some aligned data points
    if len(stock_prices) < 10:
        return None
    
    # Calculate RRG
    rs_ratio, rs_momentum = calculate_rrg(stock_prices, benchmark_prices)
    quadrant = determine_quadrant(rs_ratio, rs_momentum)
    
    return {
        "date": date.strftime("%Y-%m-%d"),
        "rsRatio": round(rs_ratio, 2),
        "rsMomentum": round(rs_momentum, 2),
        "quadrant": quadrant,
    }


def generate_weekly_dates(
    start_date: datetime,
    end_date: datetime,
) -> List[datetime]:
    """
    Generate list of weekly dates (every Monday) between start and end.
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
    
    Returns:
        List of datetime objects for each Monday in the range
    """
    dates: List[datetime] = []
    
    # Find first Monday on or after start_date
    current = start_date
    days_until_monday = (7 - current.weekday()) % 7
    if days_until_monday == 0 and current.weekday() != 0:
        days_until_monday = 7
    current += timedelta(days=days_until_monday)
    
    # Generate weekly dates
    while current <= end_date:
        dates.append(current)
        current += timedelta(days=7)
    
    return dates


def generate_monthly_dates(
    start_date: datetime,
    end_date: datetime,
) -> List[datetime]:
    """
    Generate list of monthly dates (first trading day of each month).
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
    
    Returns:
        List of datetime objects for first day of each month
    """
    dates: List[datetime] = []
    
    current = start_date.replace(day=1)
    
    while current <= end_date:
        dates.append(current)
        # Move to next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    
    return dates
