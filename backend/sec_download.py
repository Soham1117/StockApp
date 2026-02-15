import os
import pathlib
import time
from typing import Optional, Tuple, Dict, Any

import requests

SEC_BASE = "https://data.sec.gov"
ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"
# SEC requires User-Agent with contact info - use env var or default
USER_AGENT = os.getenv("SEC_USER_AGENT") or "QuantDash/1.0 (contact: your.email@example.com)"
CACHE_DIR = pathlib.Path(os.getenv("SEC_CACHE_DIR", "data/sec_filings"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Rate limiting: SEC recommends max 10 requests per second
_last_request_time = 0
_min_request_interval = 0.1  # 100ms between requests (10 req/sec max)


def _rate_limit():
    """Enforce rate limiting between SEC requests."""
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < _min_request_interval:
        time.sleep(_min_request_interval - elapsed)
    _last_request_time = time.time()


def _fetch_submissions(cik: str) -> Dict[str, Any]:
    url = f"{SEC_BASE}/submissions/CIK{cik}.json"
    _rate_limit()
    resp = requests.get(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _primary_doc_for_accession(submissions: Dict[str, Any], accession: str) -> Optional[str]:
    recent = submissions.get("filings", {}).get("recent", {})
    acc_list = recent.get("accessionNumber", []) or recent.get("accession_number", [])
    primary_docs = recent.get("primaryDocument", []) or recent.get("primary_document", [])
    if not acc_list or not primary_docs:
        return None
    for acc, doc in zip(acc_list, primary_docs):
        if acc.replace("-", "") == accession.replace("-", ""):
            return doc
    return None


def download_filing(symbol: str, cik: str, accession: str, max_retries: int = 3) -> Tuple[Optional[pathlib.Path], Optional[str]]:
    """
    Download primary document for the given filing to cache.
    Returns (path, content_type) or (None, None) on failure.
    
    Implements retry logic with exponential backoff for 403/429 errors.
    """
    try:
        submissions = _fetch_submissions(cik)
        primary_doc = _primary_doc_for_accession(submissions, accession)
        if not primary_doc:
            return None, None

        acc_no_dash = accession.replace("-", "")
        url = f"{ARCHIVES_BASE}/{int(cik)}/{acc_no_dash}/{primary_doc}"

        target_dir = CACHE_DIR / symbol.upper()
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{acc_no_dash}_{primary_doc}"

        if target_path.exists():
            return target_path, _guess_content_type(primary_doc)

        # Retry logic for 403/429 errors
        for attempt in range(max_retries):
            try:
                _rate_limit()
                resp = requests.get(
                    url,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Accept": "*/*",
                        "Accept-Encoding": "gzip, deflate",
                        "Connection": "keep-alive",
                    },
                    timeout=30,
                )
                
                if resp.status_code == 403:
                    # 403 Forbidden - might be rate limited, wait longer
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt) * 2  # Exponential backoff: 2s, 4s, 8s
                        print(f"[sec_download] 403 for {symbol} {accession}, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})", flush=True)
                        time.sleep(wait_time)
                        continue
                    else:
                        print(f"[sec_download] 403 for {symbol} {accession} after {max_retries} attempts - SEC may be blocking", flush=True)
                        return None, None
                
                if resp.status_code == 429:
                    # Too many requests - wait longer
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt) * 5  # Longer wait for 429: 5s, 10s, 20s
                        print(f"[sec_download] 429 for {symbol} {accession}, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})", flush=True)
                        time.sleep(wait_time)
                        continue
                    else:
                        print(f"[sec_download] 429 for {symbol} {accession} after {max_retries} attempts - rate limited", flush=True)
                        return None, None
                
                resp.raise_for_status()
                target_path.write_bytes(resp.content)
                return target_path, resp.headers.get("Content-Type") or _guess_content_type(primary_doc)
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 1  # Exponential backoff: 1s, 2s, 4s
                    print(f"[sec_download] Request error for {symbol} {accession}, retrying in {wait_time}s: {e}", flush=True)
                    time.sleep(wait_time)
                    continue
                else:
                    raise
        
        return None, None
    except Exception as exc:
        print(f"[sec_download] failed for {symbol} {accession}: {exc}", flush=True)
        return None, None


def _guess_content_type(filename: str) -> str:
    fname = filename.lower()
    if fname.endswith(".html") or fname.endswith(".htm"):
        return "text/html"
    if fname.endswith(".txt"):
        return "text/plain"
    if fname.endswith(".pdf"):
        return "application/pdf"
    return "application/octet-stream"
