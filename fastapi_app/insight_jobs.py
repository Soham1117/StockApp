"""
Shared helpers for generating FilingInsights and TranscriptInsights.
Used by both the FastAPI endpoints and the offline scripts.
"""

from __future__ import annotations

from pathlib import Path
import os

# Load environment variables from .env files BEFORE reading them
# Try loading from both fastapi_app/.env and project root .env/.env.local
REPO_ROOT = Path(__file__).resolve().parents[1]
FASTAPI_ROOT = Path(__file__).resolve().parent

# Load .env files (order matters - later files override earlier ones)
try:
    from dotenv import load_dotenv
    # Load from project root first (lower priority)
    load_dotenv(REPO_ROOT / ".env", override=False)
    load_dotenv(REPO_ROOT / ".env.local", override=False)
    # Load from fastapi_app directory (higher priority)
    load_dotenv(FASTAPI_ROOT / ".env", override=True)
    load_dotenv(FASTAPI_ROOT / ".env.local", override=True)
except ImportError:
    # python-dotenv not installed, skip loading .env files
    pass

import json
import re
import warnings
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from sec_download import download_filing, _fetch_submissions  # type: ignore
from sec_insights import (
  FilingInsights,
  BusinessUpdate,
  RiskChange,
  LiquidityInsight,
  AccountingFlag,
  Highlight,
  ProductSegment,
  ForwardGuidance,
  CategorizedRisk,
  save_filing_insights,
)
from transcript_insights import (
  TranscriptInsights,
  GuidanceChange,
  DriverInsight,
  ToneInsight,
  ExecutionFlag,
  QuoteHighlight,
  save_transcript_insights,
)  # type: ignore
from defeatbeta_api.data.ticker import Ticker  # type: ignore


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
INSIGHTS_DEBUG = os.getenv("INSIGHTS_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")

# Some SEC filings are served as XML; we still strip to plain text, so suppress noisy parser warnings.
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


def _debug(msg: str) -> None:
  if INSIGHTS_DEBUG:
    print(msg, flush=True)


def _call_llm(prompt: str, max_tokens: int = 1200) -> str:
  """
  Call OpenAI API for LLM completion.
  """
  if not OPENAI_API_KEY:
    raise RuntimeError(
      "OPENAI_API_KEY environment variable is not set. "
      "Please set it to use LLM-based insights generation."
    )

  body = {
    "model": OPENAI_MODEL,
    "messages": [
      {"role": "system", "content": "You are a JSON-only API. You respond ONLY with valid JSON objects. Never include explanatory text."},
      {"role": "user", "content": prompt}
    ],
    "temperature": 0.1,
    "max_tokens": max_tokens,
  }

  try:
    _debug(f"[insights] Calling OpenAI API with model {OPENAI_MODEL}")
    response = requests.post(
      "https://api.openai.com/v1/chat/completions",
      headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
      },
      json=body,
      timeout=120,
    )
    response.raise_for_status()
    data = response.json()

    try:
      content = data["choices"][0]["message"]["content"]
      return content
    except (KeyError, IndexError) as exc:
      raise RuntimeError(f"OpenAI API response missing content: {data}") from exc
  except requests.exceptions.RequestException as exc:
    raise RuntimeError(f"Failed to call OpenAI API: {exc}") from exc


def _extract_json_from_text(text: str) -> Dict[str, Any]:
  """
  Robustly extract JSON from LLM output, handling markdown code blocks,
  trailing commas, and extra text.
  """
  _debug(f"[insights] Raw LLM output length: {len(text)} chars")

  # Remove markdown code blocks if present
  if "```json" in text:
    start_marker = text.find("```json")
    end_marker = text.find("```", start_marker + 7)
    if end_marker != -1:
      text = text[start_marker + 7 : end_marker].strip()
  elif "```" in text:
    start_marker = text.find("```")
    end_marker = text.find("```", start_marker + 3)
    if end_marker != -1:
      text = text[start_marker + 3 : end_marker].strip()

  # Find JSON object boundaries
  start = text.find("{")
  end = text.rfind("}")
  if start == -1 or end == -1:
    raise ValueError("LLM output missing JSON object")
  
  json_str = text[start : end + 1]
  
  # Try to fix common JSON issues
  # Remove trailing commas before closing braces/brackets
  json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
  
  # Try parsing
  try:
    return json.loads(json_str)
  except json.JSONDecodeError as e:
    # If still fails, try to extract just the first valid JSON object
    # by finding balanced braces
    brace_count = 0
    valid_start = start
    valid_end = start
    for i, char in enumerate(text[start:], start=start):
      if char == "{":
        if brace_count == 0:
          valid_start = i
        brace_count += 1
      elif char == "}":
        brace_count -= 1
        if brace_count == 0:
          valid_end = i
          break
    
    if valid_start < valid_end:
      json_str = text[valid_start : valid_end + 1]
      json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
      try:
        return json.loads(json_str)
      except json.JSONDecodeError:
        pass
    
    # Last resort: raise with helpful error
    raise ValueError(f"Failed to parse JSON from LLM output: {e}. Text snippet: {json_str[:200]}")


# -----------------------------------------------------------------------------
# Filing insights
# -----------------------------------------------------------------------------

SECTION_LABELS_10K = [
  ("business", "ITEM 1."),
  ("risk", "ITEM 1A."),
  ("mdna", "ITEM 7."),
  ("liquidity", "ITEM 7A."),
]
SECTION_LABELS_10Q = [
  ("business", "ITEM 1."),
  ("risk", "ITEM 1A."),
  ("mdna", "ITEM 2."),
  ("liquidity", "ITEM 2."),
]

FILING_PROMPT = """CRITICAL INSTRUCTION: You MUST respond with ONLY valid JSON. Do not include any explanatory text, summaries, or commentary.

Analyze the provided SEC filing sections for {symbol} ({form}, filed {filed_at}).

YOUR RESPONSE MUST BE ONLY THIS JSON SCHEMA (nothing else):
{{
  "business_updates": [
    {{"theme": "...", "summary": "...", "driver": "...", "impact": "...", "confidence": "..."}}
  ],
  "risk_changes": [
    {{"theme": "...", "change": "new|higher|lower|unchanged", "summary": "...", "impact": "..."}}
  ],
  "liquidity_and_capital": [
    {{"summary": "...", "liquidity": "...", "leverage": "...", "capital_allocation": "..."}}
  ],
  "accounting_flags": [
    {{"area": "...", "summary": "...", "severity": "..."}}
  ],
  "other_highlights": [
    {{"category": "...", "summary": "...", "details": "..."}}
  ],
  "product_segments": [
    {{"name": "...", "description": "...", "performance": "...", "revenue_contribution": "..."}}
  ],
  "forward_guidance": [
    {{"metric": "Revenue|Gross Margin|Operating Expenses|etc", "guidance": "...", "timeframe": "Q1 2025|FY2025|etc", "confidence": "high|medium|low"}}
  ],
  "categorized_risks": [
    {{"category": "Geopolitical|Supply Chain|Competitive|Regulatory|Technology|Financial", "risk": "...", "severity": "high|medium|low", "mitigation": "..."}}
  ]
}}

CRITICAL RULES:
1. Your response MUST start with opening brace and end with closing brace
2. Return ONLY valid JSON - NO other text, explanations, or summaries
3. Use ONLY the provided filing text
4. Keep summaries concise (one or two sentences)
5. If a field has no relevant information, return an empty array for that field

EXTRACTION GUIDELINES:
- product_segments: Look for business segment discussions, product lines, markets served (Data Center, Gaming, Embedded, etc.)
- forward_guidance: Extract any forward-looking statements about revenue, margins, expenses, or other metrics with specific numbers or ranges
- categorized_risks: Classify each risk into one of the categories (Geopolitical, Supply Chain, Competitive, Regulatory, Technology, Financial) and extract mitigation strategies if mentioned

Sections:
<BusinessOverview>
{business}
</BusinessOverview>
<RiskFactors>
{risk}
</RiskFactors>
<MDandA>
{mdna}
</MDandA>
<Liquidity>
{liquidity}
</Liquidity>
"""


def _load_plain_text(path: Path) -> str:
  raw = path.read_text(encoding="utf-8", errors="ignore")
  soup = BeautifulSoup(raw, "lxml")
  # Strip inline XBRL header blocks so we don't feed metadata to the LLM.
  for tag in soup.find_all(["ix:header", "ix:hidden", "ix:references", "ix:resources"]):
    tag.decompose()
  return soup.get_text("\n")


def _extract_sections_from_html(raw_html: str, filing_type: str) -> Dict[str, str]:
  upper = raw_html.upper()
  positions: List[Tuple[int, str]] = []

  labels = SECTION_LABELS_10K if filing_type.upper().startswith("10-K") else SECTION_LABELS_10Q
  for key, label in labels:
    idx = upper.find(label)
    if idx != -1:
      positions.append((idx, key))

  if not positions:
    patterns = {
      "business": [
        r"\bITEM\s+1\b",
        r"\bBUSINESS\b",
      ],
      "risk": [
        r"\bITEM\s+1A\b",
        r"\bRISK\s+FACTORS\b",
      ],
      "mdna": [
        r"\bITEM\s+2\b",
        r"\bMANAGEMENT[’']S\s+DISCUSSION",
        r"\bMD&A\b",
      ],
      "liquidity": [
        r"\bLIQUIDITY\b",
        r"\bCAPITAL\s+RESOURCES\b",
      ],
    }
    for key, regexes in patterns.items():
      for regex in regexes:
        match = re.search(regex, upper)
        if match:
          positions.append((match.start(), key))
          break

  if not positions:
    _debug("[insights] HTML section labels not found; falling back to full document.")
    return {"full_document": raw_html}

  positions.sort()
  sections: Dict[str, str] = {}
  for i, (start, key) in enumerate(positions):
    end = positions[i + 1][0] if i + 1 < len(positions) else len(raw_html)
    sections[key] = raw_html[start:end]
  return sections


def _html_fragment_to_text(fragment: str) -> str:
  soup = BeautifulSoup(fragment, "lxml")
  for tag in soup.find_all(["ix:header", "ix:hidden", "ix:references", "ix:resources"]):
    tag.decompose()
  return soup.get_text("\n")


def _extract_sections_with_sec_parser(
  raw_html: str,
  filing_type: str,
) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
  try:
    from sec_parser.processing_engine import Edgar10QParser  # type: ignore
    try:
      from sec_parser.processing_engine import Edgar10KParser  # type: ignore
    except Exception:
      Edgar10KParser = None  # type: ignore
    from sec_parser.semantic_elements import (  # type: ignore
      TopSectionTitle,
      TextElement,
      TitleElement,
      PageHeaderElement,
      PageNumberElement,
      EmptyElement,
      IrrelevantElement,
    )
    try:
      from sec_parser.semantic_elements import HighlightedTextElement  # type: ignore
    except Exception:
      from sec_parser.semantic_elements.highlighted_text_element import (  # type: ignore
        HighlightedTextElement,
      )
  except Exception as exc:
    _debug(f"[insights] sec-parser unavailable: {exc}")
    return {}, {}

  parser = Edgar10QParser()
  if filing_type.upper().startswith("10-K") and Edgar10KParser is not None:
    parser = Edgar10KParser()
    print("0---------------------------------------------------------------------------------------")
  elements = parser.parse(raw_html)

  _debug(f"[insights] sec-parser elements: {len(elements)}")

  section_text: Dict[str, List[str]] = {}
  section_titles: Dict[str, List[str]] = {}
  current_section: str | None = None
  skip_types = (PageHeaderElement, PageNumberElement, EmptyElement, IrrelevantElement)

  def _map_top_section_title(title_text: str) -> str | None:
    upper = title_text.upper()
    if filing_type.upper().startswith("10-K"):
      if re.search(r"\bITEM\s+1A\b", upper):
        return "risk"
      if re.search(r"\bITEM\s+7A\b", upper):
        return "risk"
      if re.search(r"\bITEM\s+7\b", upper) and "ITEM 7A" not in upper:
        return "mdna"
      if re.search(r"\bITEM\s+1\b", upper):
        return "business"
      return None
    if filing_type.upper().startswith("10-Q"):
      if re.search(r"\bITEM\s+1A\b", upper):
        return "risk"
      if re.search(r"\bITEM\s+2\b", upper):
        return "mdna"
      if re.search(r"\bITEM\s+1\b", upper):
        return "business"
      return None
    return None

  for element in elements:
    if isinstance(element, TopSectionTitle):
      if filing_type.upper().startswith("10-K") and Edgar10KParser is None:
        mapped = _map_top_section_title(element.text)
        if mapped:
          current_section = mapped
          section_text.setdefault(current_section, [])
          section_titles.setdefault(current_section, [])
          _debug(f"[insights] sec-parser section: {current_section} -> {element.text[:120]}")
        else:
          current_section = None
        continue

      current_section = element.section_type.identifier
      section_text.setdefault(current_section, [])
      section_titles.setdefault(current_section, [])
      _debug(f"[insights] sec-parser section: {current_section} -> {element.text[:120]}")
      continue
    if isinstance(element, TitleElement):
      mapped = _map_top_section_title(element.text)
      if mapped:
        current_section = mapped
        section_text.setdefault(current_section, [])
        section_titles.setdefault(current_section, [])
        _debug(f"[insights] sec-parser section: {current_section} -> {element.text[:120]}")
    if current_section is None:
      continue
    if isinstance(element, skip_types):
      continue
    if isinstance(element, TitleElement):
      title_value = element.text.strip()
      if title_value:
        section_titles[current_section].append(title_value)
    if isinstance(element, (TextElement, HighlightedTextElement, TitleElement)):
      text_value = element.text.strip()
      if text_value:
        section_text[current_section].append(text_value)

  def _join(section_id: str) -> str:
    return "\n".join(section_text.get(section_id, []))

  if filing_type.upper().startswith("10-K"):
    if Edgar10KParser is None:
      result = {
        "business": _join("business"),
        "mdna": _join("mdna"),
        "risk": _join("risk"),
        "liquidity": _join("mdna"),
      }
    else:
      result = {
        "business": _join("part1item1"),
        "mdna": _join("part2item7"),
        "risk": _join("part1item1a"),
        "liquidity": _join("part2item7"),
      }
  else:
    result = {
      "business": _join("part1item1"),
      "mdna": _join("part1item2"),
      "risk": _join("part2item1a"),
      "liquidity": _join("part1item2"),
    }
  _debug(
    "[insights] sec-parser section sizes: "
    + ", ".join(f"{key}={len(value)}" for key, value in result.items())
  )
  return result, section_titles


def _sentences_from_text(text_value: str) -> List[str]:
  candidates = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text_value) if s.strip()]
  return [s for s in candidates if len(s) >= 60]


def _extract_forward_guidance(
  mdna_text: str,
  limit: int = 2,
) -> List[Dict[str, str]]:
  cues = ("EXPECT", "GUIDANCE", "OUTLOOK", "PLAN TO", "WE EXPECT", "WE PLAN")
  results: List[Dict[str, str]] = []
  for sentence in _sentences_from_text(mdna_text):
    upper = sentence.upper()
    if any(cue in upper for cue in cues):
      results.append({
        "metric": "Guidance",
        "guidance": sentence,
        "timeframe": "FY",
        "confidence": "medium",
      })
      if len(results) >= limit:
        break
  return results


def _extract_risk_changes(
  risk_text: str,
  limit: int = 2,
) -> List[Dict[str, str]]:
  cues = ("RISK", "MAY", "COULD", "ADVERSE", "MATERIAL")
  results: List[Dict[str, str]] = []
  for sentence in _sentences_from_text(risk_text):
    upper = sentence.upper()
    if any(cue in upper for cue in cues):
      results.append({
        "theme": "Risk factors",
        "change": "unspecified",
        "summary": sentence,
        "impact": "",
      })
      if len(results) >= limit:
        break
  return results


def _extract_other_highlights(
  titles: List[str],
  limit: int = 4,
) -> List[Dict[str, str]]:
  keywords = ("LEGAL", "COMMITMENTS", "CONTINGENCIES", "DEBT", "EQUITY", "RESTRUCTURING")
  results: List[Dict[str, str]] = []
  for title in titles:
    if any(key in title.upper() for key in keywords):
      results.append({
        "category": "Filing highlight",
        "summary": title,
        "details": "",
      })
      if len(results) >= limit:
        break
  return results


def _extract_accounting_flags(
  titles: List[str],
  mdna_text: str,
  limit: int = 3,
) -> List[Dict[str, str]]:
  title_keywords = (
    "ACCOUNTING",
    "CRITICAL ACCOUNTING",
    "RECENT ACCOUNTING",
    "ACCOUNTING POLICIES",
    "PRONOUNCEMENTS",
  )
  results: List[Dict[str, str]] = []
  for title in titles:
    if any(key in title.upper() for key in title_keywords):
      results.append({
        "area": "Accounting policy",
        "summary": title,
        "severity": None,
      })
      if len(results) >= limit:
        return results

  if not mdna_text:
    return results

  for sentence in _sentences_from_text(mdna_text):
    upper = sentence.upper()
    if "ACCOUNTING" in upper or "PRONOUNCEMENT" in upper:
      results.append({
        "area": "Accounting policy",
        "summary": sentence,
        "severity": None,
      })
      if len(results) >= limit:
        break
  return results


def _extract_sections(text: str, filing_type: str) -> Dict[str, str]:
  labels = SECTION_LABELS_10K if filing_type.upper().startswith("10-K") else SECTION_LABELS_10Q
  upper = text.upper()
  positions: List[Tuple[int, str]] = []

  # Primary label search (fast path).
  for key, label in labels:
    idx = upper.find(label)
    if idx != -1:
      positions.append((idx, key))

  # Fallback to more flexible label matching if standard headers are missing.
  if not positions:
    patterns = {
      "business": [
        r"\bITEM\s+1\b",
        r"\bBUSINESS\b",
      ],
      "risk": [
        r"\bITEM\s+1A\b",
        r"\bRISK\s+FACTORS\b",
      ],
      "mdna": [
        r"\bITEM\s+2\b",
        r"\bMANAGEMENT[’']S\s+DISCUSSION",
        r"\bMD&A\b",
      ],
      "liquidity": [
        r"\bLIQUIDITY\b",
        r"\bCAPITAL\s+RESOURCES\b",
      ],
    }
    for key, regexes in patterns.items():
      for regex in regexes:
        match = re.search(regex, upper)
        if match:
          positions.append((match.start(), key))
          break

  if not positions:
    return {"full_document": text.strip()}

  positions.sort()
  sections: Dict[str, str] = {}
  for i, (start, key) in enumerate(positions):
    end = positions[i + 1][0] if i + 1 < len(positions) else len(text)
    sections[key] = text[start:end].strip()
  return sections


def _list_recent_filings(cik: str, desired_forms: List[str]) -> List[Tuple[str, str, str]]:
  submissions = _fetch_submissions(cik)
  recent = submissions.get("filings", {}).get("recent", {})
  forms = recent.get("form", [])
  accessions = recent.get("accessionNumber", [])
  dates = recent.get("filingDate", [])
  result: List[Tuple[str, str, str]] = []
  for form, accession, date in zip(forms, accessions, dates):
    if form in desired_forms:
      result.append((form, accession, date))
  return result


def generate_filing_insights_for_symbol(
  symbol: str,
  cik: str,
  forms: Optional[List[str]] = None,
  max_filings: int = 1,
) -> List[str]:
  """
  Generate FilingInsights JSON for the most recent filings of a symbol.
  Returns the list of saved file paths (as strings).
  """
  symbol = symbol.upper()
  cik = cik.zfill(10)
  forms = forms or ["10-K", "10-Q"]
  filings = _list_recent_filings(cik, forms)
  if not filings:
    return []

  saved_paths: List[str] = []
  processed = 0
  for form, accession, filed_at in filings:
    if processed >= max_filings:
      break
    try:
      path, _ = download_filing(symbol, cik, accession)
      if not path:
        continue
      raw_html = path.read_text(encoding="utf-8", errors="ignore")
      text = ""
      if not form.upper().startswith("10-"):
        text = _load_plain_text(path)

      sec_parser_titles: Dict[str, List[str]] = {}
      if form.upper().startswith("10-"):
        sections, sec_parser_titles = _extract_sections_with_sec_parser(raw_html, form)
        _debug(
          "[insights] using sec-parser sections: "
          + ", ".join(sorted(sections.keys())) if sections else "[insights] sec-parser returned no sections"
        )
      else:
        sections = {}

      if not sections or not any(value.strip() for value in sections.values()):
        raise RuntimeError("sec-parser returned no sections for this filing.")

      business_text = sections.get("business", "")
      risk_text = sections.get("risk", "")
      mdna_text = sections.get("mdna", "")
      liquidity_text = sections.get("liquidity", "")

      _debug(
        "[insights] section lengths: "
        f"business={len(business_text)}, risk={len(risk_text)}, "
        f"mdna={len(mdna_text)}, liquidity={len(liquidity_text)}"
      )


      slice_len = 12000
      prompt = FILING_PROMPT.format(
        symbol=symbol,
        form=form,
        filed_at=filed_at,
        business=business_text[:slice_len],
        risk=risk_text[:slice_len],
        mdna=mdna_text[:slice_len],
        liquidity=liquidity_text[:slice_len],
      )
      raw = _call_llm(prompt, max_tokens=8000)
      data = _extract_json_from_text(raw)

      if not data.get("risk_changes") and risk_text.strip():
        data["risk_changes"] = _extract_risk_changes(risk_text)
      if not data.get("forward_guidance") and mdna_text.strip():
        data["forward_guidance"] = _extract_forward_guidance(mdna_text)
      if not data.get("other_highlights") and sec_parser_titles:
        data["other_highlights"] = _extract_other_highlights(
          sec_parser_titles.get("part1item2", [])
          + sec_parser_titles.get("part2item1", [])
          + sec_parser_titles.get("part2item1a", [])
        )
      if not data.get("accounting_flags") and sec_parser_titles:
        data["accounting_flags"] = _extract_accounting_flags(
          sec_parser_titles.get("part1item1", [])
          + sec_parser_titles.get("part1item2", []),
          mdna_text,
        )
      insights = FilingInsights(
        symbol=symbol,
        cik=cik,
        accession=accession,
        filing_type=form,
        filed_at=filed_at,
        business_updates=[
          BusinessUpdate(**item) for item in data.get("business_updates", [])
        ],
        risk_changes=[
          RiskChange(**item) for item in data.get("risk_changes", [])
        ],
        liquidity_and_capital=[
          LiquidityInsight(**item) for item in data.get("liquidity_and_capital", [])
        ],
        accounting_flags=[
          AccountingFlag(**item) for item in data.get("accounting_flags", [])
        ],
        other_highlights=[
          Highlight(**item) for item in data.get("other_highlights", [])
        ],
        product_segments=[
          ProductSegment(**item) for item in data.get("product_segments", [])
        ],
        forward_guidance=[
          ForwardGuidance(**item) for item in data.get("forward_guidance", [])
        ],
        categorized_risks=[
          CategorizedRisk(**item) for item in data.get("categorized_risks", [])
        ],
      )
      saved = save_filing_insights(insights)
      saved_paths.append(str(saved))
      processed += 1
    except Exception as exc:
      print(f"[filings] Failed for {symbol} {accession}: {exc}")
  return saved_paths


# -----------------------------------------------------------------------------
# Transcript insights
# -----------------------------------------------------------------------------

TRANSCRIPT_PROMPT = """CRITICAL INSTRUCTION: You MUST respond with ONLY valid JSON. Do not include any explanatory text, summaries, or commentary.

Analyze the following earnings call transcript excerpts for {symbol} FY{year} Q{quarter}.

YOUR RESPONSE MUST BE ONLY THIS JSON SCHEMA (nothing else):
{{
  "guidance_changes": [
    {{"metric": "...", "direction": "raised|lowered|maintained|withdrawn", "summary": "...", "magnitude": "..."}}
  ],
  "drivers": [
    {{"area": "...", "summary": "...", "positive": true/false, "detail": "..."}}
  ],
  "tone": {{"management": "...", "analysts": "...", "confidence": "..."}},
  "execution_flags": [
    {{"issue": "...", "severity": "...", "summary": "..."}}
  ],
  "key_quotes": [
    {{"speaker": "...", "sentiment": "...", "summary": "..."}}
  ]
}}

CRITICAL RULES:
1. Your response MUST start with opening brace and end with closing brace
2. Return ONLY valid JSON - NO other text, explanations, or summaries
3. Use only the provided transcript JSON
4. Be concise (one or two sentences per summary)
5. If no data for a field, return an empty array (or null tone)

Transcript paragraphs JSON:
{paragraphs}
"""


def _list_available_quarters(transcripts_obj, min_year: int = 2024) -> List[Tuple[int, int, Optional[str]]]:
  """
  List available quarters, filtering to only include years >= min_year (default 2024).
  """
  quarters: List[Tuple[int, int, Optional[str]]] = []
  if hasattr(transcripts_obj, "get_transcripts_list"):
    raw = transcripts_obj.get_transcripts_list()
    df = raw if isinstance(raw, pd.DataFrame) else pd.DataFrame(raw or [])
    for _, row in df.iterrows():
      year = row.get("year") or row.get("fiscal_year")
      quarter = row.get("quarter") or row.get("fiscal_quarter")
      if pd.isna(year) or pd.isna(quarter):
        continue
      year_int = int(year)
      if year_int < min_year:
        continue  # Skip transcripts before min_year
      date = row.get("date") or row.get("report_date")
      date_str = None
      if isinstance(date, pd.Timestamp):
        date_str = date.isoformat()
      elif isinstance(date, str):
        date_str = date
      quarters.append((year_int, int(quarter), date_str))
  quarters = sorted(set(quarters))
  return quarters


def _fetch_paragraphs(transcripts_obj, year: int, quarter: int) -> List[Dict[str, Any]]:
  if not hasattr(transcripts_obj, "get_transcript"):
    return []
  df = transcripts_obj.get_transcript(year, quarter)
  if df is None or not isinstance(df, pd.DataFrame) or df.empty:
    return []
  paragraphs: List[Dict[str, Any]] = []
  for _, row in df.iterrows():
    content = row.get("content")
    if not content or (isinstance(content, float) and pd.isna(content)):
      continue
    paragraphs.append({
      "speaker": str(row.get("speaker") or row.get("person") or ""),
      "role": str(row.get("role") or row.get("speaker_type") or ""),
      "section": str(row.get("section") or row.get("segment") or ""),
      "content": str(content),
    })
  return paragraphs


def generate_transcript_insights_for_symbol(
  symbol: str,
  limit: int = 1,
) -> List[str]:
  """
  Generate TranscriptInsights JSON for the most recent quarters of a symbol.
  Returns list of saved file paths.
  """
  symbol = symbol.upper()
  ticker = Ticker(symbol)
  transcripts_fn = getattr(ticker, "earning_call_transcripts", None)
  if not transcripts_fn:
    return []

  transcripts_obj = transcripts_fn()
  quarters = _list_available_quarters(transcripts_obj)
  if not quarters:
    return []

  saved_paths: List[str] = []
  processed = 0
  for year, quarter, date_str in sorted(quarters, reverse=True):
    if processed >= limit:
      break
    try:
      paragraphs = _fetch_paragraphs(transcripts_obj, year, quarter)
      if not paragraphs:
        continue
      trimmed = paragraphs[:400]
      for para in trimmed:
        para["content"] = para["content"][:1200]
      prompt = TRANSCRIPT_PROMPT.format(
        symbol=symbol,
        year=year,
        quarter=quarter,
        paragraphs=json.dumps(trimmed, ensure_ascii=False, indent=2),
      )
      print(f"\n[DEBUG] Calling LLM for {symbol} FY{year}Q{quarter}...")
      print(f"[DEBUG] Prompt length: {len(prompt)} chars")
      raw = _call_llm(prompt, max_tokens=8000)
      print(f"[DEBUG] LLM returned {len(raw)} chars")
      data = _extract_json_from_text(raw)
      tone_dict = data.get("tone") or {}
      insights = TranscriptInsights(
        symbol=symbol,
        fiscal_year=year,
        fiscal_quarter=quarter,
        call_date=date_str,
        guidance_changes=[
          GuidanceChange(**item) for item in data.get("guidance_changes", [])
        ],
        drivers=[DriverInsight(**item) for item in data.get("drivers", [])],
        tone=ToneInsight(**tone_dict) if tone_dict else ToneInsight(),
        execution_flags=[
          ExecutionFlag(**item) for item in data.get("execution_flags", [])
        ],
        key_quotes=[
          QuoteHighlight(**item) for item in data.get("key_quotes", [])
        ],
      )
      saved = save_transcript_insights(insights)
      saved_paths.append(str(saved))
      processed += 1
    except Exception as exc:
      print(f"\n[ERROR] Failed for {symbol} FY{year}Q{quarter}: {exc}")
      import traceback
      traceback.print_exc()
  return saved_paths
