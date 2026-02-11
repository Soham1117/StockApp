# DefeatBeta Point-in-Time (PIT) Fundamentals Lab

Goal: figure out what DefeatBeta can give you for **historical fundamentals** and whether it includes enough timestamps to do a true **point-in-time** backtest (no peeking).

## What this tests

- Can we pull quarterly/annual financial statements for a symbol?
- Do those statements include **publication/filing dates** (the date the market could have known them)?
- If not, what’s the best “DIY PIT” approximation (use a reporting lag)?

## Quick start (PowerShell)

These scripts force UTF-8 output (DefeatBeta prints a banner with emojis on import) and apply a Windows DuckDB config that avoids the `cache_httpfs` extension issue.

```powershell
cd experiments/defeatbeta_pit
.\run.ps1 inspect
.\run.ps1 sample AAPL
.\run.ps1 pit-demo AAPL 2019-12-31
```

## Notes / expectations

- DefeatBeta’s statement methods return a wide table keyed by **period-end dates** (columns like `2024-03-31`), which is useful history but may **not** be true PIT unless a filing/publication timestamp is available elsewhere.
- If there is no “as-reported available date”, the usual safe approximation is:
  - quarterly statements become usable `45` days after period end
  - annual statements become usable `90` days after period end

