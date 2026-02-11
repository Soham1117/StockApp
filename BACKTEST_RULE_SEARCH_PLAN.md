# Backtest Rule Search Plan

## Goal
Create a script that runs backtests across combinations of:
- Years: 1/2/3 (holding period or backtest window, confirm)
- Sector: 10–11 sectors (current sector universe)
- Cap bucket: large/mid/small
- Rule set: start with a single rule P/E > 0 using the 6 fundamentals

Capture results and rank rule sets by performance.

## Why This Can Help / Risks
- Good for exploring which rules *appear* strong historically.
- High risk of overfitting: brute-forcing rules across many combinations can optimize to noise.
- Survivorship bias: the backtest universe uses today’s sector metrics, so results can be inflated.
- Data‑snooping: selecting rules based purely on max return will likely degrade out‑of‑sample.

## Guardrails (Recommended)
- Always report results with: number of points, average return, win rate, and volatility proxy.
- Require minimum sample size per combo (e.g., >= 8 points) or mark as “low confidence.”
- Use a simple train/test split (e.g., first 70% years train, last 30% test) to sanity‑check rules.
- Prefer stable rules (consistent across sectors/caps) over single best spikes.

## Implementation Plan

### 1) Define Search Space
- Sectors: use existing sector list (same as RRG ETFs or sector-metrics.json keys).
- Caps: large, mid, small.
- Years: 1/2/3 (confirm whether this is `years` or `holding_years`).
- Rule sets:
  - Start with `{ pe_positive: true, pe_below_universe_mean: false }`.
  - Expand later to combinations of the 6 fundamentals (P/E, P/S, P/B, EV/EBIT, EV/EBITDA, EV/Sales) with simple thresholds.

### 2) Script Inputs
- CLI args: `--years`, `--holding-years`, `--sectors`, `--caps`, `--rule-set`, `--top-n`, `--lag-days`.
- Default: years=10, holding_years=1, top_n=10, lag_days=90.

### 3) Run Backtests
- For each (sector, cap, years, rule-set):
  - Call existing `/api/backtest/sector` with filters:
    - `filters.cap = cap`
    - `filters.customRules` based on the rule set
    - `rules` for P/E positive / P/E below mean (when relevant)
- Collect summary + per-point metrics.

### 4) Scoring & Output
- Output CSV/JSON with fields:
  - sector, cap, years, rule_set_id
  - avg_portfolio_return, avg_benchmark_return, win_rate
  - points_with_returns, filtered_size_avg, note
- Rank by avg_portfolio_return, but show win_rate and sample size to avoid false leaders.

### 5) Review & Iteration
- Inspect top 3–5 rule sets per sector/cap/years.
- Add a “stability score” if rules perform consistently across sectors/caps.

## Open Questions
- What does “year(1/2/3)” mean: backtest length (`years`) or holding period (`holding_years`)?
- Do you want to include P/E mean rule or only thresholds on the 6 fundamentals?
- Should we save results under `data/` or a new `reports/` folder?
