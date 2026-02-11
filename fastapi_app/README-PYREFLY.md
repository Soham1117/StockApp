# Pyrefly Setup Guide

Pyrefly is a fast type checker from Meta that helps catch type errors, improve code quality, and provide better IDE support.

## Installation

### Local Development

```bash
cd fastapi_app
pip install -r requirements-dev.txt
```

### Docker (Optional - for CI/CD)

Add to Dockerfile if you want type checking in CI:

```dockerfile
# Add to Dockerfile (optional, only for dev/CI)
RUN pip install pyrefly
```

## Configuration

Configuration files are already created:
- `pyrefly.toml` - Main configuration
- `.pyreflyignore` - Files to ignore

## Usage

### Check Types

```bash
# From fastapi_app directory
pyrefly check

# Check specific file
pyrefly check main.py

# Check with more verbose output
pyrefly check --verbose
```

### IDE Integration

**VS Code:**
1. Install "Pyrefly" extension from marketplace
2. Restart VS Code
3. Type checking will work automatically

**PyCharm:**
- Pyrefly support is coming soon (use command line for now)

## Common Improvements

### 1. Add Return Type Annotations

**Before:**
```python
def _get_ticker(symbol: str):
    return Ticker(symbol.upper())
```

**After:**
```python
def _get_ticker(symbol: str) -> Ticker:
    return Ticker(symbol.upper())
```

### 2. Add Type Hints for Complex Returns

**Before:**
```python
def _calculate_symbol_metrics(symbol: str):
    return {...}
```

**After:**
```python
def _calculate_symbol_metrics(symbol: str) -> Dict[str, Optional[float]]:
    return {...}
```

### 3. Use TypedDict for Structured Data

**Before:**
```python
def get_metrics() -> Dict[str, Any]:
    return {"pe": 10.5, "pb": 2.0}
```

**After:**
```python
from typing import TypedDict

class MetricsDict(TypedDict):
    pe: float
    pb: float

def get_metrics() -> MetricsDict:
    return {"pe": 10.5, "pb": 2.0}
```

## Benefits for Your Codebase

1. **Catch Type Errors Early**: Find bugs before runtime
2. **Better IDE Support**: Autocomplete, navigation, refactoring
3. **Documentation**: Type hints serve as inline documentation
4. **Refactoring Safety**: Catch breaking changes when refactoring
5. **API Contracts**: Ensure FastAPI endpoints have correct types

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/ci.yml (example)
- name: Type check with Pyrefly
  run: |
    cd fastapi_app
    pip install -r requirements-dev.txt
    pyrefly check
```

## Gradual Adoption

You don't need to fix all type errors at once:
1. Start with new code - add types to new functions
2. Fix critical paths - add types to frequently used functions
3. Gradually improve existing code

Pyrefly will only check files you've added type hints to (unless you enable strict mode).

