#!/usr/bin/env python3
"""
Test defeatbeta_api directly to see what methods are available and test ps_ratio.
"""

import sys

try:
    from defeatbeta_api.data.ticker import Ticker
    import pandas as pd
    print("✓ defeatbeta_api imported successfully")
except ImportError as e:
    print(f"✗ ERROR: Could not import defeatbeta_api: {e}")
    print("  Install it with: pip install defeatbeta-api")
    sys.exit(1)

def test_ticker(ticker_symbol: str):
    """Test a ticker symbol with defeatbeta_api."""
    print(f"\n{'='*60}")
    print(f"Testing ticker: {ticker_symbol}")
    print(f"{'='*60}")
    
    try:
        # Create Ticker object
        print(f"\n1. Creating Ticker object...")
        t = Ticker(ticker_symbol)
        print(f"   ✓ Ticker object created")
        
        # List all available methods
        print(f"\n2. Listing all available methods...")
        all_methods = [m for m in dir(t) if not m.startswith('_')]
        callable_methods = [m for m in all_methods if callable(getattr(t, m, None))]
        print(f"   Total methods: {len(callable_methods)}")
        print(f"   First 30 methods: {callable_methods[:30]}")
        
        # Look for ps_ratio related methods
        print(f"\n3. Searching for P/S ratio related methods...")
        ps_related = [m for m in callable_methods if any(term in m.lower() for term in ['ps', 'sales', 'ratio', 'price'])]
        print(f"   Methods containing 'ps', 'sales', 'ratio', or 'price':")
        for method in ps_related:
            print(f"     - {method}")
        
        # Test ps_ratio method specifically
        print(f"\n4. Testing ps_ratio() method...")
        if hasattr(t, 'ps_ratio'):
            print(f"   ✓ ps_ratio method exists")
            try:
                ps_df = t.ps_ratio()
                print(f"   ✓ ps_ratio() returned: {type(ps_df)}")
                if ps_df is None:
                    print(f"   ✗ ps_ratio() returned None")
                elif isinstance(ps_df, pd.DataFrame):
                    print(f"   ✓ ps_ratio() returned DataFrame")
                    print(f"     Shape: {ps_df.shape}")
                    print(f"     Empty: {ps_df.empty}")
                    if not ps_df.empty:
                        print(f"     Columns: {list(ps_df.columns)}")
                        print(f"     Last row:")
                        last_row = ps_df.iloc[-1]
                        for col in ps_df.columns:
                            print(f"       {col}: {last_row[col]}")
                        if 'ps_ratio' in ps_df.columns:
                            print(f"\n   ✓ P/S Ratio value: {last_row['ps_ratio']}")
                        else:
                            print(f"\n   ✗ 'ps_ratio' column not found in DataFrame")
                else:
                    print(f"   ? ps_ratio() returned unexpected type: {type(ps_df)}")
            except Exception as e:
                print(f"   ✗ ps_ratio() raised exception: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"   ✗ ps_ratio method does NOT exist")
            
            # Try alternative method names
            print(f"\n5. Trying alternative method names...")
            alternatives = ['price_to_sales', 'priceToSales', 'psRatio', 'PSRatio', 'price_sales_ratio']
            for alt in alternatives:
                if hasattr(t, alt):
                    print(f"   ✓ Found alternative: {alt}")
                    try:
                        result = getattr(t, alt)()
                        print(f"     Returned: {type(result)}")
                        if isinstance(result, pd.DataFrame) and not result.empty:
                            print(f"     Columns: {list(result.columns)}")
                    except Exception as e:
                        print(f"     Exception: {e}")
        
        # Try to get revenue and calculate manually
        print(f"\n6. Attempting to calculate P/S ratio manually...")
        try:
            # Get market cap
            summary = t.summary()
            if summary is not None and isinstance(summary, pd.DataFrame) and not summary.empty:
                if 'market_cap' in summary.columns:
                    market_cap = summary.iloc[0]['market_cap']
                    print(f"   Market Cap: ${market_cap:,.0f}")
                else:
                    print(f"   Market cap column not found. Available columns: {list(summary.columns)}")
                    market_cap = None
            else:
                print(f"   Summary not available")
                market_cap = None
            
            # Get revenue
            income_stmt = t.annual_income_statement()
            if income_stmt is not None and isinstance(income_stmt, pd.DataFrame) and not income_stmt.empty:
                print(f"   Income statement columns: {list(income_stmt.columns)}")
                revenue_cols = [col for col in income_stmt.columns if any(term in col.lower() for term in ['revenue', 'sales', 'total_revenue'])]
                if revenue_cols:
                    latest_revenue = income_stmt.iloc[-1][revenue_cols[0]]
                    print(f"   Latest revenue ({revenue_cols[0]}): ${latest_revenue:,.0f}")
                    if market_cap and latest_revenue and latest_revenue > 0:
                        ps_ratio = market_cap / latest_revenue
                        print(f"\n   ✓ Calculated P/S Ratio: {ps_ratio:.2f}")
                    else:
                        print(f"   ✗ Cannot calculate (market_cap={market_cap}, revenue={latest_revenue})")
                else:
                    print(f"   ✗ No revenue column found")
            else:
                print(f"   ✗ Income statement not available")
        except Exception as e:
            print(f"   ✗ Calculation failed: {e}")
            import traceback
            traceback.print_exc()
        
    except Exception as e:
        print(f"\n✗ ERROR: Failed to test {ticker_symbol}: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    ticker = sys.argv[1] if len(sys.argv) > 1 else "TSLA"
    test_ticker(ticker.upper())

