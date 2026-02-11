"""
Offline / batch helpers for extracting high-level insights from SEC filings and
earnings call transcripts, to be consumed by the frontend research report.

This module is intentionally lightweight and focused on shaping data; the
heavier LLM work should be invoked from separate scripts or notebooks using
these helpers.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Dict, List, Optional


INSIGHTS_DIR = Path(os.getenv("SEC_INSIGHTS_DIR", "data/sec_insights"))
INSIGHTS_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_str(text: Optional[str]) -> str:
    if text is None:
        return ""
    return str(text).strip()


@dataclass
class BusinessUpdate:
    theme: str
    summary: str
    driver: Optional[str] = None
    impact: Optional[str] = None
    confidence: Optional[str] = None


@dataclass
class RiskChange:
    theme: str
    change: str  # e.g. "new", "higher", "lower", "unchanged"
    summary: str
    impact: Optional[str] = None


@dataclass
class LiquidityInsight:
    summary: str
    liquidity: Optional[str] = None
    leverage: Optional[str] = None
    capital_allocation: Optional[str] = None


@dataclass
class AccountingFlag:
    area: str
    summary: str
    severity: Optional[str] = None


@dataclass
class Highlight:
    category: str
    summary: str
    details: Optional[str] = None


@dataclass
class ProductSegment:
    name: str
    description: str
    performance: Optional[str] = None
    revenue_contribution: Optional[str] = None


@dataclass
class ForwardGuidance:
    metric: str  # e.g. "Revenue", "Gross Margin", "Operating Expenses"
    guidance: str
    timeframe: Optional[str] = None
    confidence: Optional[str] = None


@dataclass
class CategorizedRisk:
    category: str  # e.g. "Geopolitical", "Supply Chain", "Competitive", "Regulatory", "Technology", "Financial"
    risk: str
    severity: Optional[str] = None
    mitigation: Optional[str] = None


@dataclass
class FilingInsights:
    """
    Compact representation of the key takeaways from a single SEC filing.
    """

    symbol: str
    cik: str
    accession: str
    filing_type: str
    filed_at: str
    business_updates: List[BusinessUpdate] = field(default_factory=list)
    risk_changes: List[RiskChange] = field(default_factory=list)
    liquidity_and_capital: List[LiquidityInsight] = field(default_factory=list)
    accounting_flags: List[AccountingFlag] = field(default_factory=list)
    other_highlights: List[Highlight] = field(default_factory=list)
    product_segments: List[ProductSegment] = field(default_factory=list)
    forward_guidance: List[ForwardGuidance] = field(default_factory=list)
    categorized_risks: List[CategorizedRisk] = field(default_factory=list)


def _insights_path(symbol: str, filing_type: str, accession: str) -> Path:
    symbol_dir = INSIGHTS_DIR / symbol.upper()
    symbol_dir.mkdir(parents=True, exist_ok=True)
    safe_filing = filing_type.replace("/", "_").replace(" ", "_")
    safe_acc = accession.replace("-", "")
    return symbol_dir / f"{safe_filing}_{safe_acc}.json"


def save_filing_insights(insights: FilingInsights) -> Path:
    """
    Save a FilingInsights object to JSON under INSIGHTS_DIR.
    """
    target = _insights_path(insights.symbol, insights.filing_type, insights.accession)
    payload: Dict[str, Any] = asdict(insights)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def load_filing_insights(symbol: str) -> List[Dict[str, Any]]:
    """
    Load all filing insight JSON blobs for a symbol, if any.
    """
    symbol_dir = INSIGHTS_DIR / symbol.upper()
    if not symbol_dir.exists():
        return []

    results: List[Dict[str, Any]] = []
    for path in sorted(symbol_dir.glob("*.json"), reverse=True):
        try:
            content = path.read_text(encoding="utf-8")
            data = json.loads(content)
            results.append(data)
        except Exception:
            continue
    return results


def latest_filing_insight(symbol: str, filing_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Return the most recent FilingInsights dict for a symbol, optionally filtered by filing type.
    """
    symbol_dir = INSIGHTS_DIR / symbol.upper()
    if not symbol_dir.exists():
        return None

    candidates = sorted(symbol_dir.glob("*.json"), reverse=True)
    for path in candidates:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if filing_type and data.get("filing_type") != filing_type:
            continue
        return data
    return None