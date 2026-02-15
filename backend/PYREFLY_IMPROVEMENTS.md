# Pyrefly Improvements for Your FastAPI Code

## Current Issues Pyrefly Will Catch

### 1. Inaccurate Return Type Annotations

**Current Code (main.py:1614):**
```python
def _calculate_symbol_metrics(symbol: str) -> Dict[str, Optional[float]]:
    return {
        "symbol": symbol,
        "marketCap": _sanitize_float(market_cap),
        "profitability": profitability,  # This is a Dict, not Optional[float]!
        "financialHealth": financial_health,  # This is a Dict, not Optional[float]!
        ...
    }
```

**Problem**: Return type says `Dict[str, Optional[float]]` but actually returns nested Dicts.

**Pyrefly will catch**: Type mismatch errors

**Improved with TypedDict:**
```python
from typing import TypedDict, NotRequired

class ProfitabilityDict(TypedDict):
    roic: NotRequired[Optional[float]]
    roe: NotRequired[Optional[float]]
    operatingMargin: NotRequired[Optional[float]]
    netMargin: NotRequired[Optional[float]]

class FinancialHealthDict(TypedDict):
    debtToEquity: NotRequired[Optional[float]]
    interestCoverage: NotRequired[Optional[float]]
    ocfToDebt: NotRequired[Optional[float]]

class MetricsDict(TypedDict):
    symbol: str
    marketCap: NotRequired[Optional[float]]
    sharesOutstanding: NotRequired[Optional[int]]
    peRatioTTM: NotRequired[Optional[float]]
    profitability: ProfitabilityDict
    financialHealth: FinancialHealthDict
    # ... other fields

def _calculate_symbol_metrics(symbol: str) -> MetricsDict:
    # Now Pyrefly can verify the return structure matches
    ...
```

### 2. Missing Type Hints in Endpoints

**Current Code:**
```python
@app.post("/metrics")
def metrics(payload: SymbolsPayload):
    symbols = payload.symbols
    # ...
```

**Improved:**
```python
from fastapi import Response

@app.post("/metrics")
def metrics(payload: SymbolsPayload) -> Dict[str, List[Dict[str, Any]]]:
    """
    Returns: {"metrics": [MetricsDict, ...]}
    """
    symbols = payload.symbols
    # ...
```

### 3. Optional Type Handling

**Current Code:**
```python
def _get_market_cap(symbol: str) -> Optional[float]:
    # ...
```

**Pyrefly helps catch:**
```python
market_cap = _get_market_cap("AAPL")
# Pyrefly warns: market_cap might be None
result = market_cap / 1000  # Error if market_cap is None!

# Fixed:
if market_cap is not None:
    result = market_cap / 1000
```

### 4. Thread Safety Issues

**Current Code:**
```python
_FINBERT_TOKENIZER: Optional[AutoTokenizer] = None
_FINBERT_MODEL: Optional[AutoModelForSequenceClassification] = None

def _ensure_finbert_loaded():
    global _FINBERT_TOKENIZER, _FINBERT_MODEL
    # ...
```

**Pyrefly can help verify:**
- Thread-safe access patterns
- Proper None checks before use
- Type consistency across threads

## Quick Wins

### Run Pyrefly to Find Issues

```bash
cd backend
pip install pyrefly
pyrefly check main.py
```

**Expected Output:**
```
main.py:1614: error: Return type annotation doesn't match actual return type
  Expected: Dict[str, Optional[float]]
  Actual: Dict[str, Union[Optional[float], Dict[str, Optional[float]]]]
```

### Fix Priority Order

1. **High Priority**: Fix return type mismatches (prevents runtime errors)
2. **Medium Priority**: Add type hints to public API endpoints
3. **Low Priority**: Improve internal function type hints

## Example: Fixing _calculate_symbol_metrics

Here's how to properly type it:

```python
from typing import TypedDict, NotRequired

class ValuationRatios(TypedDict):
    symbol: str
    marketCap: NotRequired[Optional[float]]
    sharesOutstanding: NotRequired[Optional[int]]
    peRatioTTM: NotRequired[Optional[float]]
    priceToSalesRatioTTM: NotRequired[Optional[float]]
    priceToBookRatioTTM: NotRequired[Optional[float]]
    enterpriseValueOverEBITTTM: NotRequired[Optional[float]]
    enterpriseValueOverEBITDATTM: NotRequired[Optional[float]]
    enterpriseValueToSalesTTM: NotRequired[Optional[float]]
    dividendYieldTTM: NotRequired[Optional[float]]
    revenueGrowthTTM: NotRequired[Optional[float]]
    profitability: Dict[str, Optional[float]]
    financialHealth: Dict[str, Optional[float]]
    cashFlow: Dict[str, Optional[float]]
    growth: Dict[str, Optional[float]]
    valuationExtras: Dict[str, Optional[float]]

@lru_cache(maxsize=1024)
def _calculate_symbol_metrics(symbol: str) -> ValuationRatios:
    # Now Pyrefly can verify this matches the TypedDict structure
    ...
```

## Benefits

1. **Catch Bugs Before Runtime**: Type errors found during development
2. **Better IDE Support**: Autocomplete knows exact structure of return values
3. **Safer Refactoring**: Change a type, Pyrefly shows all affected code
4. **Documentation**: Types serve as inline documentation
5. **API Contracts**: FastAPI can validate request/response types

## Next Steps

1. Install Pyrefly: `pip install -r requirements-dev.txt`
2. Run check: `pyrefly check main.py`
3. Fix errors one by one, starting with return types
4. Add to pre-commit hook (optional)
5. Integrate into CI/CD (optional)

