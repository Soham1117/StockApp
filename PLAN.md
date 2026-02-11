# One-Click Pipeline Plan

## Goals
- Provide a single action that runs the existing RRG -> Industry Analysis -> Top-N PDF flow.
- Reuse existing endpoints and data files; no re-implementation of analysis logic.
- Keep the UX simple: one click, one report link/download.

## Current Building Blocks (Already Implemented)
- RRG history/precompute scripts and data files (rrg_history_{lookback}d.json, rrg_transitions_{lookback}d.json, rrg_analogs_{lookback}d.pkl).
- Industry analysis endpoint: POST /api/industry/{industry}/analysis (filters + weights + ranking).
- Stock research report endpoint: GET /api/stocks/{symbol}/research-report (LLM, fundamentals, peers).
- Multi-stock PDF endpoint: POST /api/industry/{industry}/reports/pdf (merges per-stock PDFs).

## Proposed Flow (No New Logic)
1) Use RRG to pick a sector (existing /api/rrg or /api/rrg/predict).
2) Use Industry Analysis for the chosen sector (existing /api/industry/{industry}/analysis).
3) Generate Top-N report PDF using existing /api/industry/{industry}/reports/pdf.

## Implementation Plan

### 1) Orchestrator Endpoint (Lightweight)
- Create POST /api/pipeline/one-click (Next.js API route).
- Input: lookback_days, top_n, filters, weights (optional), sector override (optional).
- Steps:
  - If sector override provided, use it.
  - Else call /api/rrg (or /api/rrg/predict) to determine the top sector.
  - Call /api/industry/{sector}/analysis with current filters/weights.
  - Build Top-N list from passing symbols (ranked list).
  - Call /api/industry/{sector}/reports/pdf and return a download URL or stream the PDF.
- Notes:
  - Must not change any analysis logic.
  - Must reuse existing endpoints and data contracts.

### 2) UI Hookup
- Add a single button on the RRG/Industry page (location TBD).
- Button triggers /api/pipeline/one-click.
- UI shows progress states and then opens/downloads the PDF.

### 3) Guardrails
- If RRG data missing, show actionable error (run precompute scripts).
- If no passing symbols, show a clear message and stop.
- If PDF generation fails for a symbol, include error page (already supported).

## Open Questions
- Which page should host the one-click button?
- How to select the sector from RRG: top rank by RS or a fixed quadrant filter?
- Should the report be auto-downloaded or opened in a new tab?

## Non-Goals (Out of Scope)
- Rebuilding RRG, analysis, or report generation logic.
- Building new scoring models.
- Adding new data sources.
