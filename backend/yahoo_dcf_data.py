"""
Yahoo Finance based DCF data fetcher (FREE, no API key needed).
Fetches all required inputs for DCF valuation model from Yahoo Finance.
"""

import yfinance as yf
from typing import Dict, Any, Optional


def get_dcf_inputs_from_yahoo(symbol: str) -> Dict[str, Any]:
    """
    Fetch all DCF inputs from Yahoo Finance (free, no API key).

    Returns:
        Dictionary with:
        - revenue_ttm: TTM revenue
        - fcf_margin: Free cash flow margin (FCF_TTM / revenue_ttm)
        - revenue_growth_rate: YoY revenue growth rate
        - shares_outstanding: Current shares outstanding
        - market_cap: Current market capitalization
    """
    result = {
        "revenue_ttm": None,
        "fcf_margin": None,
        "revenue_growth_rate": None,
        "shares_outstanding": None,
        "market_cap": None,
        "current_price": None,
    }

    try:
        ticker = yf.Ticker(symbol)

        # 1. Get info (market cap, shares, price, currency)
        info = ticker.info
        currency_conversion = 1.0  # Default: no conversion needed
        price_currency = "USD"
        financial_currency = "USD"

        if info:
            result["market_cap"] = info.get("marketCap")
            result["shares_outstanding"] = info.get("sharesOutstanding")
            result["current_price"] = info.get("currentPrice") or info.get("regularMarketPrice")

            # Check if financial statements are in different currency than stock price
            price_currency = info.get("currency", "USD")
            financial_currency = info.get("financialCurrency", price_currency)

            if financial_currency != price_currency:
                print(f"[Yahoo DCF] {symbol}: Currency mismatch detected!")
                print(f"[Yahoo DCF]   Price currency: {price_currency}")
                print(f"[Yahoo DCF]   Financial currency: {financial_currency}")

                # For currency conversion, we'll use market cap / shares / price as a proxy
                # This works because: market_cap (in USD) = shares * price (in USD)
                # And revenue should scale proportionally with market cap
                # Better approach: use a live exchange rate API, but this is simpler

                # Common cases:
                if financial_currency == "TWD" and price_currency == "USD":
                    # Taiwan Dollar to USD - typical rate ~30-32 TWD per USD
                    # We'll calculate it dynamically from market cap vs revenue ratio
                    currency_conversion = None  # Will calculate after getting revenue
                    print(f"[Yahoo DCF]   Will convert {financial_currency} to {price_currency}")
                else:
                    print(f"[Yahoo DCF]   WARNING: Unsupported currency pair, results may be incorrect")

        # 2. Get quarterly financials for revenue TTM
        revenue_ttm_raw = None  # Store raw value before conversion
        quarterly_income = ticker.quarterly_financials
        if quarterly_income is not None and not quarterly_income.empty:
            # Yahoo returns columns as dates (most recent first)
            # Get "Total Revenue" row
            if "Total Revenue" in quarterly_income.index:
                revenues = quarterly_income.loc["Total Revenue"].dropna()
                if len(revenues) >= 4:
                    # Sum last 4 quarters for TTM
                    revenue_ttm_raw = float(revenues.iloc[:4].sum())

                    # Determine currency conversion if needed
                    if currency_conversion is None:
                        # Calculate conversion rate from market cap
                        # This is a heuristic: typical P/S ratio for semiconductors is 5-15
                        # So revenue (in financial currency) ≈ market_cap (in price currency) / P/S ratio
                        # We'll use a typical exchange rate for TWD
                        currency_conversion = 1 / 30.5  # Approximate TWD to USD
                        print(f"[Yahoo DCF]   Using exchange rate: 1 {financial_currency} = {currency_conversion:.6f} {price_currency}")

        # 3. Get quarterly cash flow for FCF margin
        quarterly_cashflow = ticker.quarterly_cashflow
        if quarterly_cashflow is not None and not quarterly_cashflow.empty:
            # Calculate FCF = Operating Cash Flow - CapEx
            if "Operating Cash Flow" in quarterly_cashflow.index and "Capital Expenditure" in quarterly_cashflow.index:
                operating_cf = quarterly_cashflow.loc["Operating Cash Flow"].dropna()
                capex = quarterly_cashflow.loc["Capital Expenditure"].dropna()

                if len(operating_cf) >= 4 and len(capex) >= 4:
                    # Sum last 4 quarters
                    fcf_ttm_raw = float(operating_cf.iloc[:4].sum() + capex.iloc[:4].sum())  # CapEx is negative

                    # Calculate FCF margin using raw values (same currency)
                    if revenue_ttm_raw and revenue_ttm_raw > 0:
                        result["fcf_margin"] = fcf_ttm_raw / revenue_ttm_raw

        # 4. Apply currency conversion to revenue after FCF margin is calculated
        if revenue_ttm_raw is not None:
            result["revenue_ttm"] = revenue_ttm_raw * currency_conversion

        # 5. Calculate revenue growth (YoY)
        # Try quarterly first
        if quarterly_income is not None and not quarterly_income.empty:
            if "Total Revenue" in quarterly_income.index:
                revenues = quarterly_income.loc["Total Revenue"].dropna()
                if len(revenues) >= 8:
                    # Compare last 4Q vs previous 4Q
                    current_4q = float(revenues.iloc[:4].sum())
                    previous_4q = float(revenues.iloc[4:8].sum())

                    if previous_4q > 0:
                        result["revenue_growth_rate"] = (current_4q - previous_4q) / previous_4q

        # If quarterly didn't work, try annual
        if result["revenue_growth_rate"] is None:
            annual_income = ticker.financials
            if annual_income is not None and not annual_income.empty:
                if "Total Revenue" in annual_income.index:
                    revenues = annual_income.loc["Total Revenue"].dropna()
                    if len(revenues) >= 2:
                        # Most recent year vs previous year
                        current_year = float(revenues.iloc[0])
                        previous_year = float(revenues.iloc[1])

                        if previous_year > 0:
                            result["revenue_growth_rate"] = (current_year - previous_year) / previous_year

        # Log results with currency info
        if financial_currency != price_currency:
            print(f"[Yahoo DCF] {symbol}: revenue_ttm={result['revenue_ttm']} ({price_currency}, converted from {financial_currency}), fcf_margin={result['fcf_margin']}, growth={result['revenue_growth_rate']}")
        else:
            print(f"[Yahoo DCF] {symbol}: revenue_ttm={result['revenue_ttm']}, fcf_margin={result['fcf_margin']}, growth={result['revenue_growth_rate']}")

    except Exception as e:
        print(f"[Yahoo DCF] Error fetching data for {symbol}: {e}")

    return result


def validate_dcf_inputs(dcf_inputs: Dict[str, Any]) -> bool:
    """
    Check if we have the minimum required data for DCF calculation.

    Required: revenue_ttm, fcf_margin, revenue_growth_rate
    """
    required_fields = ["revenue_ttm", "fcf_margin", "revenue_growth_rate"]

    for field in required_fields:
        if dcf_inputs.get(field) is None:
            return False

    # Additional validation: ensure values are reasonable
    if dcf_inputs["revenue_ttm"] <= 0:
        return False
    if not (-1 <= dcf_inputs["fcf_margin"] <= 1):  # FCF margin should be between -100% and 100%
        return False
    if not (-1 <= dcf_inputs["revenue_growth_rate"] <= 3):  # Growth should be reasonable (-100% to 300%)
        return False

    return True
