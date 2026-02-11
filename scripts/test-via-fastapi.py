#!/usr/bin/env python3
"""
Test defeatbeta_api methods via FastAPI endpoint with detailed output.
This works around local DuckDB issues by using the Docker container.
"""

import requests
import json
import sys
from urllib.parse import urljoin

def test_via_fastapi(fastapi_url: str, ticker_symbol: str):
    """Test ticker via FastAPI /metrics endpoint."""
    print(f"\n{'='*60}")
    print(f"Testing {ticker_symbol} via FastAPI: {fastapi_url}")
    print(f"{'='*60}\n")
    
    try:
        # Test /metrics endpoint
        print("1. Testing /metrics endpoint...")
        response = requests.post(
            urljoin(fastapi_url, "/metrics"),
            json={"symbols": [ticker_symbol]},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        
        metrics = data.get("metrics", [])
        if metrics and len(metrics) > 0:
            metric_data = metrics[0]
            print(f"   ✓ Received metrics data")
            print(f"\n   Full response:")
            print(json.dumps(metric_data, indent=2, default=str))
            
            # Check each metric
            print(f"\n2. Metric values:")
            for key, value in metric_data.items():
                status = "✓" if value is not None else "✗"
                print(f"   {status} {key}: {value}")
            
            # Highlight P/S ratio
            ps_ratio = metric_data.get("priceToSalesRatioTTM")
            if ps_ratio is not None:
                print(f"\n   ✓ P/S Ratio found: {ps_ratio:.2f}")
            else:
                print(f"\n   ✗ P/S Ratio is None")
        else:
            print(f"   ✗ No metrics returned")
            
    except requests.exceptions.RequestException as e:
        print(f"\n✗ ERROR: Request failed: {e}")
        return False
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    fastapi_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    ticker = sys.argv[2] if len(sys.argv) > 2 else "TSLA"
    
    print(f"FastAPI URL: {fastapi_url}")
    print(f"Ticker: {ticker}")
    
    test_via_fastapi(fastapi_url, ticker.upper())
    
    print(f"\n{'='*60}")
    print("NOTE: Check Docker logs for detailed debug output:")
    print("  docker logs defeatbeta-api")
    print(f"{'='*60}")

