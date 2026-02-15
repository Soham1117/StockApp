"""
Helpers for storing and retrieving structured insights extracted from
earnings call transcripts. These JSON artifacts are produced by offline
LLM jobs and later consumed by the research-report endpoint.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Dict, List, Optional


TRANSCRIPT_INSIGHTS_DIR = Path(
    os.getenv("TRANSCRIPT_INSIGHTS_DIR", "data/transcript_insights")
)
TRANSCRIPT_INSIGHTS_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class GuidanceChange:
    metric: str  # e.g. "revenue", "EPS", "margin"
    direction: str  # "raised", "lowered", "maintained", "withdrawn"
    summary: str
    magnitude: Optional[str] = None


@dataclass
class DriverInsight:
    area: str  # e.g. "datacenter", "client", "pricing"
    summary: str
    positive: Optional[bool] = None
    detail: Optional[str] = None


@dataclass
class ToneInsight:
    management: Optional[str] = None
    analysts: Optional[str] = None
    confidence: Optional[str] = None


@dataclass
class ExecutionFlag:
    issue: str
    severity: Optional[str] = None
    summary: str = ""


@dataclass
class QuoteHighlight:
    speaker: Optional[str] = None
    sentiment: Optional[str] = None
    summary: str = ""


@dataclass
class TranscriptInsights:
    symbol: str
    fiscal_year: int
    fiscal_quarter: int
    call_date: Optional[str] = None
    guidance_changes: List[GuidanceChange] = field(default_factory=list)
    drivers: List[DriverInsight] = field(default_factory=list)
    tone: ToneInsight = field(default_factory=ToneInsight)
    execution_flags: List[ExecutionFlag] = field(default_factory=list)
    key_quotes: List[QuoteHighlight] = field(default_factory=list)


def _insight_path(symbol: str, fiscal_year: int, fiscal_quarter: int) -> Path:
    symbol_dir = TRANSCRIPT_INSIGHTS_DIR / symbol.upper()
    symbol_dir.mkdir(parents=True, exist_ok=True)
    return symbol_dir / f"{fiscal_year}Q{fiscal_quarter}.json"


def save_transcript_insights(insights: TranscriptInsights) -> Path:
    path = _insight_path(
        insights.symbol, insights.fiscal_year, insights.fiscal_quarter
    )
    payload: Dict[str, Any] = asdict(insights)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_transcript_insights(symbol: str) -> List[Dict[str, Any]]:
    symbol_dir = TRANSCRIPT_INSIGHTS_DIR / symbol.upper()
    if not symbol_dir.exists():
        return []

    results: List[Dict[str, Any]] = []
    for path in sorted(symbol_dir.glob("*.json"), reverse=True):
        try:
            results.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return results


def latest_transcript_insights(symbol: str) -> Optional[Dict[str, Any]]:
    symbol_dir = TRANSCRIPT_INSIGHTS_DIR / symbol.upper()
    if not symbol_dir.exists():
        return None

    for path in sorted(symbol_dir.glob("*.json"), reverse=True):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
    return None


