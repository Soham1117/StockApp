"""
FastAPI wrapper over defeatbeta-api to serve fundamentals, metadata, and prices.
Run (in Docker): uvicorn main:app --host 0.0.0.0 --port 8000
"""
from pathlib import Path
import os
import sys

# Load environment variables from .env files BEFORE any other imports
# Try loading from both backend/.env and project root .env/.env.local
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = Path(__file__).resolve().parent

# Load .env files (order matters - later files override earlier ones)
try:
    from dotenv import load_dotenv
    # Load from project root first (lower priority)
    load_dotenv(REPO_ROOT / ".env", override=False)
    load_dotenv(REPO_ROOT / ".env.local", override=False)
    # Load from backend directory (higher priority)
    load_dotenv(BACKEND_ROOT / ".env", override=True)
    load_dotenv(BACKEND_ROOT / ".env.local", override=True)
except ImportError:
    # python-dotenv not installed, skip loading .env files
    pass

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Dict, List, Optional, Any, Tuple, Literal
from datetime import datetime, timedelta, date
import math
import threading
import platform
import json
import statistics
import time
import random
import uuid
import re
import secrets
import hashlib
import base64
import pandas as pd
import numpy as np
import nltk

# Avoid DefeatBeta import-time side effects (welcome banner, network call, NLTK download).
os.environ.setdefault("DEFEATBETA_NO_WELCOME", "1")
os.environ.setdefault("DEFEATBETA_NO_NLTK_DOWNLOAD", "1")

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from defeatbeta_api.data.ticker import Ticker
from defeatbeta_api.client.duckdb_conf import Configuration
from fastapi import FastAPI, HTTPException, Query, Header, Depends, Cookie, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from defeatbeta_api.utils.util import validate_nltk_directory
from sec_download import download_filing
from database import init_db, get_db, PortfolioHolding, SavedScreen, IndustryFilterDefault, User, UserSession
from sqlalchemy.orm import Session
from insight_jobs import (
    generate_filing_insights_for_symbol,
    generate_transcript_insights_for_symbol,
)

app = FastAPI(title="DefeatBeta Wrapper", version="0.1.1")
SESSION_COOKIE_NAME = "qd_session"
SESSION_TTL_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Cache for precomputed backtest rules (loaded once at startup)
_BACKTEST_RULES_CACHE: Dict[str, Any] = {
    "data": [],
    "sectors": [],
    "caps": [],
    "holding_years": [],
    "loaded": False,
}

def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    if salt is None:
        salt_bytes = secrets.token_bytes(16)
        salt = base64.b64encode(salt_bytes).decode("ascii")
    else:
        salt_bytes = base64.b64decode(salt.encode("ascii"))
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 200_000)
    return salt, base64.b64encode(dk).decode("ascii")


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    _salt, computed = _hash_password(password, salt)
    return secrets.compare_digest(computed, expected_hash)


def _create_session(db: Session, user_id: str) -> UserSession:
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    session = UserSession(
        id=uuid.uuid4().hex,
        user_id=user_id,
        token=token,
        created_at=now,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _get_session_user_id(db: Session, token: str) -> Optional[str]:
    if not token:
        return None
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if not session:
        return None
    if session.expires_at <= datetime.utcnow():
        db.delete(session)
        db.commit()
        return None
    return session.user_id

# User ID system: prefer authenticated session cookie, fall back to header or "default".
def get_user_id(
    qd_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    db: Session = Depends(get_db),
) -> str:
    """Resolve user ID from session cookie or header, defaulting to 'default'."""
    if qd_session:
        user_id = _get_session_user_id(db, qd_session)
        if user_id:
            return user_id
    return x_user_id or "default"


def _validate_email(email: str) -> None:
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format")

# Configure CORS to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3040",
        "http://127.0.0.1:3040",
        "http://192.168.52.1:3000",  # Mobile device access
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
init_db()

# Initialize NLTK (still used for transcripts processing, sentence splitting, etc.)
nltk.data.path.append(validate_nltk_directory("nltk"))

class AuthPayload(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)


class RegisterPayload(AuthPayload):
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)


class ProfileUpdatePayload(BaseModel):
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


@app.post("/auth/register")
def auth_register(payload: RegisterPayload, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    _validate_email(email)

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    salt, password_hash = _hash_password(payload.password)
    user = User(
        id=uuid.uuid4().hex,
        email=email,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        password_salt=salt,
        password_hash=password_hash,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    session = _create_session(db, user.id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path="/",
    )
    return {"user": user.to_dict()}


@app.post("/auth/login")
def auth_login(payload: AuthPayload, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    _validate_email(email)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(payload.password, user.password_salt, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session = _create_session(db, user.id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path="/",
    )
    return {"user": user.to_dict()}


@app.post("/auth/logout")
def auth_logout(
    response: Response,
    qd_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    if qd_session:
        session = db.query(UserSession).filter(UserSession.token == qd_session).first()
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/auth/me")
def auth_me(
    qd_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    if not qd_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _get_session_user_id(db, qd_session)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user.to_dict()}


@app.put("/auth/profile")
def auth_update_profile(
    payload: ProfileUpdatePayload,
    qd_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    if not qd_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _get_session_user_id(db, qd_session)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if payload.email is not None:
        email = payload.email.strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="email required")
        _validate_email(email)
        existing = db.query(User).filter(User.email == email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        user.email = email

    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()

    db.commit()
    db.refresh(user)
    return {"user": user.to_dict()}


@app.post("/auth/password")
def auth_change_password(
    payload: ChangePasswordPayload,
    qd_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    if not qd_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _get_session_user_id(db, qd_session)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not _verify_password(payload.current_password, user.password_salt, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid current password")

    salt, password_hash = _hash_password(payload.new_password)
    user.password_salt = salt
    user.password_hash = password_hash
    db.commit()
    return {"ok": True}

# Windows-compatible DuckDB configuration (cache_httpfs not available on Windows)
class WindowsCompatibleDuckDBConfig(Configuration):
    """DuckDB configuration that skips cache_httpfs on Windows."""
    
    def get_duckdb_settings(self):
        settings = super().get_duckdb_settings()
        # On Windows, cache_httpfs extension is not available (404 error)
        # Remove the INSTALL, LOAD commands and all cache_httpfs-related settings
        if platform.system() == "Windows":
            # Filter out all cache_httpfs-related commands
            filtered = []
            for setting in settings:
                # Skip INSTALL and LOAD of cache_httpfs
                if "INSTALL cache_httpfs" in setting or "LOAD cache_httpfs" in setting:
                    continue
                # Skip all SET GLOBAL cache_httpfs_* settings (they'll fail without the extension)
                if "SET GLOBAL cache_httpfs" in setting:
                    continue
                filtered.append(setting)
            return filtered
        return settings

# Patch get_duckdb_client to use Windows-compatible config on Windows
if platform.system() == "Windows":
    import defeatbeta_api.client.duckdb_client as duckdb_client_module
    from defeatbeta_api.client.duckdb_client import get_duckdb_client as _original_get_duckdb_client
    
    # Reset singleton instance to force re-initialization with new config
    # This ensures any previously created instance is discarded
    with duckdb_client_module._lock:
        duckdb_client_module._instance = None
    
    def get_duckdb_client_windows_compatible(http_proxy=None, log_level=None, config=None):
        """Windows-compatible wrapper for get_duckdb_client."""
        # Always use Windows-compatible config on Windows, even if a config is passed
        # (in case it's the default config that tries to install cache_httpfs)
        if not isinstance(config, WindowsCompatibleDuckDBConfig):
            config = WindowsCompatibleDuckDBConfig()
        return _original_get_duckdb_client(http_proxy=http_proxy, log_level=log_level, config=config)
    
    # Monkey-patch the module-level function
    duckdb_client_module.get_duckdb_client = get_duckdb_client_windows_compatible

# FinBERT sentiment model - lazy loaded on first use
_FINBERT_MODEL_NAME = "ProsusAI/finbert"
try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification  # type: ignore
except Exception:
    AutoTokenizer = None  # type: ignore
    AutoModelForSequenceClassification = None  # type: ignore

try:
    import torch  # type: ignore
except Exception:
    torch = None  # type: ignore

_FINBERT_TOKENIZER: Optional[Any] = None
_FINBERT_MODEL: Optional[Any] = None
_FINBERT_ID2LABEL: Optional[Dict[int, str]] = None
_FINBERT_LOCK = threading.Lock()
_FINBERT_BATCH_SIZE = int(os.getenv("FINBERT_BATCH_SIZE", "16"))

# Helpers to ensure responses stay JSON-serializable and avoid encoder errors
def _normalize_news_items(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for item in records or []:
        if not isinstance(item, dict):
            continue

        def _as_str(val: Any) -> Optional[str]:
            if val is None:
                return None
            try:
                return str(val)
            except Exception:
                return None

        report_date = item.get("report_date")
        if isinstance(report_date, (datetime, pd.Timestamp)):
            report_date_str = report_date.isoformat()
        elif pd.isna(report_date) if hasattr(pd, "isna") else False:
            report_date_str = None
        else:
            report_date_str = _as_str(report_date)

        cleaned.append(
            {
                "uuid": _as_str(item.get("uuid")),
                "title": _as_str(item.get("title")) or "",
                "news": _as_str(item.get("news")),
                "publisher": _as_str(item.get("publisher")) or "",
                "type": _as_str(item.get("type")) or "",
                "report_date": report_date_str,
                "link": _as_str(item.get("link")) or "",
            }
        )
    return cleaned


def _normalize_sentiment_points(points_raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for p in points_raw or []:
        if not isinstance(p, dict):
            continue
        date_val = p.get("date")
        # Preserve date as string if possible
        if isinstance(date_val, (datetime, pd.Timestamp)):
            date_str = date_val.strftime("%Y-%m-%d")
        else:
            date_str = str(date_val) if date_val is not None else None

        score_val = p.get("score")
        try:
            score = float(score_val) if score_val is not None and math.isfinite(float(score_val)) else None
        except Exception:
            score = None

        count_val = p.get("count")
        try:
            count = int(count_val) if count_val is not None else 0
        except Exception:
            count = 0

        cleaned.append({"date": date_str, "score": score, "count": count})
    return cleaned


def _normalize_sentiment_summary(summary_raw: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(summary_raw, dict):
        return {}
    result: Dict[str, Any] = {}
    for key in ["avg", "last7"]:
        val = summary_raw.get(key)
        try:
            fval = float(val)
            if math.isfinite(fval):
                result[key] = fval
        except Exception:
            continue
    for key in ["days", "total_articles"]:
        val = summary_raw.get(key)
        try:
            ival = int(val)
            result[key] = ival
        except Exception:
            continue
    return result


def _ensure_finbert_loaded():
    """Lazy-load FinBERT model on first use. Thread-safe."""
    global _FINBERT_TOKENIZER, _FINBERT_MODEL, _FINBERT_ID2LABEL

    if AutoTokenizer is None or AutoModelForSequenceClassification is None:
        raise RuntimeError(
            "FinBERT dependencies are not available (transformers/huggingface-hub mismatch). "
            "Backtesting and most endpoints can still run, but sentiment endpoints require compatible versions."
        )
    if torch is None:
        raise RuntimeError(
            "FinBERT dependencies are not available (torch not installed). "
            "Backtesting and most endpoints can still run, but sentiment endpoints require torch."
        )
    
    if _FINBERT_MODEL is not None:
        return  # Already loaded
    
    with _FINBERT_LOCK:
        # Double-check after acquiring lock
        if _FINBERT_MODEL is not None:
            return
        
        try:
            import os
            # Use explicit cache directory from env (HF_HOME is preferred, TRANSFORMERS_CACHE is deprecated)
            cache_dir = os.getenv("HF_HOME") or os.getenv("TRANSFORMERS_CACHE") or "/app/.cache/huggingface"
            print(f"[FinBERT] Loading model (first use) from cache: {cache_dir}...", flush=True)
            
            # Use local_files_only=False to allow download, and trust_remote_code if needed
            _FINBERT_TOKENIZER = AutoTokenizer.from_pretrained(
                _FINBERT_MODEL_NAME,
                cache_dir=cache_dir,
                local_files_only=False,
                force_download=False
            )
            _FINBERT_MODEL = AutoModelForSequenceClassification.from_pretrained(
                _FINBERT_MODEL_NAME,
                cache_dir=cache_dir,
                local_files_only=False,
                force_download=False
            )
            _FINBERT_MODEL.eval()
            _FINBERT_ID2LABEL = _FINBERT_MODEL.config.id2label
            
            # Move model to GPU if available
            if torch.cuda.is_available():
                _FINBERT_MODEL = _FINBERT_MODEL.cuda()
                print(f"[FinBERT] Model loaded on GPU: {torch.cuda.get_device_name(0)}", flush=True)
            else:
                print("[FinBERT] Model loaded on CPU", flush=True)
        except Exception as exc:
            print(f"[FinBERT] Failed to load model: {exc}", flush=True)
            print("[FinBERT] Attempting to clear corrupted cache and retry...", flush=True)
            try:
                import shutil
                cache_dir = os.getenv("HF_HOME") or os.getenv("TRANSFORMERS_CACHE") or "/app/.cache/huggingface"
                
                # Clear contents of cache directory (can't delete the directory itself if it's a volume mount)
                if os.path.exists(cache_dir):
                    print(f"[FinBERT] Clearing cache directory contents: {cache_dir}", flush=True)
                    # Remove all files and subdirectories inside, but keep the directory
                    for item in os.listdir(cache_dir):
                        item_path = os.path.join(cache_dir, item)
                        try:
                            if os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                            else:
                                os.remove(item_path)
                        except Exception as e:
                            print(f"[FinBERT] Warning: Could not remove {item_path}: {e}", flush=True)
                    print("[FinBERT] Cache cleared", flush=True)
                
                # Also try to remove the specific corrupted file hash if it exists
                corrupted_hash = "1078a3396c3df57f29d26228abdce56ec20e74a9c2940d9a672f00c173930fc5"
                corrupted_file = os.path.join(cache_dir, corrupted_hash)
                if os.path.exists(corrupted_file):
                    try:
                        os.remove(corrupted_file)
                        print(f"[FinBERT] Removed corrupted file: {corrupted_hash}", flush=True)
                    except Exception as e:
                        print(f"[FinBERT] Warning: Could not remove corrupted file: {e}", flush=True)
                
                # Retry download with force_download=True and use Hugging Face Hub
                print("[FinBERT] Retrying model download via Hugging Face Hub (this may take 30-60 seconds)...", flush=True)
                # Use revision="main" to ensure we get the latest version
                _FINBERT_TOKENIZER = AutoTokenizer.from_pretrained(
                    _FINBERT_MODEL_NAME,
                    cache_dir=cache_dir,
                    local_files_only=False,
                    force_download=True,
                    revision="main"
                )
                _FINBERT_MODEL = AutoModelForSequenceClassification.from_pretrained(
                    _FINBERT_MODEL_NAME,
                    cache_dir=cache_dir,
                    local_files_only=False,
                    force_download=True,
                    revision="main"
                )
                _FINBERT_MODEL.eval()
                _FINBERT_ID2LABEL = _FINBERT_MODEL.config.id2label
                
                if torch.cuda.is_available():
                    _FINBERT_MODEL = _FINBERT_MODEL.cuda()
                    print(f"[FinBERT] Model loaded successfully on GPU: {torch.cuda.get_device_name(0)}", flush=True)
                else:
                    print("[FinBERT] Model loaded successfully on CPU", flush=True)
            except Exception as retry_exc:
                print(f"[FinBERT] Retry also failed: {retry_exc}", flush=True)
                import traceback
                traceback.print_exc()
                raise


class SymbolsPayload(BaseModel):
    symbols: List[str] = Field(..., description="List of ticker symbols")


class PriceRequest(BaseModel):
    symbol: str
    days: int = Field(180, description="Number of most recent days")


class IndustriesPayload(BaseModel):
    symbols: List[str] = Field(..., description="Universe of symbols to derive industries/sectors from")


class CustomRulePayload(BaseModel):
    metric: str
    operator: Literal['<', '>', '=', '!=', 'between', '>=', '<=']
    value: Any
    enabled: bool = True


class ScreenerFiltersPayload(BaseModel):
    country: Optional[str] = None
    industry: Optional[str] = None
    cap: Optional[Literal['large', 'mid', 'small', 'all']] = 'all'
    customRules: Optional[List[CustomRulePayload]] = None
    ruleLogic: Optional[Literal['AND', 'OR']] = 'AND'


class IndustryAnalysisRequest(BaseModel):
    """
    Request payload for industry-level valuation analysis.

    For now this focuses on valuation multiples only and uses the provided
    symbols as the peer universe for percentile ranking within the target
    industry.
    """
    symbols: List[str] = Field(..., description="Universe of symbols to analyze (will be filtered by industry)")
    weights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Optional per-multiple weights for valuation factor (pe, ps, pb, ev_ebit, ev_ebitda)",
    )
    filters: Optional[ScreenerFiltersPayload] = Field(
        default=None,
        description="Optional screener-style filters to apply before scoring",
    )
    exclude_symbols: Optional[List[str]] = Field(
        default=None,
        description="Optional list of symbols to exclude from the analysis universe",
    )


class FundamentalRulePayload(BaseModel):
    metric: Literal["pe", "ps", "pb", "ev_ebit", "ev_ebitda", "ev_sales"]
    operator: Literal["gt_zero", "lt_mean", "lt_median"]


class BacktestRulesPayload(BaseModel):
    """
    Minimal rule set for the first backtest implementation.

    This intentionally avoids the full screener rule language until we have
    reliable point-in-time fundamentals for all those metrics.
    """

    pe_positive: bool = True
    pe_below_universe_mean: bool = True
    fundamental_rules: Optional[List[FundamentalRulePayload]] = None


class BacktestSectorRequest(BaseModel):
    sector: str = Field(..., description="Sector name (must match sector-metrics.json keys)")
    years: int = Field(10, ge=1, le=30, description="How far back to run, in whole years")
    holding_years: int = Field(1, ge=1, le=3, description="Forward holding period, in years")
    rebalance: Literal["annual"] = Field("annual", description="Currently only annual rebalance is supported")
    top_n: int = Field(10, ge=1, le=100, description="Number of top-ranked picks each rebalance")
    benchmark: str = Field("SPY", description="ETF benchmark symbol (from data/etf-prices.json)")
    fundamentals_lag_days: int = Field(
        90,
        ge=0,
        le=365,
        description="Assumed delay (days) after period-end before fundamentals are 'known'",
    )
    rules: BacktestRulesPayload = Field(default_factory=BacktestRulesPayload)
    weights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Optional valuation factor weights (pe, ps, pb, ev_ebit, ev_ebitda, ev_sales)",
    )
    filters: Optional[ScreenerFiltersPayload] = Field(
        default=None,
        description="Optional screener-style filters (cap + custom rules) applied before ranking",
    )


class NewsRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol for news lookup")
    days: int = Field(365, description="Lookback window in days")
    limit: int = Field(500, description="Maximum number of news articles to return")


class TranscriptsRequest(BaseModel):
    symbols: List[str] = Field(..., description="List of ticker symbols")
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(20, ge=1, le=100, description="Number of transcripts per page (max 100)")


class SentimentTextItem(BaseModel):
  """
  Generic text item for sentiment scoring, used by /sentiment/from_texts.
  The caller is responsible for providing a date string (YYYY-MM-DD) if they
  want per-day aggregation.
  """
  date: Optional[str] = Field(None, description="Date string (YYYY-MM-DD) for aggregation")
  text: str = Field(..., description="Text to analyze (e.g. headline + summary)")


class SentimentTextBatch(BaseModel):
  symbol: str = Field(..., description="Ticker symbol for context")
  items: List[SentimentTextItem] = Field(..., description="Items to analyze sentiment for")


class EarningsCalendarRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol for earnings calendar lookup")


class FilingDownloadRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol")
    cik: str = Field(..., description="CIK padded 10 digits")
    accession: str = Field(..., description="Accession number with dashes")


class FilingInsightGenerateRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol")
    cik: Optional[str] = Field(None, description="CIK (optional)")
    forms: Optional[List[str]] = Field(
        default=None,
        description="Filing types to process (default 10-K and 10-Q)",
    )
    maxFilings: int = Field(1, ge=1, le=5, description="Max filings to process")


class TranscriptInsightGenerateRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol")
    limit: int = Field(1, ge=1, le=5, description="Max quarters to process")


STOCKS_JSON_PATH = Path(__file__).resolve().parents[1] / "stocks.json"
# Project root is one level above backend (parents[1]); data lives under that.
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SECTOR_METRICS_PATH = DATA_DIR / "sector-metrics.json"
ETF_PRICES_PATH = DATA_DIR / "etf-prices.json"

_SECTOR_METRICS_CACHE: Optional[Dict[str, Any]] = None
_SYMBOL_TO_SECTOR_METRICS: Optional[Dict[str, Tuple[str, Dict[str, Any]]]] = None

# Cached ETF prices structure:
# {
#   "SPY": [{"date": "2020-01-01", "adj_close": 123.45}, ...],
#   "XLK": [...]
# }
_ETF_PRICES_CACHE: Optional[Dict[str, List[Dict[str, Any]]]] = None
_MIN_ANNUAL_STATEMENT_DATE: Optional[date] = None


@lru_cache(maxsize=1)
def _symbol_to_cik_map() -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    try:
        content = STOCKS_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(content)
    except Exception:
        return mapping

    if isinstance(data, dict):
        if "data" in data and isinstance(data["data"], dict):
            entries = data["data"].get("rows", [])
        else:
            entries = data.values()
    elif isinstance(data, list):
        entries = data
    else:
        entries = []

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        symbol = (entry.get("ticker") or entry.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        cik_val = entry.get("cik_str") or entry.get("cik")
        if cik_val is None:
            continue
        mapping[symbol] = str(cik_val).zfill(10)
    sec_tickers_path = Path(__file__).resolve().parent / "data" / "sec" / "company_tickers.json"
    if sec_tickers_path.exists():
        try:
            sec_data = json.loads(sec_tickers_path.read_text(encoding="utf-8"))
            if isinstance(sec_data, dict):
                for entry in sec_data.values():
                    if not isinstance(entry, dict):
                        continue
                    symbol = str(entry.get("ticker", "")).strip().upper()
                    if not symbol:
                        continue
                    cik_val = entry.get("cik_str")
                    if cik_val is None:
                        continue
                    mapping[symbol] = str(cik_val).zfill(10)
        except Exception as exc:
            print(f"[sec] Failed to load {sec_tickers_path}: {exc}", flush=True)
    return mapping


def _lookup_cik(symbol: str) -> Optional[str]:
    return _symbol_to_cik_map().get(symbol.upper())


def _load_etf_prices() -> Dict[str, List[Dict[str, Any]]]:
    """
    Load precomputed ETF prices from JSON (no DuckDB dependency).

    We assume the JSON is in the "symbol -> list" format produced by
    scripts/fetch_etf_prices_from_yahoo.py:

      {
        "SPY": [
          {"date": "2020-01-01", "adj_close": 123.45},
          ...
        ],
        "XLK": [...]
      }

    and normalize into:
      { "SYMBOL": [ { "date": <datetime.date>, "adj_close": float }, ... ] }
    """
    mapping: Dict[str, List[Dict[str, Any]]] = {}

    try:
        content = ETF_PRICES_PATH.read_text(encoding="utf-8")
        raw = json.loads(content)
    except Exception as exc:
        print(f"[etf-prices] Failed to load {ETF_PRICES_PATH}: {exc}", flush=True)
        return mapping

    if not isinstance(raw, dict):
        print(
            f"[etf-prices] Unexpected JSON root type {type(raw).__name__}; expected dict of symbol -> list",
            flush=True,
        )
        return mapping

    if os.getenv("ETF_PRICES_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON"):
        print(f"[etf-prices] Top-level dict with {len(raw)} symbols", flush=True)

    for sym, entries in raw.items():
        if not isinstance(entries, list):
            continue

        sym_u = str(sym).strip().upper()
        if not sym_u:
            continue

        normalized: List[Dict[str, Any]] = []
        for item in entries:
            if not isinstance(item, dict):
                continue

            date_str = item.get("date")
            adj_val = item.get("adj_close")
            if date_str is None or adj_val is None:
                continue

            try:
                d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
            except Exception:
                continue

            try:
                adj = float(adj_val)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(adj):
                continue

            normalized.append({"date": d, "adj_close": adj})

        if normalized:
            normalized.sort(key=lambda r: r["date"])
            mapping[sym_u] = normalized

    if os.getenv("ETF_PRICES_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON"):
        print(f"[etf-prices] Loaded prices for {len(mapping)} ETFs from {ETF_PRICES_PATH}", flush=True)
    return mapping


def _load_sector_metrics() -> Dict[str, Tuple[str, Dict[str, Any]]]:
    """
    Load precomputed sector-metrics.json and build a mapping:
        symbol -> (sector_name, metrics_dict)

    This mirrors the structure used on the Next.js side in src/app/api/sector/[sector]/metrics/route.ts,
    but keeps it simple for FastAPI usage.
    """
    global _SECTOR_METRICS_CACHE, _SYMBOL_TO_SECTOR_METRICS

    if _SYMBOL_TO_SECTOR_METRICS is not None:
        return _SYMBOL_TO_SECTOR_METRICS

    if _SECTOR_METRICS_CACHE is None:
        try:
            content = SECTOR_METRICS_PATH.read_text(encoding="utf-8")
            _SECTOR_METRICS_CACHE = json.loads(content)
        except Exception as exc:
            print(f"[sector-metrics] Failed to load {SECTOR_METRICS_PATH}: {exc}", flush=True)
            _SECTOR_METRICS_CACHE = {}

    symbol_map: Dict[str, Tuple[str, Dict[str, Any]]] = {}

    for sector_name, sector_entry in (_SECTOR_METRICS_CACHE or {}).items():
        if not isinstance(sector_entry, dict):
            continue
        metrics_list = sector_entry.get("metrics")
        if not isinstance(metrics_list, list):
            continue
        for m in metrics_list:
            if not isinstance(m, dict):
                continue
            symbol = str(m.get("symbol") or "").upper()
            if not symbol:
                continue
            symbol_map[symbol] = (sector_name, m)

    _SYMBOL_TO_SECTOR_METRICS = symbol_map
    return _SYMBOL_TO_SECTOR_METRICS


@lru_cache(maxsize=1)
def _min_annual_statement_date() -> Optional[date]:
    """
    Determine the earliest annual fundamentals date available in the stock_statement parquet.
    This is used to avoid producing misleading empty backtest windows when the dataset
    has limited history.
    """
    from defeatbeta_api.utils.const import stock_statement, annual, income_statement, balance_sheet

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_statement)

    sql = f"""
    SELECT
      min(CAST(report_date AS DATE)) AS min_date
    FROM '{url}'
    WHERE period_type = '{annual}'
      AND report_date <> 'TTM'
      AND finance_type IN ('{income_statement}', '{balance_sheet}')
    """
    df = _duckdb_query_with_retry(sql)
    if df is None or df.empty or df.iloc[0].get("min_date") is None:
        return None
    try:
        return pd.Timestamp(df.iloc[0]["min_date"]).date()
    except Exception:
        return None


def _shift_years(d: date, delta_years: int) -> date:
    try:
        return date(d.year + delta_years, d.month, d.day)
    except ValueError:
        # Handle Feb 29 -> Feb 28, etc.
        return date(d.year + delta_years, d.month, 28)


def _chunk(items: List[str], size: int) -> List[List[str]]:
    if size <= 0:
        return [items]
    return [items[i : i + size] for i in range(0, len(items), size)]


@lru_cache(maxsize=1)
def _get_defeatbeta_clients():
    """
    Return a (duckdb_client, huggingface_client) pair for direct multi-symbol queries.
    """
    from defeatbeta_api.client.duckdb_client import get_duckdb_client
    from defeatbeta_api.client.hugging_face_client import HuggingFaceClient

    # On Windows, this file monkey-patches get_duckdb_client to use WindowsCompatibleDuckDBConfig.
    return get_duckdb_client(), HuggingFaceClient()


def _sql_quote_list(values: List[str]) -> str:
    return ", ".join("'" + v.replace("'", "''") + "'" for v in values)


def _duckdb_query_with_retry(sql: str, *, max_attempts: int = 5):
    """
    DefeatBeta queries can hit HuggingFace 429 rate limits when DuckDB reads remote parquet.
    Retry with exponential backoff for 429s.
    """
    duckdb_client, _hf = _get_defeatbeta_clients()

    last_exc: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return duckdb_client.query(sql)
        except Exception as exc:
            last_exc = exc
            msg = str(exc)
            is_429 = "HTTP 429" in msg or "Too Many Requests" in msg
            if not is_429 or attempt >= max_attempts:
                break
            # jittered exponential backoff: 1s, 2s, 4s, 8s...
            sleep_s = min(30.0, (2 ** (attempt - 1)) + random.uniform(0.0, 0.5))
            print(f"[backtest] Rate limited (429). Retry {attempt}/{max_attempts} in {sleep_s:.1f}s...", flush=True)
            time.sleep(sleep_s)

    raise last_exc if last_exc else Exception("Unknown DuckDB query failure")


def _query_latest_prices(symbols: List[str], as_of: date) -> Dict[str, Dict[str, Any]]:
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_prices

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_prices)
    out: Dict[str, Dict[str, Any]] = {}

    for batch in _chunk(symbols, 400):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        SELECT
          symbol,
          arg_max(close, report_date) AS close,
          max(report_date) AS price_date
        FROM '{url}'
        WHERE symbol IN ({sym_in})
          AND report_date <= '{as_of.isoformat()}'
        GROUP BY symbol
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            try:
                close = float(row["close"]) if row["close"] is not None else None
            except Exception:
                close = None
            out[str(row["symbol"]).upper()] = {
                "close": close,
                "price_date": str(row["price_date"])[:10] if row.get("price_date") is not None else None,
            }

    return out


def _query_latest_shares(symbols: List[str], as_of: date) -> Dict[str, Dict[str, Any]]:
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_shares_outstanding

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_shares_outstanding)
    out: Dict[str, Dict[str, Any]] = {}

    for batch in _chunk(symbols, 400):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        SELECT
          symbol,
          arg_max(shares_outstanding, report_date) AS shares_outstanding,
          max(report_date) AS shares_date
        FROM '{url}'
        WHERE symbol IN ({sym_in})
          AND report_date <= '{as_of.isoformat()}'
        GROUP BY symbol
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            try:
                shares = float(row["shares_outstanding"]) if row["shares_outstanding"] is not None else None
            except Exception:
                shares = None
            out[str(row["symbol"]).upper()] = {
                "shares": shares,
                "shares_date": str(row["shares_date"])[:10] if row.get("shares_date") is not None else None,
            }

    return out


def _query_dividends_sum(symbols: List[str], start: date, end: date) -> Dict[str, float]:
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_dividend_events

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_dividend_events)
    out: Dict[str, float] = {}

    for batch in _chunk(symbols, 400):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        SELECT
          symbol,
          sum(amount) AS dividends
        FROM '{url}'
        WHERE symbol IN ({sym_in})
          AND report_date > '{start.isoformat()}'
          AND report_date <= '{end.isoformat()}'
        GROUP BY symbol
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            sym = str(row["symbol"]).upper()
            try:
                div = float(row["dividends"]) if row["dividends"] is not None else 0.0
            except Exception:
                div = 0.0
            out[sym] = div

    return out


def _parse_split_factor(raw: Any) -> Optional[float]:
    """
    split_factor comes as strings like "2:1" or "1398:1000".
    Return multiplier as float (shares multiply by this factor; price divides by this factor).
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if ":" not in s:
        try:
            v = float(s)
            return v if math.isfinite(v) and v > 0 else None
        except Exception:
            return None
    try:
        left, right = s.split(":", 1)
        num = float(left)
        den = float(right)
        if den == 0:
            return None
        v = num / den
        return v if math.isfinite(v) and v > 0 else None
    except Exception:
        return None


def _query_split_events(symbols: List[str], start: date, end: date) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return split events for each symbol in (start, end].
    """
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_split_events

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_split_events)
    out: Dict[str, List[Dict[str, Any]]] = {s.upper(): [] for s in symbols}

    for batch in _chunk(symbols, 400):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        SELECT
          upper(symbol) AS symbol,
          CAST(report_date AS DATE) AS report_date,
          split_factor
        FROM '{url}'
        WHERE upper(symbol) IN ({sym_in})
          AND CAST(report_date AS DATE) > '{start.isoformat()}'
          AND CAST(report_date AS DATE) <= '{end.isoformat()}'
        ORDER BY symbol, report_date
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            sym = str(row["symbol"]).upper()
            d = row.get("report_date")
            try:
                rd = pd.Timestamp(d).date() if d is not None else None
            except Exception:
                rd = None
            factor = _parse_split_factor(row.get("split_factor"))
            if sym and rd and factor:
                out.setdefault(sym, []).append({"date": rd, "factor": factor})

    return out


def _query_dividend_events(symbols: List[str], start: date, end: date) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return dividend events for each symbol in (start, end]. Dividend `amount` is assumed per share.
    """
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_dividend_events

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_dividend_events)
    out: Dict[str, List[Dict[str, Any]]] = {s.upper(): [] for s in symbols}

    for batch in _chunk(symbols, 400):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        SELECT
          upper(symbol) AS symbol,
          CAST(report_date AS DATE) AS report_date,
          amount
        FROM '{url}'
        WHERE upper(symbol) IN ({sym_in})
          AND CAST(report_date AS DATE) > '{start.isoformat()}'
          AND CAST(report_date AS DATE) <= '{end.isoformat()}'
        ORDER BY symbol, report_date
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            sym = str(row["symbol"]).upper()
            d = row.get("report_date")
            try:
                rd = pd.Timestamp(d).date() if d is not None else None
            except Exception:
                rd = None
            try:
                amt = float(row["amount"]) if row.get("amount") is not None else 0.0
            except Exception:
                amt = 0.0
            if sym and rd and math.isfinite(amt) and amt != 0.0:
                out.setdefault(sym, []).append({"date": rd, "amount": amt})

    return out


def _split_factor_between(events: List[Dict[str, Any]], start: date, end: date) -> float:
    """
    Product of split factors in (start, end].
    """
    factor = 1.0
    for ev in events or []:
        d = ev.get("date")
        f = ev.get("factor")
        if isinstance(d, date) and start < d <= end and isinstance(f, (int, float)) and f and f > 0:
            factor *= float(f)
    return factor


def _split_adjusted_dividends(
    dividend_events: List[Dict[str, Any]],
    split_events: List[Dict[str, Any]],
    start: date,
    end: date,
) -> float:
    """
    Compute dividends in dollars for an initial position of 1 share at `start`,
    accounting for splits by increasing share count after split dates.
    """
    total = 0.0
    if not dividend_events:
        return total

    for div in dividend_events:
        d = div.get("date")
        amt = div.get("amount")
        if not isinstance(d, date) or not (start < d <= end):
            continue
        if not isinstance(amt, (int, float)) or not math.isfinite(float(amt)):
            continue
        shares_at_div = _split_factor_between(split_events, start, d)
        total += float(amt) * shares_at_div
    return total


def _query_latest_annual_items(
    symbols: List[str],
    cutoff: date,
    finance_type: str,
    item_names: List[str],
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch a *single* latest annual report (<= cutoff) for each symbol, and return the selected items.

    Returns:
      symbol -> { "report_date": "YYYY-MM-DD", "items": { item_name: float|None } }
    """
    if not symbols or not item_names:
        return {}

    from defeatbeta_api.utils.const import stock_statement, annual

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_statement)

    items_in = _sql_quote_list(item_names)
    out: Dict[str, Dict[str, Any]] = {}

    for batch in _chunk(symbols, 200):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        WITH base AS (
          SELECT
            upper(symbol) AS symbol,
            CAST(report_date AS DATE) AS report_date,
            item_name,
            item_value
          FROM '{url}'
          WHERE upper(symbol) IN ({sym_in})
            AND period_type = '{annual}'
            AND finance_type = '{finance_type}'
            AND report_date <> 'TTM'
            AND CAST(report_date AS DATE) <= '{cutoff.isoformat()}'
            AND item_name IN ({items_in})
        ),
        latest AS (
          SELECT symbol, max(report_date) AS report_date
          FROM base
          GROUP BY symbol
        )
        SELECT base.symbol, base.report_date, base.item_name, base.item_value
        FROM base
        JOIN latest
          ON base.symbol = latest.symbol AND base.report_date = latest.report_date
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            sym = str(row["symbol"]).upper()
            report_date = str(row["report_date"])[:10] if row.get("report_date") is not None else None
            item = str(row["item_name"])
            raw = row.get("item_value")
            val: Optional[float]
            try:
                val = float(raw) if raw is not None else None
            except Exception:
                val = None

            slot = out.get(sym)
            if not slot:
                slot = {"report_date": report_date, "items": {}}
                out[sym] = slot
            slot["report_date"] = report_date
            slot["items"][item] = val

    return out


def _query_latest_annual_items_aligned(
    symbols: List[str],
    cutoff: date,
    income_item_names: List[str],
    balance_item_names: List[str],
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch latest annual income + balance items for each symbol, aligned on a single report_date
    where both finance types are present (<= cutoff).

    Returns:
      symbol -> {
        "report_date": "YYYY-MM-DD",
        "income_items": {item_name: float|None},
        "balance_items": {item_name: float|None},
      }
    """
    if not symbols:
        return {}

    from defeatbeta_api.utils.const import stock_statement, annual, income_statement, balance_sheet

    _duckdb_client, hf = _get_defeatbeta_clients()
    url = hf.get_url_path(stock_statement)

    income_in = _sql_quote_list(income_item_names)
    balance_in = _sql_quote_list(balance_item_names)

    out: Dict[str, Dict[str, Any]] = {}

    for batch in _chunk(symbols, 200):
        sym_in = _sql_quote_list(batch)
        sql = f"""
        WITH base AS (
          SELECT
            upper(symbol) AS symbol,
            CAST(report_date AS DATE) AS report_date,
            finance_type,
            item_name,
            item_value
          FROM '{url}'
          WHERE upper(symbol) IN ({sym_in})
            AND period_type = '{annual}'
            AND report_date <> 'TTM'
            AND CAST(report_date AS DATE) <= '{cutoff.isoformat()}'
            AND (
              (finance_type = '{income_statement}' AND item_name IN ({income_in})) OR
              (finance_type = '{balance_sheet}' AND item_name IN ({balance_in}))
            )
        ),
        candidates AS (
          SELECT symbol, report_date
          FROM base
          GROUP BY symbol, report_date
          HAVING count(DISTINCT finance_type) = 2
        ),
        latest AS (
          SELECT symbol, max(report_date) AS report_date
          FROM candidates
          GROUP BY symbol
        )
        SELECT b.symbol, b.report_date, b.finance_type, b.item_name, b.item_value
        FROM base b
        JOIN latest l
          ON b.symbol = l.symbol AND b.report_date = l.report_date
        """
        df = _duckdb_query_with_retry(sql)
        for _, row in df.iterrows():
            sym = str(row.get("symbol") or "").upper()
            if not sym:
                continue
            report_date = str(row.get("report_date"))[:10] if row.get("report_date") is not None else None
            ftype = str(row.get("finance_type") or "")
            item = str(row.get("item_name") or "")
            raw = row.get("item_value")
            try:
                val = float(raw) if raw is not None else None
            except Exception:
                val = None

            slot = out.get(sym)
            if not slot:
                slot = {"report_date": report_date, "income_items": {}, "balance_items": {}}
                out[sym] = slot
            slot["report_date"] = report_date
            if ftype == income_statement:
                slot["income_items"][item] = val
            elif ftype == balance_sheet:
                slot["balance_items"][item] = val

    return out


def _pick_first(items: Dict[str, Optional[float]], candidates: List[str]) -> Optional[float]:
    for c in candidates:
        v = items.get(c)
        if v is None:
            continue
        try:
            v2 = float(v)
        except Exception:
            continue
        if not math.isfinite(v2):
            continue
        return v2
    return None


def _get_etf_adj_close_asof(symbol: str, as_of: date, etf_prices: Dict[str, List[Dict[str, Any]]]) -> Optional[float]:
    sym = symbol.strip().upper()
    series = etf_prices.get(sym) or []
    best: Optional[float] = None
    for rec in series:
        d = rec.get("date")
        if not isinstance(d, date):
            continue
        if d <= as_of:
            best = rec.get("adj_close")
        else:
            break
    if best is None:
        return None
    try:
        v = float(best)
    except Exception:
        return None
    return v if math.isfinite(v) else None


def _get_metric_value_from_dict(metrics: Dict[str, Any], metric_key: str) -> Optional[float]:
    """Mirror client-side metric extraction for custom rules."""
    if metric_key in metrics:
        value = metrics.get(metric_key)
        try:
            fval = float(value)
            return fval if math.isfinite(fval) else None
        except Exception:
            return None

    parts = metric_key.split(".")
    if len(parts) == 2:
        parent, child = parts
        parent_obj = metrics.get(parent)
        if isinstance(parent_obj, dict):
            value = parent_obj.get(child)
            try:
                fval = float(value)
                return fval if math.isfinite(fval) else None
            except Exception:
                return None
    return None


def _matches_custom_rule(metrics: Dict[str, Any], rule: CustomRulePayload) -> bool:
    if not rule.enabled:
        return True
    value = _get_metric_value_from_dict(metrics, rule.metric)
    if value is None or not math.isfinite(value):
        return False

    if rule.operator == "<":
        return value < float(rule.value)
    if rule.operator == "<=":
        return value <= float(rule.value)
    if rule.operator == ">":
        return value > float(rule.value)
    if rule.operator == ">=":
        return value >= float(rule.value)
    if rule.operator == "=":
        return abs(value - float(rule.value)) < 0.01
    if rule.operator == "!=":
        return abs(value - float(rule.value)) >= 0.01
    if rule.operator == "between":
        try:
            min_val, max_val = rule.value
            return value >= float(min_val) and value <= float(max_val)
        except Exception:
            return False
    return True


def _filter_records_by_cap(records: List[Dict[str, Any]], cap: Optional[str]) -> List[Dict[str, Any]]:
    if not cap or cap == "all":
        return records

    def _bucket(market_cap: Optional[float]) -> Optional[str]:
        if market_cap is None:
            return None
        if market_cap >= 10_000_000_000:
            return "large"
        if market_cap >= 2_000_000_000:
            return "mid"
        if market_cap >= 300_000_000:
            return "small"
        return None

    filtered: List[Dict[str, Any]] = []
    for rec in records:
        bucket = _bucket(rec.get("market_cap"))
        if bucket is None:
            continue
        if cap == bucket:
            filtered.append(rec)
    return filtered


def _apply_filters_to_records(
    records: List[Dict[str, Any]],
    filters: Optional[ScreenerFiltersPayload],
) -> List[Dict[str, Any]]:
    if not filters:
        return records

    filtered = records

    # Industry/Sector scope check (defensive)
    if filters.industry:
        filtered = [
            r
            for r in filtered
            if r.get("industry") == filters.industry or r.get("sector") == filters.industry
        ]

    # Market cap
    filtered = _filter_records_by_cap(filtered, filters.cap)

    # Custom rules
    rules = filters.customRules or []
    enabled_rules = [r for r in rules if r.enabled]
    if enabled_rules:
        logic = filters.ruleLogic or "AND"
        filtered_rules: List[CustomRulePayload] = enabled_rules

        def _record_matches(rec: Dict[str, Any]) -> bool:
            metrics = rec.get("metrics") or {}
            if logic == "OR":
                return any(_matches_custom_rule(metrics, rule) for rule in filtered_rules)
            return all(_matches_custom_rule(metrics, rule) for rule in filtered_rules)

        filtered = [r for r in filtered if _record_matches(r)]

    return filtered


def _build_backtest_metrics_dict(rec: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a minimal metrics dict compatible with existing custom-rule evaluation.

    The UI uses metric keys like `peRatioTTM`. For the annual backtest, we
    approximate these using ratios computed from annual fundamentals + as-of price.
    """
    return {
        "peRatioTTM": rec.get("pe"),
        "priceToSalesRatioTTM": rec.get("ps"),
        "priceToBookRatioTTM": rec.get("pb"),
        "enterpriseValueOverEBITTTM": rec.get("ev_ebit"),
        "enterpriseValueOverEBITDATTM": rec.get("ev_ebitda"),
        "enterpriseValueToSalesTTM": rec.get("ev_sales"),
        "marketCap": rec.get("market_cap"),
    }


def _get_default_filters(
    db: Session,
    scope: str,
    scope_value: str,
    user_id: str = "default",
) -> Optional[ScreenerFiltersPayload]:
    scope_norm = scope.lower()
    if scope_norm not in ("industry", "sector"):
        return None
    record = (
        db.query(IndustryFilterDefault)
        .filter(
            IndustryFilterDefault.user_id == user_id,
            IndustryFilterDefault.scope == scope_norm,
            IndustryFilterDefault.scope_value == scope_value,
        )
        .first()
    )
    if not record:
        return None
    try:
        return ScreenerFiltersPayload.parse_obj(record.filters)
    except Exception:
        return None


@lru_cache(maxsize=2048)
def _get_ticker(symbol: str) -> Ticker:
    """
    Create (or reuse) a Ticker instance. Cache to avoid repeated construction
    and associated DuckDB/huggingface setup work per request.
    """
    # On Windows, always use Windows-compatible config
    config = WindowsCompatibleDuckDBConfig() if platform.system() == "Windows" else None
    return Ticker(symbol.upper(), config=config)


@lru_cache(maxsize=2048)
def _get_info(symbol: str) -> Dict[str, Any]:
    """
    Get ticker info. Cached with LRU cache (max 2048 entries).
    Note: This cache persists across requests, so info() results are cached.
    """
    """
    defeatbeta_api Ticker.info() returns a DataFrame; take the first row as dict.
    """
    symbol = symbol.upper()
    t = _get_ticker(symbol)
    try:
        info_df = t.info()
        if info_df is None:
            return {}
        if isinstance(info_df, pd.DataFrame):
            if info_df.empty:
                return {}
            return info_df.iloc[0].to_dict()
        if isinstance(info_df, dict):
            return info_df
    except Exception:
        pass
    return {}


def _compute_market_cap(symbol: str) -> Optional[float]:
    """
    Get market cap from defeatbeta_api.
    Primary method: summary()['market_cap'] - this is the most reliable source.
    Fallback: Calculate from price × shares outstanding if summary() fails.
    """
    t = _get_ticker(symbol)
    
    # Method 1: summary() method - contains market_cap column (PRIMARY METHOD)
    try:
        summary = getattr(t, "summary", None)
        if summary and callable(summary):
            summary_df = summary()
            if isinstance(summary_df, pd.DataFrame) and not summary_df.empty:
                # Check for market_cap column (exact match first, then patterns)
                if "market_cap" in summary_df.columns:
                    val = summary_df.iloc[0]["market_cap"]  # summary() returns single row
                    if pd.notna(val):
                        try:
                            mc = _sanitize_float(float(val))
                            if (
                                os.getenv("MARKET_CAP_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")
                                and mc is not None
                            ):
                                print(
                                    f"[market_cap] {symbol} found via summary()['market_cap']: ${mc:,.0f}",
                                    flush=True,
                                )
                            return mc
                        except (ValueError, TypeError):
                            pass
                
                # Fallback: check other column name patterns
                for col in summary_df.columns:
                    if any(pattern in col.lower() for pattern in ["market_cap", "mkt_cap", "marketcap"]):
                        val = summary_df.iloc[0][col]
                        if pd.notna(val):
                            try:
                                mc = _sanitize_float(float(val))
                                if (
                                    os.getenv("MARKET_CAP_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")
                                    and mc is not None
                                ):
                                    print(
                                        f"[market_cap] {symbol} found via summary() column '{col}': ${mc:,.0f}",
                                        flush=True,
                                    )
                                return mc
                            except (ValueError, TypeError):
                                continue
    except Exception as e:
        if os.getenv("MARKET_CAP_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON"):
            print(f"[market_cap] summary() failed for {symbol}: {e}", flush=True)
    
    # Method 2: Calculate market cap from price × shares outstanding (FALLBACK)
    try:
        # Get current price
        price_df = t.price()
        if price_df is not None and not price_df.empty and "close" in price_df.columns:
            current_price = float(price_df.iloc[-1]["close"])
            
            # Try to get shares outstanding from balance sheet
            balance_sheet = t.annual_balance_sheet()
            if balance_sheet is not None and not balance_sheet.empty:
                # Look for shares outstanding columns
                shares_cols = [col for col in balance_sheet.columns if any(pattern in col.lower() for pattern in ["shares", "outstanding", "common_stock"])]
                if symbol in ["AAPL", "MSFT", "NVDA"]:
                    print(f"[market_cap] {symbol} balance_sheet columns: {list(balance_sheet.columns)[:10]}", flush=True)
                    print(f"[market_cap] {symbol} shares columns found: {shares_cols}", flush=True)
                
                # Try common column names for shares outstanding
                for col_name in ["shares_outstanding", "common_stock_shares_outstanding", "sharesOutstanding", "shares"]:
                    if col_name in balance_sheet.columns:
                        shares = balance_sheet.iloc[-1][col_name]
                        if pd.notna(shares) and shares > 0:
                            market_cap = _sanitize_float(current_price * float(shares))
                            if market_cap is not None and symbol in ["AAPL", "MSFT", "NVDA"]:
                                print(f"[market_cap] {symbol} calculated: ${current_price:.2f} × {shares:,.0f} shares = ${market_cap:,.0f}", flush=True)
                            return market_cap
    except Exception as e:
        if symbol in ["AAPL", "MSFT", "NVDA"]:
            print(f"[market_cap] calculation failed for {symbol}: {e}", flush=True)
    
    
    return None


@lru_cache(maxsize=2048)
def _get_market_cap(symbol: str) -> Optional[float]:
    return _compute_market_cap(symbol)


def _process_symbol_metadata(symbol: str) -> Dict[str, Any]:
    """Process a single symbol's metadata (used for parallel processing)."""
    try:
        info = _get_info(symbol)
        market_cap = _get_market_cap(symbol)
        return {
            "symbol": symbol.upper(),
            "sector": info.get("sector") or "Unknown",
            "industry": info.get("industry") or "Unknown",
            "marketCap": market_cap,
        }
    except Exception as exc:
        print(f"[metadata] failed for {symbol}: {exc}")
        return {
            "symbol": symbol.upper(),
            "sector": "Unknown",
            "industry": "Unknown",
            "marketCap": None,
        }


@app.post("/metadata")
def metadata(payload: SymbolsPayload):
    """
    Fetch metadata for multiple symbols in parallel for better performance.
    Uses ThreadPoolExecutor to process symbols concurrently.
    """
    symbols = payload.symbols
    if not symbols:
        return {"symbols": []}
    
    # Use parallel processing for batches of 10+ symbols, sequential for smaller batches
    if len(symbols) >= 10:
        max_workers = min(16, len(symbols))  # Cap at 16 workers
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(_process_symbol_metadata, symbols))
    else:
        # Sequential for small batches (overhead not worth it)
        results = [_process_symbol_metadata(symbol) for symbol in symbols]
    
    return {"symbols": results}


@app.post("/etf/prices/batch")
def etf_prices_batch(payload: SymbolsPayload, days: int = 180):
    """
    Batch endpoint to fetch ETF prices from precomputed JSON (no DuckDB).
    Supports extended lookback periods up to 20 years (7300 days).

    Shape mirrors /prices/batch:
      Request body: { "symbols": ["SPY", "XLK", ...] }
      Response: { "prices": [ { "symbol": "SPY", "closes": [..] }, ... ] }
    
    Args:
        days: Number of days to look back (default: 180, max: 7300 for 20 years)
    """
    # Cap days at 20 years (7300 days) for safety
    days = min(max(1, days), 7300)
    
    etf_map = _load_etf_prices()
    symbols = [s.strip().upper() for s in (payload.symbols or []) if s and s.strip()]

    if not symbols:
        return {"prices": []}

    results: List[Dict[str, Any]] = []

    for sym in symbols:
        series = etf_map.get(sym, [])
        if not series:
            print(f"[etf-prices] No prices found for {sym}", flush=True)
            results.append({"symbol": sym, "closes": []})
            continue

        # Take the last N days (already sorted ascending)
        tail = series[-days:] if days and days > 0 else series
        closes = [float(r["adj_close"]) for r in tail if "adj_close" in r and math.isfinite(float(r["adj_close"]))]
        results.append({"symbol": sym, "closes": closes})

    return {"prices": results}


@app.get("/rrg")
def rrg_snapshot(
    symbols: str = Query(..., description="Comma-separated ETF symbols"),
    benchmark: str = Query("SPY", description="Benchmark symbol (default: SPY)"),
    days: int = Query(180, description="Lookback window in calendar days (30-7300)"),
):
    """
    Calculate current RRG snapshot for ETFs vs a benchmark using precomputed ETF prices.

    This uses the same RS-Ratio / RS-Momentum definition as the historical RRG generator
    so that snapshot values are consistent with the pre-computed history.
    """
    from rrg_history import calculate_rrg, determine_quadrant

    # Clamp days to a reasonable range (30 days to ~20 years)
    days = min(max(30, days), 7300)

    debug_rrg = os.getenv("RRG_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")

    requested_symbols = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not requested_symbols:
        raise HTTPException(status_code=400, detail="symbols query parameter required")

    benchmark = benchmark.strip().upper() or "SPY"

    etf_map = _load_etf_prices()
    if not etf_map:
        raise HTTPException(status_code=500, detail="ETF prices data not available")

    # Get benchmark closes
    bench_series = etf_map.get(benchmark, [])
    if not bench_series:
        raise HTTPException(
            status_code=404,
            detail=f"No prices found for benchmark {benchmark}",
        )

    # Align snapshot lookback with the historical generator: treat `days` as calendar days,
    # and align stock/benchmark on shared dates within that window.
    bench_by_date = {
        r.get("date"): float(r.get("adj_close"))
        for r in bench_series
        if r.get("date") and r.get("adj_close") is not None and math.isfinite(float(r.get("adj_close")))
    }
    bench_dates = [r.get("date") for r in bench_series if r.get("date")]
    bench_dates = [d for d in bench_dates if isinstance(d, str)]
    bench_dates.sort()
    end_date_str = bench_dates[-1] if bench_dates else None
    if not end_date_str:
        raise HTTPException(status_code=400, detail=f"Insufficient benchmark price history for {benchmark}")
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=days)
    start_date_str = start_dt.strftime("%Y-%m-%d")

    def aligned_closes_for_symbol(symbol: str) -> Tuple[List[float], List[float]]:
        series = etf_map.get(symbol, [])
        stock_by_date = {
            r.get("date"): float(r.get("adj_close"))
            for r in series
            if r.get("date") and r.get("adj_close") is not None and math.isfinite(float(r.get("adj_close")))
        }
        # Use benchmark date ordering for stable alignment.
        common_dates = [d for d in bench_dates if start_date_str <= d <= end_date_str and d in stock_by_date and d in bench_by_date]
        stock_prices = [stock_by_date[d] for d in common_dates]
        benchmark_prices = [bench_by_date[d] for d in common_dates]
        return stock_prices, benchmark_prices

    # Quick sanity: need at least some benchmark points in the window.
    bench_window = [bench_by_date[d] for d in bench_dates if start_date_str <= d <= end_date_str and d in bench_by_date]
    if len(bench_window) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient benchmark price history for {benchmark}",
        )

    points: List[Dict[str, Any]] = []

    for sym in requested_symbols:
        series = etf_map.get(sym, [])
        if not series:
            if debug_rrg:
                print(f"[rrg] No prices found for {sym}", flush=True)
            points.append(
                {
                    "symbol": sym,
                    "rsRatio": 100.0,
                    "rsMomentum": 100.0,
                    "quadrant": "LAGGING",
                }
            )
            continue

        stock_prices, benchmark_prices = aligned_closes_for_symbol(sym)

        if len(stock_prices) < 2:
            if debug_rrg:
                print(
                    f"[rrg] Insufficient aligned history for {sym} (start={start_date_str} end={end_date_str}), defaulting to 100/100",
                    flush=True,
                )
            points.append(
                {
                    "symbol": sym,
                    "rsRatio": 100.0,
                    "rsMomentum": 100.0,
                    "quadrant": "LAGGING",
                }
            )
            continue

        try:
            rs_ratio, rs_momentum = calculate_rrg(stock_prices, benchmark_prices)
            quadrant = determine_quadrant(rs_ratio, rs_momentum)
        except Exception as exc:
            if debug_rrg:
                print(f"[rrg] Error calculating RRG for {sym}: {exc}", flush=True)
            rs_ratio, rs_momentum, quadrant = 100.0, 100.0, "LAGGING"

        points.append(
            {
                "symbol": sym,
                "rsRatio": rs_ratio,
                "rsMomentum": rs_momentum,
                "quadrant": quadrant,
            }
        )

    return {
        "benchmark": benchmark,
        "data": points,
    }


@app.get("/rrg/history")
def rrg_history(
    symbols: Optional[str] = Query(None, description="Comma-separated ETF symbols (default: all sectors)"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD, default: today)"),
    lookback_days: int = Query(180, description="Lookback period in days (90, 180, 360, etc.)"),
):
    """
    Get historical RRG data for sector ETFs.

    Returns RRG data points calculated at weekly or monthly intervals.
    Data is pre-computed by scripts/recalculate_rrg_history.py (preferred) or
    scripts/generate_rrg_history.py (legacy).
    """
    LEGACY_HISTORY_PATH = Path(__file__).resolve().parents[1] / "data" / "rrg-history.json"
    CORRECTED_HISTORY_PATH = Path(__file__).resolve().parent / "data" / f"rrg_history_{lookback_days}d.json"

    debug_rrg = os.getenv("RRG_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")
    
    try:
        if CORRECTED_HISTORY_PATH.exists():
            with open(CORRECTED_HISTORY_PATH, "r", encoding="utf-8") as f:
                corrected = json.load(f)
            meta = corrected.get("metadata", {}) if isinstance(corrected, dict) else {}
            history_data = {
                "benchmark": meta.get("benchmark", "SPY"),
                "interval": "weekly",
                "symbols": meta.get("symbols", []),
                "data": corrected.get("data", []) if isinstance(corrected, dict) else [],
            }
        elif LEGACY_HISTORY_PATH.exists():
            with open(LEGACY_HISTORY_PATH, "r", encoding="utf-8") as f:
                history_data = json.load(f)
        else:
            raise HTTPException(
                status_code=404,
                detail="RRG history data not found. Run scripts/recalculate_rrg_history.py first.",
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load RRG history: {e}")
    
    # Parse symbols
    if symbols:
        requested_symbols = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    else:
        requested_symbols = history_data.get("symbols", [])
    
    # Parse dates
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid end_date format: {end_date}")
    else:
        end_dt = datetime.now()
    
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid start_date format: {start_date}")
    else:
        # Default to 10 years back to get maximum available data
        start_dt = end_dt - timedelta(days=365 * 10)
    
    # Filter data
    all_points = history_data.get("data", [])
    start_date_str = start_dt.strftime("%Y-%m-%d")
    end_date_str = end_dt.strftime("%Y-%m-%d")
    
    if debug_rrg:
        print(
            f"[rrg-history] Filtering: symbols={requested_symbols}, lookback={lookback_days}, "
            f"date_range={start_date_str} to {end_date_str}",
            flush=True,
        )
        print(f"[rrg-history] Total points in file: {len(all_points)}", flush=True)
    
    filtered_points = [
        point for point in all_points
        if (
            point.get("symbol") in requested_symbols
            and point.get("lookback_days") == lookback_days
            and start_date_str <= point.get("date", "") <= end_date_str
        )
    ]
    
    if debug_rrg:
        print(f"[rrg-history] Filtered points: {len(filtered_points)}", flush=True)
        if filtered_points:
            dates = sorted(set(p.get("date", "") for p in filtered_points))
            print(
                f"[rrg-history] Date range in filtered data: {dates[0] if dates else 'N/A'} to {dates[-1] if dates else 'N/A'}",
                flush=True,
            )
    
    # Sort by symbol, then date
    filtered_points.sort(key=lambda x: (x.get("symbol", ""), x.get("date", "")))
    
    return {
        "benchmark": history_data.get("benchmark", "SPY"),
        "lookback_days": lookback_days,
        "interval": history_data.get("interval", "weekly"),
        "start_date": start_date_str,
        "end_date": end_date_str,
        "symbols": requested_symbols,
        "total_points": len(filtered_points),
        "data": filtered_points,
    }


@app.post("/rrg/predict")
def rrg_predict(payload: Dict[str, Any]):
    """
    Predict future RRG values using hybrid probabilistic approach.
    
    Uses transition probabilities (historical quadrant transitions) and
    historical analogs (similar past RRG states) instead of ARIMA.
    
    Request body:
    {
        "symbols": ["XLK", "XLF"],
        "current_states": {
            "XLK": {"rsRatio": 105.2, "rsMomentum": 103.1, "quadrant": "LEADING"},
            "XLF": {"rsRatio": 98.5, "rsMomentum": 101.2, "quadrant": "IMPROVING"}
        },
        "horizon_days": 30,
        "lookback_days": 180,
        "n_analogs": 5
    }
    
    Returns:
        Transition probabilities and historical analogs for each symbol.
    """
    from rrg_predictions import batch_generate_predictions
    
    symbols = payload.get("symbols", [])
    current_states = payload.get("current_states", {})
    horizon_days = payload.get("horizon_days", 30)
    lookback_days = payload.get("lookback_days", 180)
    n_analogs = payload.get("n_analogs", 5)
    
    if not symbols:
        raise HTTPException(status_code=400, detail="symbols list required")
    
    if not current_states:
        # Derive current states from precomputed history for the selected lookback.
        corrected_path = Path(__file__).resolve().parent / "data" / f"rrg_history_{lookback_days}d.json"
        legacy_path = Path(__file__).resolve().parents[1] / "data" / "rrg-history.json"
        points: List[Dict[str, Any]] = []

        try:
            if corrected_path.exists():
                corrected = json.loads(corrected_path.read_text(encoding="utf-8"))
                points = corrected.get("data", []) if isinstance(corrected, dict) else []
            elif legacy_path.exists():
                legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
                points = legacy.get("data", []) if isinstance(legacy, dict) else []
                points = [p for p in points if p.get("lookback_days") == lookback_days]
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load RRG history for predictions: {exc}")

        latest_by_symbol: Dict[str, Dict[str, Any]] = {}
        for point in points:
            sym = point.get("symbol")
            if sym not in symbols:
                continue
            date_str = point.get("date")
            if not date_str:
                continue
            existing = latest_by_symbol.get(sym)
            if existing is None or date_str > existing.get("date", ""):
                latest_by_symbol[sym] = point

        current_states = {}
        for symbol in symbols:
            latest = latest_by_symbol.get(symbol)
            if not latest:
                continue
            current_states[symbol] = {
                "rsRatio": latest.get("rsRatio"),
                "rsMomentum": latest.get("rsMomentum"),
                "quadrant": latest.get("quadrant"),
            }

    if not current_states:
        raise HTTPException(
            status_code=400,
            detail="current_states dict required (could not derive from history)",
        )
    
    # Validate current_states
    for symbol in symbols:
        if symbol not in current_states:
            raise HTTPException(
                status_code=400,
                detail=f"Missing current state for symbol: {symbol}"
            )
        
        state = current_states[symbol]
        required_fields = ["rsRatio", "rsMomentum", "quadrant"]
        for field in required_fields:
            if field not in state:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing {field} in current_states for {symbol}"
                )
    
    try:
        predictions = batch_generate_predictions(
            symbols,
            current_states,
            lookback_days,
            n_analogs
        )
        
        return {
            "predictions": predictions,
            "horizon_days": horizon_days,
            "lookback_days": lookback_days,
            "method": "hybrid_probabilistic",
            "disclaimer": "Based on historical patterns. Past performance does not guarantee future results."
        }
    except Exception as e:
        print(f"[rrg-predict] Error generating predictions: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction generation failed: {str(e)}")



@app.post("/industries")
def industries(payload: IndustriesPayload):
    """
    Derive distinct industries and sectors from defeatbeta_api for a given symbol universe.
    The caller (Next.js API) is responsible for providing a reasonable universe.
    """
    industries: set[str] = set()
    sectors: set[str] = set()

    for symbol in payload.symbols:
        try:
            info = _get_info(symbol)
            industry = info.get("industry")
            sector = info.get("sector")

            if isinstance(industry, str) and industry.strip():
                industries.add(industry.strip())
            if isinstance(sector, str) and sector.strip():
                sectors.add(sector.strip())
        except Exception as exc:
            print(f"[industries] failed for {symbol}: {exc}")

    return {
        "industries": sorted(industries),
        "sectors": sorted(sectors),
    }


@app.post("/api/industry/{industry}/analysis")
def industry_analysis(
    industry: str,
    payload: IndustryAnalysisRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """
    Basic industry-level valuation analysis endpoint.

    - Uses provided symbols as the peer universe.
    - Filters symbols to those whose metadata industry matches the path param.
    - Computes valuation factor scores using calculate_valuation_factor with optional weights.

    This is intentionally focused and minimal; additional factors (quality, growth,
    filters, backtests, etc.) will be layered on top in later phases.
    """
    from factor_scoring import calculate_valuation_factor

    target_industry = industry.strip()
    if not target_industry:
        raise HTTPException(status_code=400, detail="Industry path parameter must be non-empty")

    symbols = [s.strip().upper() for s in payload.symbols or [] if s and s.strip()]
    excluded_symbols = {s.strip().upper() for s in (payload.exclude_symbols or []) if s and s.strip()}
    if not symbols:
        return {"industry": target_industry, "symbols": [], "peer_counts": {}, "note": "No symbols provided"}

    # Apply default filters if none provided
    filters_payload: Optional[ScreenerFiltersPayload] = payload.filters
    if filters_payload is None:
        filters_payload = _get_default_filters(db, "industry", target_industry, user_id)

    # Step 1: collect basic metadata and valuation multiples for all requested symbols
    records: List[Dict[str, Any]] = []

    symbol_metrics_map = _load_sector_metrics()

    for symbol in symbols:
        if symbol in excluded_symbols:
            continue
        try:
            sector_name: str = "Unknown"
            metrics: Optional[Dict[str, Any]] = None

            mapped = symbol_metrics_map.get(symbol.upper())
            if mapped:
                sector_name, metrics = mapped

            if not metrics:
                # If symbol not found in precomputed metrics, skip it (no live Ticker fallback to avoid slowness)
                continue

            pe_ratio = _sanitize_float(metrics.get("peRatioTTM")) if metrics.get("peRatioTTM") is not None else None
            ps_ratio = (
                _sanitize_float(metrics.get("priceToSalesRatioTTM"))
                if metrics.get("priceToSalesRatioTTM") is not None
                else None
            )
            pb_ratio = (
                _sanitize_float(metrics.get("priceToBookRatioTTM"))
                if metrics.get("priceToBookRatioTTM") is not None
                else None
            )

            ev_ebit = (
                _sanitize_float(metrics.get("enterpriseValueOverEBITTTM"))
                if metrics.get("enterpriseValueOverEBITTTM") is not None
                else None
            )
            ev_ebitda = (
                _sanitize_float(metrics.get("enterpriseValueOverEBITDATTM"))
                if metrics.get("enterpriseValueOverEBITDATTM") is not None
                else None
            )

            ev_sales = (
                _sanitize_float(metrics.get("enterpriseValueToSalesTTM"))
                if metrics.get("enterpriseValueToSalesTTM") is not None
                else None
            )

            # Skip symbols that are missing core valuation multiples (P/E, P/S, P/B)
            if any(v is None for v in (pe_ratio, ps_ratio, pb_ratio)):
                continue

            records.append(
                {
                    "symbol": symbol,
                    "industry": target_industry,
                    "sector": sector_name,
                    "market_cap": _sanitize_float(metrics.get("marketCap")),
                    "pe_ratio": pe_ratio,
                    "ps_ratio": ps_ratio,
                    "pb_ratio": pb_ratio,
                    "ev_ebit": ev_ebit,
                    "ev_ebitda": ev_ebitda,
                    "ev_sales": ev_sales,
                    "metrics": metrics,
                }
            )
        except Exception as exc:
            print(f"[industry_analysis] failed for {symbol}: {exc}", flush=True)
            continue

    if not records:
        return {
            "industry": target_industry,
            "symbols": [],
            "peer_counts": {},
            "note": "No symbols in the requested industry with usable data",
        }

    # Apply cap filter (base universe) then custom filters for "passes" set
    cap_filtered_records = _filter_records_by_cap(records, filters_payload.cap if filters_payload else "all")
    filtered_records = _apply_filters_to_records(cap_filtered_records, filters_payload)
    filtered_symbols = {rec["symbol"] for rec in filtered_records}
    note = None
    if not filtered_records:
        note = "No symbols matched the applied filters."

    # Step 2: build peer lists for valuation multiples within this universe
    peer_pe_filtered: List[float] = [r["pe_ratio"] for r in filtered_records if r["pe_ratio"] is not None]
    peer_ps_filtered: List[float] = [r["ps_ratio"] for r in filtered_records if r["ps_ratio"] is not None]
    peer_pb_filtered: List[float] = [r["pb_ratio"] for r in filtered_records if r["pb_ratio"] is not None]
    peer_ev_ebit_filtered: List[float] = [r["ev_ebit"] for r in filtered_records if r["ev_ebit"] is not None]
    peer_ev_ebitda_filtered: List[float] = [r["ev_ebitda"] for r in filtered_records if r["ev_ebitda"] is not None]
    peer_ev_sales_filtered: List[float] = [r["ev_sales"] for r in filtered_records if r.get("ev_sales") is not None]

    scoring_records = filtered_records if filtered_records else cap_filtered_records
    peer_pe: List[float] = [r["pe_ratio"] for r in scoring_records if r["pe_ratio"] is not None]
    peer_ps: List[float] = [r["ps_ratio"] for r in scoring_records if r["ps_ratio"] is not None]
    peer_pb: List[float] = [r["pb_ratio"] for r in scoring_records if r["pb_ratio"] is not None]
    peer_ev_ebit: List[float] = [r["ev_ebit"] for r in scoring_records if r["ev_ebit"] is not None]
    peer_ev_ebitda: List[float] = [r["ev_ebitda"] for r in scoring_records if r["ev_ebitda"] is not None]
    peer_ev_sales: List[float] = [r["ev_sales"] for r in scoring_records if r.get("ev_sales") is not None]

    peer_pe_all: List[float] = [r["pe_ratio"] for r in cap_filtered_records if r["pe_ratio"] is not None]
    peer_ps_all: List[float] = [r["ps_ratio"] for r in cap_filtered_records if r["ps_ratio"] is not None]
    peer_pb_all: List[float] = [r["pb_ratio"] for r in cap_filtered_records if r["pb_ratio"] is not None]
    peer_ev_ebit_all: List[float] = [r["ev_ebit"] for r in cap_filtered_records if r["ev_ebit"] is not None]
    peer_ev_ebitda_all: List[float] = [r["ev_ebitda"] for r in cap_filtered_records if r["ev_ebitda"] is not None]
    peer_ev_sales_all: List[float] = [r["ev_sales"] for r in cap_filtered_records if r.get("ev_sales") is not None]

    peer_counts = {
        "pe": len(peer_pe_filtered),
        "ps": len(peer_ps_filtered),
        "pb": len(peer_pb_filtered),
        "ev_ebit": len(peer_ev_ebit_filtered),
        "ev_ebitda": len(peer_ev_ebitda_filtered),
        "ev_sales": len(peer_ev_sales_filtered),
    }

    def _metric_stats(values: List[float]) -> Dict[str, Any]:
        if not values:
            return {
                "count": 0,
                "mean": None,
                "median": None,
                "p25": None,
                "p75": None,
                "min": None,
                "max": None,
            }
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        mean_val = float(statistics.fmean(sorted_vals)) if n > 0 else None
        median_val = float(statistics.median(sorted_vals)) if n > 0 else None
        p25_idx = max(0, int(0.25 * (n - 1)))
        p75_idx = max(0, int(0.75 * (n - 1)))
        return {
            "count": n,
            "mean": mean_val,
            "median": median_val,
            "p25": float(sorted_vals[p25_idx]),
            "p75": float(sorted_vals[p75_idx]),
            "min": float(sorted_vals[0]),
            "max": float(sorted_vals[-1]),
        }

    industry_stats = {
        "pe": _metric_stats(peer_pe_filtered),
        "ps": _metric_stats(peer_ps_filtered),
        "pb": _metric_stats(peer_pb_filtered),
        "ev_ebit": _metric_stats(peer_ev_ebit_filtered),
        "ev_ebitda": _metric_stats(peer_ev_ebitda_filtered),
        "ev_sales": _metric_stats(peer_ev_sales_filtered),
    }
    industry_stats_unfiltered = {
        "pe": _metric_stats(peer_pe_all),
        "ps": _metric_stats(peer_ps_all),
        "pb": _metric_stats(peer_pb_all),
        "ev_ebit": _metric_stats(peer_ev_ebit_all),
        "ev_ebitda": _metric_stats(peer_ev_ebitda_all),
        "ev_sales": _metric_stats(peer_ev_sales_all),
    }

    # Step 3: compute valuation factor per symbol using the shared peer lists
    results: List[Dict[str, Any]] = []

    for rec in cap_filtered_records:
        valuation = calculate_valuation_factor(
            rec["pe_ratio"],
            rec["ps_ratio"],
            rec["pb_ratio"],
            rec["ev_ebit"],
            rec["ev_ebitda"],
            rec.get("ev_sales"),
            peer_pe,
            peer_ps,
            peer_pb,
            peer_ev_ebit,
            peer_ev_ebitda,
            peer_ev_sales,
            weights=payload.weights,
        )
        valuation["raw_values"] = {
            "pe": rec.get("pe_ratio"),
            "ps": rec.get("ps_ratio"),
            "pb": rec.get("pb_ratio"),
            "ev_ebit": rec.get("ev_ebit"),
            "ev_ebitda": rec.get("ev_ebitda"),
            "ev_sales": rec.get("ev_sales"),
        }

        results.append(
            {
                "symbol": rec["symbol"],
                "industry": rec["industry"],
                "sector": rec["sector"],
                "valuation": valuation,
                "passes_filters": rec["symbol"] in filtered_symbols,
            }
        )

    # Sort: passing filters first, then by valuation score desc
    def _sort_key(row: Dict[str, Any]) -> Tuple[int, float]:
        passes = 1 if row.get("passes_filters") else 0
        score = row.get("valuation", {}).get("score")
        score_val = float(score) if isinstance(score, (int, float)) else -1.0
        return (passes, score_val)

    results.sort(key=_sort_key, reverse=True)

    return {
        "industry": target_industry,
        "peer_counts": peer_counts,
        "industry_stats": industry_stats,
        "industry_stats_unfiltered": industry_stats_unfiltered,
        "symbols": results,
        "applied_filters": filters_payload.dict() if filters_payload else None,
        "note": note,
    }


@app.post("/api/backtest/sector")
def backtest_sector(payload: BacktestSectorRequest):
    """
    Point-in-time-ish backtest for a sector using annual fundamentals + a lag rule.

    Caveat: DefeatBeta statements are stamped by period-end date (e.g. 2020-09-30),
    not the true filing/publication timestamp. `fundamentals_lag_days` is a conservative
    approximation to avoid lookahead bias.
    """
    request_id = uuid.uuid4().hex[:10]
    t0 = time.perf_counter()
    timing: Dict[str, float] = {}

    def mark(name: str) -> None:
        timing[name] = time.perf_counter() - t0

    debug_backtest = os.getenv("BACKTEST_DEBUG") in ("1", "true", "TRUE", "yes", "YES", "on", "ON")

    if debug_backtest:
        print(
            f"[backtest:{request_id}] start sector={payload.sector} years={payload.years} hold={payload.holding_years} "
            f"top_n={payload.top_n} lag_days={payload.fundamentals_lag_days} has_filters={payload.filters is not None}",
            flush=True,
        )

    from factor_scoring import calculate_valuation_factor

    sector = (payload.sector or "").strip()
    if not sector:
        raise HTTPException(status_code=400, detail="sector must be non-empty")

    symbol_map = _load_sector_metrics()
    sector_symbols = sorted([sym for sym, (sec, _m) in symbol_map.items() if sec == sector])
    if not sector_symbols:
        raise HTTPException(status_code=404, detail=f"No symbols found for sector: {sector}")
    mark("loaded_sector_symbols")

    etf_prices = _load_etf_prices()
    benchmark = (payload.benchmark or "SPY").strip().upper()
    if benchmark not in etf_prices:
        raise HTTPException(status_code=400, detail=f"Benchmark {benchmark} not found in ETF price file")
    mark("loaded_benchmark_prices")

    today = datetime.utcnow().date()
    holding_years = int(payload.holding_years)
    years = int(payload.years)
    lag_days = int(payload.fundamentals_lag_days)

    min_stmt = _min_annual_statement_date()
    if debug_backtest and min_stmt:
        print(f"[backtest:{request_id}] dataset_min_annual_statement_date={min_stmt.isoformat()}", flush=True)

    # Only include start dates where we can also measure the full holding period.
    as_of_dates: List[date] = []
    for i in range(years, holding_years - 1, -1):
        candidate = _shift_years(today, -i)
        if min_stmt is not None:
            cutoff_candidate = candidate - timedelta(days=lag_days)
            if cutoff_candidate < min_stmt:
                continue
        as_of_dates.append(candidate)
    as_of_dates.sort()

    # Note: raw `stock_statement` item_name values are snake_case, not the
    # "pretty" labels shown in Statement.df(). Keep both where practical.
    income_items = [
        "total_revenue",
        "operating_revenue",
        "diluted_eps",
        "basic_eps",
        "ebit",
        "ebitda",
        "net_income_common_stockholders",
        "net_income",
        # legacy/pretty fallbacks (if present in some templates)
        "Total Revenue",
        "Diluted EPS",
        "EBIT",
        "EBITDA",
        "Net Income Common Stockholders",
        "Net Income",
    ]
    balance_items = [
        "total_debt",
        "long_term_debt_and_capital_lease_obligation",
        "current_debt_and_capital_lease_obligation",
        "cash_and_cash_equivalents",
        "cash_cash_equivalents_and_short_term_investments",
        "stockholders_equity",
        "common_stock_equity",
        "total_equity_gross_minority_interest",
        # legacy/pretty fallbacks
        "Total Debt",
        "Total Debt & Capital Lease Obligation",
        "Cash And Cash Equivalents",
        "Cash, Cash Equivalents & Short Term Investments",
        "Stockholders Equity",
        "Common Stock Equity",
        "Total Equity Gross Minority Interest",
    ]

    points: List[Dict[str, Any]] = []
    win_count = 0
    valid_point_count = 0

    for as_of in as_of_dates:
        iter_t0 = time.perf_counter()
        end_date = _shift_years(as_of, holding_years)
        if end_date > today:
            continue

        cutoff = as_of - timedelta(days=lag_days)

        # Query aligned annual fundamentals first (income + balance share the same report_date),
        # then fetch prices only for symbols that have enough data to compute ratios.
        aligned = _query_latest_annual_items_aligned(
            sector_symbols,
            cutoff=cutoff,
            income_item_names=income_items,
            balance_item_names=balance_items,
        )
        if debug_backtest:
            print(
                f"[backtest:{request_id}] as_of={as_of.isoformat()} cutoff={cutoff.isoformat()} aligned_fundamentals={len(aligned)}",
                flush=True,
            )

        eligible_symbols: List[str] = []
        for sym in sector_symbols:
            row = aligned.get(sym) or {}
            inc_items = row.get("income_items") or {}
            if not isinstance(inc_items, dict) or not inc_items:
                continue
            # Need revenue plus either EPS or net income to compute P/E/P/S reasonably.
            has_revenue = _pick_first(inc_items, ["total_revenue", "Total Revenue", "operating_revenue", "Operating Revenue"]) is not None
            has_eps_or_ni = _pick_first(
                inc_items,
                [
                    "diluted_eps",
                    "Diluted EPS",
                    "net_income_common_stockholders",
                    "Net Income Common Stockholders",
                    "net_income",
                    "Net Income",
                ],
            ) is not None
            if has_revenue and has_eps_or_ni:
                eligible_symbols.append(sym)

        if not eligible_symbols:
            points.append(
                {
                    "as_of": as_of.isoformat(),
                    "end_date": end_date.isoformat(),
                    "universe_size": 0,
                    "selected": [],
                    "note": "No symbols with annual fundamentals available at this date (after lag cutoff)",
                }
            )
            continue

        try:
            price_map = _query_latest_prices(eligible_symbols, as_of)
            # Lag shares outstanding to the same cutoff to avoid lookahead bias.
            shares_map = _query_latest_shares(eligible_symbols, cutoff)
        except Exception as exc:
            msg = str(exc)
            if "HTTP 429" in msg or "Too Many Requests" in msg:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Rate-limited by the DefeatBeta/HuggingFace dataset while reading price data. "
                        "Try again later, or reduce years/top_n, or run the FastAPI service with a warm cache."
                    ),
                )
            raise
        if debug_backtest:
            print(
                f"[backtest:{request_id}] as_of={as_of.isoformat()} prices={len(price_map)} shares={len(shares_map)} eligible={len(eligible_symbols)}",
                flush=True,
            )

        records: List[Dict[str, Any]] = []
        for sym in eligible_symbols:
            p = price_map.get(sym, {}).get("close")
            sh = shares_map.get(sym, {}).get("shares")
            if p is None or sh is None or p <= 0 or sh <= 0:
                continue

            row = aligned.get(sym) or {}
            inc_items = row.get("income_items") or {}
            bal_items = row.get("balance_items") or {}

            diluted_eps = _pick_first(inc_items, ["diluted_eps", "Diluted EPS", "basic_eps", "Basic EPS"])
            net_income = _pick_first(inc_items, ["net_income_common_stockholders", "Net Income Common Stockholders", "net_income", "Net Income"])
            revenue = _pick_first(inc_items, ["total_revenue", "Total Revenue", "operating_revenue", "Operating Revenue"])
            ebit = _pick_first(inc_items, ["ebit", "EBIT"])
            ebitda = _pick_first(inc_items, ["ebitda", "EBITDA"])

            equity = _pick_first(
                bal_items,
                [
                    "stockholders_equity",
                    "Stockholders Equity",
                    "common_stock_equity",
                    "Common Stock Equity",
                    "total_equity_gross_minority_interest",
                    "Total Equity Gross Minority Interest",
                ],
            )
            cash = _pick_first(
                bal_items,
                [
                    "cash_cash_equivalents_and_short_term_investments",
                    "Cash, Cash Equivalents & Short Term Investments",
                    "cash_and_cash_equivalents",
                    "Cash And Cash Equivalents",
                ],
            )
            debt = _pick_first(
                bal_items,
                [
                    "total_debt",
                    "Total Debt",
                    "long_term_debt_and_capital_lease_obligation",
                    "current_debt_and_capital_lease_obligation",
                    "Total Debt & Capital Lease Obligation",
                ],
            )

            market_cap = p * sh

            # Use reported EPS only to avoid mismatching statement periods with share counts.
            eps = diluted_eps
            pe_raw = (p / eps) if (eps is not None and eps > 0) else None
            pe = pe_raw if (pe_raw is not None and pe_raw > 0) else None
            ps_raw = (market_cap / revenue) if (revenue is not None and revenue > 0) else None
            ps = ps_raw if (ps_raw is not None and ps_raw > 0) else None
            pb_raw = (market_cap / equity) if (equity is not None and equity > 0) else None
            pb = pb_raw if (pb_raw is not None and pb_raw > 0) else None

            ev = None
            if debt is not None or cash is not None:
                ev = market_cap + (debt or 0.0) - (cash or 0.0)

            ev_ebit_raw = (ev / ebit) if (ev is not None and ebit is not None and ebit > 0) else None
            ev_ebit = ev_ebit_raw if (ev_ebit_raw is not None and ev_ebit_raw > 0) else None
            ev_ebitda_raw = (ev / ebitda) if (ev is not None and ebitda is not None and ebitda > 0) else None
            ev_ebitda = ev_ebitda_raw if (ev_ebitda_raw is not None and ev_ebitda_raw > 0) else None
            ev_sales_raw = (ev / revenue) if (ev is not None and revenue is not None and revenue > 0) else None
            ev_sales = ev_sales_raw if (ev_sales_raw is not None and ev_sales_raw > 0) else None

            records.append(
                {
                    "symbol": sym,
                    "industry": sector,
                    "sector": sector,
                    "price": p,
                    "shares": sh,
                    "market_cap": market_cap,
                    "pe": pe,
                    "pe_raw": pe_raw,
                    "ps": ps,
                    "ps_raw": ps_raw,
                    "pb": pb,
                    "pb_raw": pb_raw,
                    "ev_ebit": ev_ebit,
                    "ev_ebit_raw": ev_ebit_raw,
                    "ev_ebitda": ev_ebitda,
                    "ev_ebitda_raw": ev_ebitda_raw,
                    "ev_sales": ev_sales,
                    "ev_sales_raw": ev_sales_raw,
                    "metrics": None,  # filled below for custom rules
                }
            )

        if not records:
            points.append(
                {
                    "as_of": as_of.isoformat(),
                    "end_date": end_date.isoformat(),
                    "universe_size": 0,
                    "selected": [],
                    "note": "No symbols with sufficient price/shares/fundamentals at this date",
                }
            )
            continue

        # Attach a metrics dict so existing custom rules can run.
        for rec in records:
            rec["metrics"] = _build_backtest_metrics_dict(rec)

        # Apply screener-style filters (cap + custom rules) if provided.
        unsupported_metrics: List[str] = []
        filters_for_backtest = payload.filters
        if payload.filters and payload.filters.customRules:
            supported = {
                "peRatioTTM",
                "priceToSalesRatioTTM",
                "priceToBookRatioTTM",
                "enterpriseValueOverEBITTTM",
                "enterpriseValueOverEBITDATTM",
                "enterpriseValueToSalesTTM",
                "marketCap",
            }
            filtered_rules = []
            for r in payload.filters.customRules:
                if r.metric in supported:
                    filtered_rules.append(r)
                else:
                    unsupported_metrics.append(r.metric)
            if unsupported_metrics:
                filters_for_backtest = payload.filters.copy(deep=True)
                filters_for_backtest.customRules = filtered_rules

        filtered_by_filters = _apply_filters_to_records(records, filters_for_backtest)
        cap_filtered_records = _filter_records_by_cap(
            records,
            filters_for_backtest.cap if filters_for_backtest else None,
        )

        # Then apply the backtest's built-in P/E rules (these are redundant with custom rules,
        # but kept for now since the UI exposes them directly).
        records_for_rules = filtered_by_filters

        peer_pe = [r["pe"] for r in cap_filtered_records if r.get("pe") is not None]
        peer_ps = [r["ps"] for r in cap_filtered_records if r.get("ps") is not None]
        peer_pb = [r["pb"] for r in cap_filtered_records if r.get("pb") is not None]
        peer_ev_ebit = [r["ev_ebit"] for r in cap_filtered_records if r.get("ev_ebit") is not None]
        peer_ev_ebitda = [r["ev_ebitda"] for r in cap_filtered_records if r.get("ev_ebitda") is not None]
        peer_ev_sales = [r["ev_sales"] for r in cap_filtered_records if r.get("ev_sales") is not None]

        mean_pe = statistics.fmean(peer_pe) if peer_pe else None
        fundamental_rules = payload.rules.fundamental_rules or []
        metric_means: Dict[str, Optional[float]] = {}
        metric_medians: Dict[str, Optional[float]] = {}

        if fundamental_rules:
            metrics = ["pe", "ps", "pb", "ev_ebit", "ev_ebitda", "ev_sales"]
            for metric in metrics:
                values = [
                    r.get(metric)
                    for r in cap_filtered_records
                    if isinstance(r.get(metric), (int, float)) and math.isfinite(r.get(metric))
                ]
                metric_means[metric] = statistics.fmean(values) if values else None
                metric_medians[metric] = statistics.median(values) if values else None

        def _passes_fundamental_rules(rec: Dict[str, Any]) -> bool:
            if not fundamental_rules:
                return True
            for rule in fundamental_rules:
                metric = rule.metric
                operator = rule.operator
                val = rec.get(metric)
                if not isinstance(val, (int, float)) or not math.isfinite(val):
                    return False
                if operator == "gt_zero":
                    if val <= 0:
                        return False
                elif operator == "lt_mean":
                    mean_val = metric_means.get(metric)
                    if mean_val is None or val >= mean_val:
                        return False
                elif operator == "lt_median":
                    median_val = metric_medians.get(metric)
                    if median_val is None or val >= median_val:
                        return False
            return True

        filtered: List[Dict[str, Any]] = []
        for rec in records_for_rules:
            pe_val = rec.get("pe")
            if payload.rules.pe_positive and (pe_val is None or pe_val <= 0):
                continue
            if payload.rules.pe_below_universe_mean:
                if mean_pe is not None and (pe_val is None or pe_val >= mean_pe):
                    continue
            if not _passes_fundamental_rules(rec):
                continue
            filtered.append(rec)

        scored: List[Dict[str, Any]] = []
        for rec in filtered:
            valuation = calculate_valuation_factor(
                rec.get("pe"),
                rec.get("ps"),
                rec.get("pb"),
                rec.get("ev_ebit"),
                rec.get("ev_ebitda"),
                rec.get("ev_sales"),
                peer_pe,
                peer_ps,
                peer_pb,
                peer_ev_ebit,
                peer_ev_ebitda,
                peer_ev_sales,
                weights=payload.weights,
            )
            scored.append(
                {
                    "symbol": rec["symbol"],
                    "valuation_score": valuation.get("score"),
                    "valuation_components": valuation.get("components"),
                    "ratios": {
                        "pe": rec.get("pe_raw"),
                        "ps": rec.get("ps_raw"),
                        "pb": rec.get("pb_raw"),
                        "ev_ebit": rec.get("ev_ebit_raw"),
                        "ev_ebitda": rec.get("ev_ebitda_raw"),
                        "ev_sales": rec.get("ev_sales_raw"),
                    },
                }
            )

        scored.sort(
            key=lambda r: (r.get("valuation_score") is not None, r.get("valuation_score") or 0.0),
            reverse=True,
        )
        selected = scored[: int(payload.top_n)]
        selected_symbols = [s["symbol"] for s in selected]

        # Start prices come from the already-fetched as_of price map.
        end_prices = _query_latest_prices(selected_symbols, end_date)
        split_events = _query_split_events(selected_symbols, as_of, end_date)
        dividend_events = _query_dividend_events(selected_symbols, as_of, end_date)

        per_stock_returns: List[float] = []
        selected_with_returns: List[Dict[str, Any]] = []
        for row in selected:
            sym = row["symbol"]
            sp = (price_map.get(sym) or {}).get("close")
            ep = (end_prices.get(sym) or {}).get("close")

            sym_splits = split_events.get(sym) or []
            split_factor = _split_factor_between(sym_splits, as_of, end_date)

            # Convert end price to the same basis as start price (pre-split share basis).
            ep_adj = (ep * split_factor) if (ep is not None and split_factor and split_factor > 0) else ep

            # Dividends are assumed per share; scale by share count changes due to splits.
            div = _split_adjusted_dividends(dividend_events.get(sym) or [], sym_splits, as_of, end_date)

            tr: Optional[float] = None
            if sp is not None and ep_adj is not None and sp > 0:
                tr = (ep_adj + div) / sp - 1.0
                if math.isfinite(tr):
                    per_stock_returns.append(tr)
            selected_with_returns.append(
                {
                    **row,
                    "total_return": tr,
                    "dividends": div,
                    "split_factor": split_factor if split_factor != 1.0 else None,
                }
            )

        portfolio_return = statistics.fmean(per_stock_returns) if per_stock_returns else None

        b_start = _get_etf_adj_close_asof(benchmark, as_of, etf_prices)
        b_end = _get_etf_adj_close_asof(benchmark, end_date, etf_prices)
        benchmark_return = None
        if b_start is not None and b_end is not None and b_start > 0:
            benchmark_return = b_end / b_start - 1.0

        # Calculate industry average return for both raw and filtered universes.
        industry_avg_return = None
        industry_avg_return_raw = None
        cap_filtered_records = filtered_by_filters if payload.filters else records
        
        if debug_backtest:
            print(
                f"[backtest:{request_id}] industry_avg: as_of={as_of.isoformat()} "
                f"cap_filtered_count={len(cap_filtered_records)}",
                flush=True,
            )
        
        if records:
            industry_symbols = [r["symbol"] for r in records]
            filtered_symbols = [r["symbol"] for r in cap_filtered_records]
            industry_start_prices = {sym: (price_map.get(sym) or {}).get("close") for sym in industry_symbols}
            
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: querying end_date prices for {len(industry_symbols)} symbols "
                    f"(end_date={end_date.isoformat()})",
                    flush=True,
                )
            industry_avg_query_t0 = time.perf_counter()
            industry_end_prices_map = _query_latest_prices(industry_symbols, end_date)
            industry_avg_query_t1 = time.perf_counter()
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: end_date prices query done in {(industry_avg_query_t1 - industry_avg_query_t0) * 1000:.0f}ms "
                    f"(got prices for {len(industry_end_prices_map)} symbols)",
                    flush=True,
                )
            
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: querying split events for {len(industry_symbols)} symbols "
                    f"(as_of={as_of.isoformat()} to end_date={end_date.isoformat()})",
                    flush=True,
                )
            industry_avg_query_t0 = time.perf_counter()
            industry_splits_map = _query_split_events(industry_symbols, as_of, end_date)
            industry_avg_query_t1 = time.perf_counter()
            splits_count = sum(len(events) for events in industry_splits_map.values())
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: split events query done in {(industry_avg_query_t1 - industry_avg_query_t0) * 1000:.0f}ms "
                    f"(found {splits_count} total split events across {len([s for s in industry_splits_map.values() if s])} symbols)",
                    flush=True,
                )
            
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: querying dividend events for {len(industry_symbols)} symbols "
                    f"(as_of={as_of.isoformat()} to end_date={end_date.isoformat()})",
                    flush=True,
                )
            industry_avg_query_t0 = time.perf_counter()
            industry_dividends_map = _query_dividend_events(industry_symbols, as_of, end_date)
            industry_avg_query_t1 = time.perf_counter()
            dividends_count = sum(len(events) for events in industry_dividends_map.values())
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: dividend events query done in {(industry_avg_query_t1 - industry_avg_query_t0) * 1000:.0f}ms "
                    f"(found {dividends_count} total dividend events across {len([d for d in industry_dividends_map.values() if d])} symbols)",
                    flush=True,
                )
            
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: calculating returns for raw={len(industry_symbols)} filtered={len(filtered_symbols)} symbols",
                    flush=True,
                )
            industry_calc_t0 = time.perf_counter()
            industry_returns: List[float] = []
            filtered_returns: List[float] = []
            skipped_count = 0
            filtered_skipped = 0
            filtered_set = set(filtered_symbols)
            for sym in industry_symbols:
                sp = industry_start_prices.get(sym)
                ep = (industry_end_prices_map.get(sym) or {}).get("close")
                
                if sp is None or ep is None or sp <= 0:
                    skipped_count += 1
                    if sym in filtered_set:
                        filtered_skipped += 1
                    continue
                
                sym_splits = industry_splits_map.get(sym) or []
                split_factor = _split_factor_between(sym_splits, as_of, end_date)
                ep_adj = (ep * split_factor) if (ep is not None and split_factor and split_factor > 0) else ep
                
                div = _split_adjusted_dividends(industry_dividends_map.get(sym) or [], sym_splits, as_of, end_date)
                
                tr = (ep_adj + div) / sp - 1.0 if (ep_adj is not None and sp > 0) else None
                if tr is not None and math.isfinite(tr):
                    industry_returns.append(tr)
                    if sym in filtered_set:
                        filtered_returns.append(tr)
            industry_calc_t1 = time.perf_counter()

            industry_avg_return_raw = statistics.fmean(industry_returns) if industry_returns else None
            industry_avg_return = statistics.fmean(filtered_returns) if filtered_returns else None
            if debug_backtest:
                avg_return_str = f"{industry_avg_return * 100:.2f}%" if industry_avg_return is not None else "None"
                avg_return_raw_str = f"{industry_avg_return_raw * 100:.2f}%" if industry_avg_return_raw is not None else "None"
                print(
                    f"[backtest:{request_id}] industry_avg: return calculation done in {(industry_calc_t1 - industry_calc_t0) * 1000:.0f}ms "
                    f"(raw={len(industry_returns)} returns, skipped {skipped_count} symbols, "
                    f"filtered={len(filtered_returns)} returns, skipped_filtered={filtered_skipped}, "
                    f"avg_return={avg_return_str}, avg_return_raw={avg_return_raw_str})",
                    flush=True,
                )
        else:
            if debug_backtest:
                print(
                    f"[backtest:{request_id}] industry_avg: no cap_filtered_records, skipping industry average calculation",
                    flush=True,
                )

        if portfolio_return is not None and benchmark_return is not None:
            valid_point_count += 1
            if portfolio_return > benchmark_return:
                win_count += 1

        points.append(
            {
                "as_of": as_of.isoformat(),
                "end_date": end_date.isoformat(),
                "universe_size": len(records),
                "filtered_by_filters_size": len(filtered_by_filters),
                "filtered_size": len(filtered),
                "mean_pe": mean_pe,
                "selected": selected_with_returns,
                "portfolio_total_return": portfolio_return,
                "benchmark_total_return": benchmark_return,
                "industry_avg_return": industry_avg_return,
                "industry_avg_return_raw": industry_avg_return_raw,
                "industry_avg_return_filtered": industry_avg_return,
                "timing_ms": int((time.perf_counter() - iter_t0) * 1000),
                "unsupported_filter_metrics": sorted(set(unsupported_metrics)) if unsupported_metrics else [],
            }
        )
        if debug_backtest:
            print(
                f"[backtest:{request_id}] as_of={as_of.isoformat()} done universe={len(records)} filtered={len(filtered)} selected={len(selected)}",
                flush=True,
            )

    portfolio_returns = [p.get("portfolio_total_return") for p in points if p.get("portfolio_total_return") is not None]
    benchmark_returns = [p.get("benchmark_total_return") for p in points if p.get("benchmark_total_return") is not None]
    industry_avg_returns = [p.get("industry_avg_return") for p in points if p.get("industry_avg_return") is not None]
    industry_avg_returns_raw = [p.get("industry_avg_return_raw") for p in points if p.get("industry_avg_return_raw") is not None]
    summary = {
        "points": len(points),
        "points_with_returns": valid_point_count,
        "win_rate": (win_count / valid_point_count) if valid_point_count else None,
        "avg_portfolio_return": statistics.fmean(portfolio_returns) if portfolio_returns else None,
        "avg_benchmark_return": statistics.fmean(benchmark_returns) if benchmark_returns else None,
        "avg_industry_return": statistics.fmean(industry_avg_returns) if industry_avg_returns else None,
        "avg_industry_return_raw": statistics.fmean(industry_avg_returns_raw) if industry_avg_returns_raw else None,
    }

    mark("done")
    timing_ms = {k: int(v * 1000) for k, v in timing.items()}
    if debug_backtest:
        print(f"[backtest:{request_id}] done timing_ms={timing_ms} points={len(points)}", flush=True)

    return {
        "sector": sector,
        "benchmark": benchmark,
        "request_id": request_id,
        "server_timing_ms": timing_ms,
        "params": payload.dict(),
        "applied_filters": payload.filters.dict() if payload.filters else None,
        "note": "Annual fundamentals are period-end dated; point-in-time is approximated via fundamentals_lag_days.",
        "data": points,
        "summary": summary,
    }


def _load_backtest_rules_cache() -> None:
    """Load precomputed backtest rules from JSON file into memory."""
    global _BACKTEST_RULES_CACHE
    if _BACKTEST_RULES_CACHE["loaded"]:
        return

    data_path = Path(__file__).parent / "data" / "backtest_rule_search.json"
    if not data_path.exists():
        print(f"[backtest/rules] Warning: {data_path} not found", flush=True)
        _BACKTEST_RULES_CACHE["loaded"] = True
        return

    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            data = []

        # Extract unique values for filters
        sectors = sorted(set(r.get("sector", "") for r in data if r.get("sector")))
        caps = sorted(set(r.get("cap", "") for r in data if r.get("cap")))
        holding_years = sorted(set(r.get("holding_years", 0) for r in data if r.get("holding_years")))

        _BACKTEST_RULES_CACHE["data"] = data
        _BACKTEST_RULES_CACHE["sectors"] = sectors
        _BACKTEST_RULES_CACHE["caps"] = caps
        _BACKTEST_RULES_CACHE["holding_years"] = holding_years
        _BACKTEST_RULES_CACHE["loaded"] = True
        print(f"[backtest/rules] Loaded {len(data)} precomputed rules", flush=True)
    except Exception as exc:
        print(f"[backtest/rules] Error loading rules: {exc}", flush=True)
        _BACKTEST_RULES_CACHE["loaded"] = True


@app.get("/api/backtest/rules")
def get_backtest_rules(
    sector: Optional[str] = Query(None, description="Filter by sector"),
    cap: Optional[str] = Query(None, description="Filter by cap size (large/mid/small)"),
    holding_years: Optional[int] = Query(None, description="Filter by holding period (1/2/3)"),
    sort_by: str = Query("train_avg_excess", description="Sort field"),
    sort_dir: str = Query("desc", description="Sort direction (asc/desc)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Results per page"),
):
    """
    Query precomputed backtest rule results with filtering, sorting, and pagination.
    """
    _load_backtest_rules_cache()

    data = _BACKTEST_RULES_CACHE["data"]
    sectors = _BACKTEST_RULES_CACHE["sectors"]
    caps = _BACKTEST_RULES_CACHE["caps"]
    holding_years_options = _BACKTEST_RULES_CACHE["holding_years"]

    # Filter
    filtered = data
    if sector:
        filtered = [r for r in filtered if r.get("sector") == sector]
    if cap and cap != "all":
        filtered = [r for r in filtered if r.get("cap") == cap]
    if holding_years:
        filtered = [r for r in filtered if r.get("holding_years") == holding_years]

    # Sort
    valid_sort_fields = [
        "rule_id", "sector", "cap", "holding_years",
        "train_avg_portfolio", "train_avg_benchmark", "train_avg_excess", "train_win_rate",
        "test_avg_portfolio", "test_avg_benchmark", "test_avg_excess", "test_win_rate",
    ]
    if sort_by not in valid_sort_fields:
        sort_by = "train_avg_excess"

    reverse = sort_dir.lower() == "desc"

    def sort_key(r: Dict[str, Any]) -> Any:
        val = r.get(sort_by)
        if val is None:
            return float("-inf") if reverse else float("inf")
        return val

    filtered.sort(key=sort_key, reverse=reverse)

    # Paginate
    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    results = filtered[start:end]

    return {
        "results": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "sectors": sectors,
        "caps": caps,
        "holding_years_options": holding_years_options,
    }


class IndustryFilterDefaultPayload(BaseModel):
    scope: Literal["industry", "sector"] = "industry"
    filters: dict


@app.get("/filters/default/{scope}/{value}")
def get_filter_default(
    scope: str,
    value: str,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    scope_norm = scope.lower()
    if scope_norm not in ("industry", "sector"):
        raise HTTPException(status_code=400, detail="scope must be 'industry' or 'sector'")

    record = (
        db.query(IndustryFilterDefault)
        .filter(
            IndustryFilterDefault.user_id == user_id,
            IndustryFilterDefault.scope == scope_norm,
            IndustryFilterDefault.scope_value == value,
        )
        .first()
    )

    if not record:
        raise HTTPException(status_code=404, detail="No default filters found for this scope")

    return record.to_dict()


@app.put("/filters/default/{scope}/{value}")
def upsert_filter_default(
    scope: str,
    value: str,
    payload: IndustryFilterDefaultPayload,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    scope_norm = scope.lower()
    if scope_norm not in ("industry", "sector"):
        raise HTTPException(status_code=400, detail="scope must be 'industry' or 'sector'")

    record = (
        db.query(IndustryFilterDefault)
        .filter(
            IndustryFilterDefault.user_id == user_id,
            IndustryFilterDefault.scope == scope_norm,
            IndustryFilterDefault.scope_value == value,
        )
        .first()
    )

    now = datetime.utcnow()
    if record:
        record.filters = payload.filters
        record.updated_at = now
    else:
        record = IndustryFilterDefault(
            user_id=user_id,
            scope=scope_norm,
            scope_value=value,
            filters=payload.filters,
            created_at=now,
            updated_at=now,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record.to_dict()


@lru_cache(maxsize=512)
def _get_defeatbeta_news_df(symbol: str) -> Optional[pd.DataFrame]:
    """
    Fetch news DataFrame from defeatbeta_api with caching.
    Returns None if news is not available.
    """
    symbol = symbol.upper()
    try:
        t = _get_ticker(symbol)
        news_obj = getattr(t, "news", None)
        if not news_obj or not callable(news_obj):
            return None

        news_wrapper = news_obj()
        df = getattr(news_wrapper, "get_news_list", lambda: None)()
        if df is None or not isinstance(df, pd.DataFrame) or df.empty:
            return None
        return df
    except Exception:
        
        return None


@app.post("/defeatbeta/news")
def defeatbeta_news(req: NewsRequest):
    """
    Fetch news for a single symbol directly from defeatbeta_api.
    Filters to last 180 days (matching Finnhub window) and limits to 500 most recent articles.
    Returns a simple JSON array of items that can be merged with Finnhub news.
    """
    symbol = req.symbol.upper()
    start_time = datetime.now()
    
    try:
        # Get cached DataFrame (or fetch if not cached)
        df = _get_defeatbeta_news_df(symbol)
        if df is None or df.empty:
        
            return {"symbol": symbol, "news": []}

        # Filter by date: last 90 days (matching Finnhub LOOKBACK_DAYS)
        cutoff_date = datetime.now() - timedelta(days=90)
        cutoff_timestamp = pd.Timestamp(cutoff_date)
        
        # Check if report_date column exists and filter
        if "report_date" in df.columns:
            # Convert report_date to datetime if it's not already
            df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
            # Filter to last 180 days (drop NaT values)
            df_filtered = df[df["report_date"].notna() & (df["report_date"] >= cutoff_timestamp)].copy()
        else:
            # If no report_date column, use all data but limit
            df_filtered = df.copy()
        
        # Sort by report_date descending (most recent first) and limit to 500
        if "report_date" in df_filtered.columns:
            df_filtered = df_filtered.sort_values("report_date", ascending=False)
        df_filtered = df_filtered.head(500)  # Limit to 500 most recent
        
        
        # Convert to records and normalize
        records = df_filtered.to_dict(orient="records")
        normalized = _normalize_news_items(records)

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        return {"symbol": symbol, "news": normalized}
    except HTTPException:
        raise
    except Exception as exc:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        print(f"[defeatbeta/news] failed for {symbol} after {duration_ms:.0f}ms: {exc}", flush=True)
        import traceback
        traceback.print_exc()
        return {"symbol": symbol, "news": []}


def _score_sentiment(text: str) -> Optional[float]:
    result = _score_sentiment_batch([text], batch_size=1)
    return result[0] if result else None


def _score_sentiment_batch(
    texts: List[str],
    batch_size: Optional[int] = None,
    log_prefix: Optional[str] = None,
    start_time: Optional[datetime] = None,
) -> List[Optional[float]]:
    """
    Batch FinBERT scoring to improve throughput (GPU-friendly, less tokenizer overhead).
    Optionally logs progress using log_prefix + timing info.
    """
    if batch_size is None:
        batch_size = _FINBERT_BATCH_SIZE

    if not texts:
        return []

    _ensure_finbert_loaded()
    if _FINBERT_TOKENIZER is None or _FINBERT_MODEL is None or _FINBERT_ID2LABEL is None:
        print("[FinBERT] Model not available, skipping sentiment", flush=True)
        return [None] * len(texts)

    # Resolve label indices once per batch run
    labels_lower = {idx: lbl.lower() for idx, lbl in _FINBERT_ID2LABEL.items()}
    pos_idx = next((i for i, lbl in labels_lower.items() if lbl == "positive"), 2)
    neg_idx = next((i for i, lbl in labels_lower.items() if lbl == "negative"), 0)

    device = "cuda" if torch.cuda.is_available() and next(_FINBERT_MODEL.parameters()).is_cuda else "cpu"
    results: List[Optional[float]] = [None] * len(texts)
    total = len(texts)
    processed = 0

    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        indices = list(range(start, end))
        batch_texts = []
        batch_map = []

        for idx in indices:
            text = texts[idx]
            if not text or not isinstance(text, str):
                continue
            batch_texts.append(text)
            batch_map.append(idx)

        if not batch_texts:
            processed = end
            continue

        inputs = _FINBERT_TOKENIZER(
            batch_texts,
            return_tensors="pt",
            truncation=True,
            max_length=256,
            padding=True,  # dynamic padding keeps batches compact
        )

        if device == "cuda":
            inputs = {k: v.cuda(non_blocking=True) for k, v in inputs.items()}

        with torch.no_grad():
            logits = _FINBERT_MODEL(**inputs).logits
            probs = torch.nn.functional.softmax(logits, dim=-1)

        scores = (probs[:, pos_idx] - probs[:, neg_idx]).detach().cpu().tolist()
        for local_idx, score in enumerate(scores):
            results[batch_map[local_idx]] = float(score)

        processed = end
        if log_prefix and start_time:
            elapsed = (datetime.now() - start_time).total_seconds()
            rate = processed / elapsed if elapsed > 0 else 0
            print(
                f"{log_prefix}: {processed}/{total} items processed "
                f"({processed*100//total}%) | Rate: {rate:.1f} items/s",
                flush=True,
            )

    return results


@lru_cache(maxsize=2048)
def _sentiment_timeseries(symbol: str, days: int) -> Dict[str, Any]:
    """
    Compute daily sentiment over the given lookback window using defeatbeta news.
    """
    start_time = datetime.now()
    symbol = symbol.upper()
    print(f"[FinBERT] Starting sentiment analysis for {symbol} (last {days} days)...", flush=True)
    
    df = _get_defeatbeta_news_df(symbol)
    if df is None or df.empty:
        print(f"[FinBERT] No news data found for {symbol}", flush=True)
        return {"symbol": symbol, "points": [], "summary": {}}

    cutoff = datetime.utcnow() - timedelta(days=days)
    df = df.copy()
    df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
    df = df[df["report_date"].notna()]
    df = df[df["report_date"] >= cutoff]

    if df.empty:
        print(f"[FinBERT] No news articles in date range for {symbol}", flush=True)
        return {"symbol": symbol, "points": [], "summary": {}}

    total_articles = len(df)
    print(f"[FinBERT] Processing {total_articles} articles for {symbol}...", flush=True)
    
    texts = [f"{row.get('title','')} {row.get('news','')}" for _, row in df.iterrows()]
    sentiments = _score_sentiment_batch(
        texts,
        batch_size=_FINBERT_BATCH_SIZE,
        log_prefix=f"[FinBERT] {symbol}",
        start_time=start_time,
    )

    df["sentiment"] = sentiments
    df = df[df["sentiment"].notna()]
    if df.empty:
        print(f"[FinBERT] No valid sentiment scores for {symbol}", flush=True)
        return {"symbol": symbol, "points": [], "summary": {}}

    df["date"] = df["report_date"].dt.date
    daily = df.groupby("date").agg(
        score=("sentiment", "mean"),
        count=("sentiment", "count"),
    ).reset_index().sort_values("date")

    points_raw = [
        {
          "date": d.strftime("%Y-%m-%d"),
          "score": round(float(s), 4),
          "count": int(c),
        }
        for d, s, c in zip(daily["date"], daily["score"], daily["count"])
    ]

    points = _normalize_sentiment_points(points_raw)

    summary = {
        "avg": round(float(daily["score"].mean()), 4),
        "last7": round(float(daily.tail(7)["score"].mean()), 4),
        "days": days,
        "total_articles": int(df.shape[0]),
    }

    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"[FinBERT] Completed sentiment analysis for {symbol}: {len(points)} daily points, "
          f"{summary['total_articles']} articles, {elapsed:.2f}s total", flush=True)
    
    return {
        "symbol": symbol,
        "points": points,
        "summary": _normalize_sentiment_summary(summary),
    }


@app.post("/sentiment")
def sentiment(req: NewsRequest):
    """
    Return daily sentiment scores over the lookback window (default 365 days).
    Uses defeatbeta news only to avoid Finnhub rate limits; scored with VADER.
    """
    try:
        data = _sentiment_timeseries(req.symbol, req.days)
        return data
    except Exception as exc:
        print(f"[sentiment] failed for {req.symbol}: {exc}", flush=True)
        return {"symbol": req.symbol.upper(), "points": [], "summary": {}}


@app.post("/sentiment/from_texts")
def sentiment_from_texts(req: SentimentTextBatch):
    """
    Compute sentiment timeseries from arbitrary text items supplied by the caller.

    This is used by the Next.js app to compute sentiment over the union of
    Finnhub and defeatbeta news (headlines + summaries) instead of only
    defeatbeta's internal news table.
    """
    start_time = datetime.now()
    symbol = req.symbol.upper()
    items = req.items or []

    if not items:
        print(f"[FinBERT] No items provided for {symbol}", flush=True)
        return {"symbol": symbol, "points": [], "summary": {}}

    total_items = len(items)
    print(f"[FinBERT] Starting sentiment analysis for {symbol}: {total_items} text items...", flush=True)

    scored: List[Dict[str, Any]] = []
    texts = [item.text for item in items]
    scores = _score_sentiment_batch(
        texts,
        batch_size=_FINBERT_BATCH_SIZE,
        log_prefix=f"[FinBERT] {symbol}",
        start_time=start_time,
    )

    for item, score in zip(items, scores):
        if score is None:
            continue
        scored.append(
            {
                "date": item.date,
                "score": score,
            }
        )

    if not scored:
        return {"symbol": symbol, "points": [], "summary": {}}

    # Aggregate by date (YYYY-MM-DD). If no date provided, group under 'unknown'.
    by_date: Dict[str, List[float]] = {}
    for row in scored:
        date_str = row.get("date") or "unknown"
        by_date.setdefault(date_str, []).append(row["score"])

    points_raw: List[Dict[str, Any]] = []
    for date_str, scores in sorted(by_date.items(), key=lambda kv: kv[0]):
        if not scores:
            continue
        avg_score = float(sum(scores) / len(scores))
        points_raw.append(
            {
                "date": date_str,
                "score": round(avg_score, 4),
                "count": len(scores),
            }
        )

    points = _normalize_sentiment_points(points_raw)

    if not points:
        return {"symbol": symbol, "points": [], "summary": {}}

    # Summary: overall avg and last-7-days average over the last 7 distinct dates
    scores_all = [p["score"] for p in points]
    avg_all = float(sum(scores_all) / len(scores_all))
    last7 = points[-7:]
    avg_last7 = float(sum(p["score"] for p in last7) / len(last7))

    summary = {
        "avg": round(avg_all, 4),
        "last7": round(avg_last7, 4),
        "days": len(points),
        "total_articles": len(scored),
    }

    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"[FinBERT] Completed sentiment analysis for {symbol}: {len(points)} daily points, "
          f"{summary['total_articles']}/{len(items)} items scored, {elapsed:.2f}s total", flush=True)

    return {
        "symbol": symbol,
        "points": points,
        "summary": _normalize_sentiment_summary(summary),
    }


@app.post("/filings/download")
def filings_download(req: FilingDownloadRequest):
    """
    Download and cache a filing's primary document. Returns the file as a response.
    """
    try:
        path, content_type = download_filing(req.symbol, req.cik, req.accession)
        if path is None:
            raise HTTPException(status_code=404, detail="Filing not found or download failed")
        return FileResponse(
            path,
            media_type=content_type or "application/octet-stream",
            filename=path.name,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[filings/download] failed for {req.symbol} {req.accession}: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Failed to download filing")


@app.post("/insights/filings/generate")
def generate_filing_insights_api(req: FilingInsightGenerateRequest):
    symbol = req.symbol.upper()
    cik = (req.cik or _lookup_cik(symbol))
    if not cik:
        raise HTTPException(status_code=400, detail="CIK is required for filing insights generation")
    try:
        generated = generate_filing_insights_for_symbol(
            symbol,
            cik,
            forms=req.forms,
            max_filings=req.maxFilings,
        )
        return {"symbol": symbol, "generated": generated}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"[insights] filing generation failed for {symbol}: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Failed to generate filing insights")


@app.post("/insights/transcripts/generate")
def generate_transcript_insights_api(req: TranscriptInsightGenerateRequest):
    symbol = req.symbol.upper()
    try:
        generated = generate_transcript_insights_for_symbol(symbol, limit=req.limit)
        return {"symbol": symbol, "generated": generated}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"[insights] transcript generation failed for {symbol}: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Failed to generate transcript insights")


def _sanitize_float(value: Optional[float]) -> Optional[float]:
    """
    Convert NaN, Inf, and -Inf to None for JSON serialization.
    """
    if value is None:
        return None
    try:
        fval = float(value)
        if math.isnan(fval) or math.isinf(fval):
            return None
        return fval
    except (ValueError, TypeError):
        return None


def _compute_profitability_and_margins(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Compute high-level profitability ratios and margins using defeatbeta_api:
      - ROE, ROA, ROIC
      - Annual gross / operating / net / EBITDA margins
    Returns a flat dict; callers can choose to nest under 'profitability'.
    """
    symbol = symbol.upper()
    result: Dict[str, Optional[float]] = {
        "roe": None,
        "roa": None,
        "roic": None,
        "grossMargin": None,
        "operatingMargin": None,
        "netMargin": None,
        "ebitdaMargin": None,
    }

    # ROE
    try:
      roe_fn = getattr(t, "roe", None)
      if roe_fn and callable(roe_fn):
          df = roe_fn()
          if isinstance(df, pd.DataFrame) and not df.empty and "roe" in df.columns:
              val = df.iloc[-1]["roe"]
              if pd.notna(val):
                  result["roe"] = _sanitize_float(float(val))
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[profitability] {symbol}: roe() failed: {exc}", flush=True)

    # ROA
    try:
        roa_fn = getattr(t, "roa", None)
        if roa_fn and callable(roa_fn):
            df = roa_fn()
            if isinstance(df, pd.DataFrame) and not df.empty and "roa" in df.columns:
                val = df.iloc[-1]["roa"]
                if pd.notna(val):
                    result["roa"] = _sanitize_float(float(val))
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[profitability] {symbol}: roa() failed: {exc}", flush=True)

    # ROIC
    try:
        roic_fn = getattr(t, "roic", None)
        if roic_fn and callable(roic_fn):
            df = roic_fn()
            if isinstance(df, pd.DataFrame) and not df.empty and "roic" in df.columns:
                val = df.iloc[-1]["roic"]
                if pd.notna(val):
                    result["roic"] = _sanitize_float(float(val))
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[profitability] {symbol}: roic() failed: {exc}", flush=True)

    # Helper for annual margin functions
    def _latest_margin(method_name: str, column: str) -> Optional[float]:
        try:
            fn = getattr(t, method_name, None)
            if not fn or not callable(fn):
                return None
            df = fn()
            if isinstance(df, pd.DataFrame) and not df.empty and column in df.columns:
                val = df.iloc[-1][column]
                if pd.notna(val):
                    return _sanitize_float(float(val))
        except Exception as exc:
            if symbol in ["TSLA", "AAPL", "MSFT"]:
                print(f"[profitability] {symbol}: {method_name} failed: {exc}", flush=True)
        return None

    result["grossMargin"] = _latest_margin("annual_gross_margin", "gross_margin")
    result["operatingMargin"] = _latest_margin("annual_operating_margin", "operating_margin")
    result["netMargin"] = _latest_margin("annual_net_margin", "net_margin")
    result["ebitdaMargin"] = _latest_margin("annual_ebitda_margin", "ebitda_margin")

    return result


def _latest_from_df(df: Optional[pd.DataFrame], column: str) -> Optional[float]:
    if df is None:
        return None
    if not isinstance(df, pd.DataFrame):
        return None
    if df.empty:
        return None
    if column not in df.columns:
        # Debug: print available columns if column not found
        if column == "ps_ratio":
            print(f"[_latest_from_df] Column '{column}' not found. Available columns: {list(df.columns)}", flush=True)
        return None
    val = df.iloc[-1][column]
    try:
        return _sanitize_float(float(val))
    except Exception:
        return None


def _compute_profitability_and_margins(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Collect profitability and margin metrics from defeatbeta_api.
    Uses latest available quarterly values where possible.
    """
    result: Dict[str, Optional[float]] = {
        "grossMargin": None,
        "operatingMargin": None,
        "netMargin": None,
        "ebitdaMargin": None,
        "roe": None,
        "roa": None,
        "roic": None,
    }
    try:
        result["grossMargin"] = _latest_from_df(getattr(t, "quarterly_gross_margin", lambda: None)(), "gross_margin")
        result["operatingMargin"] = _latest_from_df(getattr(t, "quarterly_operating_margin", lambda: None)(), "operating_margin")
        result["netMargin"] = _latest_from_df(getattr(t, "quarterly_net_margin", lambda: None)(), "net_margin")
        result["ebitdaMargin"] = _latest_from_df(getattr(t, "quarterly_ebitda_margin", lambda: None)(), "ebitda_margin")
        result["roe"] = _latest_from_df(getattr(t, "roe", lambda: None)(), "roe")
        result["roa"] = _latest_from_df(getattr(t, "roa", lambda: None)(), "roa")
        result["roic"] = _latest_from_df(getattr(t, "roic", lambda: None)(), "roic")
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[profitability] {symbol}: error computing profitability/margins: {exc}", flush=True)
    return result


def _compute_financial_health(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Placeholder for leverage/liquidity metrics. defeatbeta_api does not expose
    ready-made ratios, so return None for now to avoid incorrect calculations.
    """
    return {
        "debtToEquity": None,
        "interestCoverage": None,
        "currentRatio": None,
        "quickRatio": None,
        "ocfToDebt": None,
    }


def _compute_cash_flow_health(symbol: str, t: Ticker, market_cap: Optional[float]) -> Dict[str, Optional[float]]:
    """
    Cash flow health metrics. Uses FCF margin where available. FCF yield requires
    reliable FCF TTM; if absent, returns None.
    """
    result: Dict[str, Optional[float]] = {
        "fcfTTM": None,
        "fcfMargin": None,
        "fcfYield": None,
        "ocfTTM": None,
    }
    try:
        result["fcfMargin"] = _latest_from_df(getattr(t, "quarterly_fcf_margin", lambda: None)(), "fcf_margin")
        # Without a direct FCF TTM value exposed, leave fcfTTM/ocfTTM/ocfToDebt as None to avoid bad math.
        if market_cap and result["fcfTTM"]:
            try:
                result["fcfYield"] = _sanitize_float(float(result["fcfTTM"]) / float(market_cap))
            except Exception:
                result["fcfYield"] = None
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[cash_flow] {symbol}: error computing cash flow metrics: {exc}", flush=True)
    return result


def _compute_growth_metrics(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Growth metrics using YoY growth helpers where available.
    """
    result: Dict[str, Optional[float]] = {
        "revenueGrowthTTM": None,
        "ebitGrowthTTM": None,
        "epsGrowthTTM": None,
        "fcfGrowthTTM": None,
    }
    try:
        result["revenueGrowthTTM"] = _latest_from_df(getattr(t, "quarterly_revenue_yoy_growth", lambda: None)(), "yoy_growth")
        result["ebitGrowthTTM"] = _latest_from_df(getattr(t, "quarterly_operating_income_yoy_growth", lambda: None)(), "yoy_growth")
        result["epsGrowthTTM"] = _latest_from_df(getattr(t, "quarterly_eps_yoy_growth", lambda: None)(), "yoy_growth")
        result["fcfGrowthTTM"] = _latest_from_df(getattr(t, "quarterly_fcf_yoy_growth", lambda: None)(), "yoy_growth")
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[growth] {symbol}: error computing growth metrics: {exc}", flush=True)
    return result


def _compute_enterprise_value(symbol: str, market_cap: Optional[float]) -> Optional[float]:
    """
    Calculate Enterprise Value (EV) = Market Cap + Total Debt - Cash and Cash Equivalents.
    Returns None if any component is missing.
    """
    symbol = symbol.upper()
    if market_cap is None:
        return None
    
    t = _get_ticker(symbol)
    
    try:
        # Get balance sheet (returns Statement object, need to call .df())
        balance_sheet_stmt = t.annual_balance_sheet()
        if balance_sheet_stmt is None:
            return None
        
        balance_sheet = balance_sheet_stmt.df()
        if balance_sheet is None or balance_sheet.empty:
            return None
        
        # Find the latest date column (prefer TTM, then most recent date)
        date_cols = [col for col in balance_sheet.columns if col != 'Breakdown']
        if not date_cols:
            return None
        
        # Prefer TTM, otherwise use the first (most recent) date column
        latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
        
        # Find total debt row
        total_debt = None
        debt_keywords = ['total debt', 'debt', 'total liabilities']
        for idx, row in balance_sheet.iterrows():
            breakdown = str(row['Breakdown']).lower()
            if any(keyword in breakdown for keyword in debt_keywords) and 'total' in breakdown:
                val = row[latest_date_col]
                if pd.notna(val) and val != '*':
                    try:
                        total_debt = float(val)
                        break
                    except (ValueError, TypeError):
                        continue
        
        # Find cash and cash equivalents row
        cash = None
        cash_keywords = ['cash and cash equivalents', 'cash, cash equivalents', 'cash & cash equivalents']
        for idx, row in balance_sheet.iterrows():
            breakdown = str(row['Breakdown']).lower()
            if any(keyword in breakdown for keyword in cash_keywords):
                val = row[latest_date_col]
                if pd.notna(val) and val != '*':
                    try:
                        cash = float(val)
                        break
                    except (ValueError, TypeError):
                        continue
        
        # Calculate EV
        if total_debt is not None and cash is not None:
            ev = market_cap + total_debt - cash
            return ev
        elif total_debt is not None:
            # If cash is missing, use market cap + debt (conservative estimate)
            ev = market_cap + total_debt
            return ev
        
        return None
    except Exception:
        return None


@lru_cache(maxsize=2048)
def _get_enterprise_value(symbol: str, market_cap: Optional[float]) -> Optional[float]:
    """
    Cached wrapper around EV calculation. Market cap is included in the cache key
    so callers can pass an updated value without colliding with prior results.
    """
    return _compute_enterprise_value(symbol, market_cap)


def _compute_ebit(symbol: str) -> Optional[float]:
    """
    Get EBIT (Earnings Before Interest and Taxes) from income statement.
    Returns the latest TTM or annual EBIT value.
    """
    symbol = symbol.upper()
    t = _get_ticker(symbol)
    
    try:
        # Try quarterly income statement first (has TTM)
        income_stmt_stmt = t.quarterly_income_statement()
        if income_stmt_stmt is not None:
            income_stmt = income_stmt_stmt.df()
            if income_stmt is not None and not income_stmt.empty:
                # Find the latest date column (prefer TTM)
                date_cols = [col for col in income_stmt.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
                    
                    # Look for EBIT/Operating Income row
                    ebit_keywords = ['operating income', 'ebit', 'operating earnings', 'income from operations']
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if any(keyword in breakdown for keyword in ebit_keywords):
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    ebit = float(val)
                                    return ebit
                                except (ValueError, TypeError):
                                    continue
        
        # Fallback to annual income statement
        income_stmt_stmt = t.annual_income_statement()
        if income_stmt_stmt is not None:
            income_stmt = income_stmt_stmt.df()
            if income_stmt is not None and not income_stmt.empty:
                date_cols = [col for col in income_stmt.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = date_cols[0]  # Most recent annual
                    ebit_keywords = ['operating income', 'ebit', 'operating earnings', 'income from operations']
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if any(keyword in breakdown for keyword in ebit_keywords):
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    ebit = float(val)
                                    return ebit
                                except (ValueError, TypeError):
                                    continue
        
        return None
    except Exception:
        return None


@lru_cache(maxsize=2048)
def _get_ebit(symbol: str) -> Optional[float]:
    return _compute_ebit(symbol)


def _compute_ebitda(symbol: str) -> Optional[float]:
    """
    Get EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization).
    Tries to get directly, or calculates from EBIT + Depreciation + Amortization.
    """
    symbol = symbol.upper()
    t = _get_ticker(symbol)
    
    try:
        # Try quarterly income statement first (has TTM)
        income_stmt_stmt = t.quarterly_income_statement()
        if income_stmt_stmt is not None:
            income_stmt = income_stmt_stmt.df()
            if income_stmt is not None and not income_stmt.empty:
                date_cols = [col for col in income_stmt.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
                    
                    # Look for EBITDA directly
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if 'ebitda' in breakdown:
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    ebitda = float(val)
                                    return ebitda
                                except (ValueError, TypeError):
                                    pass
                    
                    # Calculate EBITDA = EBIT + Depreciation + Amortization
                    ebit = None
                    depreciation = None
                    amortization = None
                    
                    # Get EBIT
                    ebit_keywords = ['operating income', 'ebit', 'operating earnings', 'income from operations']
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if any(keyword in breakdown for keyword in ebit_keywords):
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    ebit = float(val)
                                    break
                                except (ValueError, TypeError):
                                    continue
                    
                    # Get Depreciation and Amortization
                    da_keywords = ['depreciation and amortization', 'depreciation & amortization', 'd&a']
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if any(keyword in breakdown for keyword in da_keywords):
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    depreciation = float(val)
                                    break
                                except (ValueError, TypeError):
                                    continue
                    
                    # If separate, get depreciation
                    if depreciation is None:
                        for idx, row in income_stmt.iterrows():
                            breakdown = str(row['Breakdown']).lower()
                            if 'depreciation' in breakdown and 'amortization' not in breakdown:
                                val = row[latest_date_col]
                                if pd.notna(val) and val != '*':
                                    try:
                                        depreciation = float(val)
                                        break
                                    except (ValueError, TypeError):
                                        continue
                    
                    # If separate, get amortization
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if 'amortization' in breakdown and 'depreciation' not in breakdown:
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    amortization = float(val)
                                    break
                                except (ValueError, TypeError):
                                    continue
                    
                    # Calculate EBITDA
                    if ebit is not None:
                        da = (depreciation or 0) + (amortization or 0)
                        ebitda = ebit + da
                        return ebitda
        
        # Fallback to annual income statement
        income_stmt_stmt = t.annual_income_statement()
        if income_stmt_stmt is not None:
            income_stmt = income_stmt_stmt.df()
            if income_stmt is not None and not income_stmt.empty:
                date_cols = [col for col in income_stmt.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = date_cols[0]
                    for idx, row in income_stmt.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if 'ebitda' in breakdown:
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    ebitda = float(val)
                                    return ebitda
                                except (ValueError, TypeError):
                                    pass
        
        return None
    except Exception:
        return None


@lru_cache(maxsize=2048)
def _get_ebitda(symbol: str) -> Optional[float]:
    return _compute_ebitda(symbol)


def _compute_financial_health(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Compute financial health metrics:
      - Debt-to-equity (from balance sheet)
      - Interest coverage (EBIT / Interest Expense)
      - Current ratio (Current Assets / Current Liabilities)
      - Quick ratio (Quick Assets / Current Liabilities)
      - OCF/Debt (Operating Cash Flow / Total Debt)
    """
    symbol = symbol.upper()
    result: Dict[str, Optional[float]] = {
        "debtToEquity": None,
        "interestCoverage": None,
        "currentRatio": None,
        "quickRatio": None,
        "ocfToDebt": None,
    }

    try:
        # Get balance sheet for debt/equity and liquidity ratios
        balance_sheet_stmt = t.annual_balance_sheet()
        if balance_sheet_stmt is not None:
            balance_sheet = balance_sheet_stmt.df()
            if balance_sheet is not None and not balance_sheet.empty:
                date_cols = [col for col in balance_sheet.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]

                    # Debt-to-equity: Total Debt / Total Equity
                    total_debt = None
                    total_equity = None
                    for idx, row in balance_sheet.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        val = row[latest_date_col]
                        if pd.notna(val) and val != '*':
                            try:
                                fval = float(val)
                                if 'total debt' in breakdown or ('debt' in breakdown and 'total' in breakdown):
                                    total_debt = fval
                                elif 'total equity' in breakdown or ('equity' in breakdown and 'total' in breakdown):
                                    total_equity = fval
                            except (ValueError, TypeError):
                                continue

                    if total_debt is not None and total_equity is not None and total_equity != 0:
                        result["debtToEquity"] = _sanitize_float(total_debt / total_equity)

                    # Current ratio: Current Assets / Current Liabilities
                    current_assets = None
                    current_liabilities = None
                    for idx, row in balance_sheet.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        val = row[latest_date_col]
                        if pd.notna(val) and val != '*':
                            try:
                                fval = float(val)
                                if 'current assets' in breakdown:
                                    current_assets = fval
                                elif 'current liabilities' in breakdown:
                                    current_liabilities = fval
                            except (ValueError, TypeError):
                                continue

                    if current_assets is not None and current_liabilities is not None and current_liabilities != 0:
                        result["currentRatio"] = _sanitize_float(current_assets / current_liabilities)

                    # Quick ratio: (Current Assets - Inventory) / Current Liabilities
                    inventory = None
                    for idx, row in balance_sheet.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if 'inventory' in breakdown:
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    inventory = float(val)
                                    break
                                except (ValueError, TypeError):
                                    continue

                    if current_assets is not None and current_liabilities is not None and current_liabilities != 0:
                        quick_assets = current_assets - (inventory or 0)
                        result["quickRatio"] = _sanitize_float(quick_assets / current_liabilities)

    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[financial_health] {symbol}: balance sheet processing failed: {exc}", flush=True)

    try:
        # Interest coverage: EBIT / Interest Expense
        ebit = _get_ebit(symbol)
        if ebit is not None:
            income_stmt_stmt = t.quarterly_income_statement()
            if income_stmt_stmt is not None:
                income_stmt = income_stmt_stmt.df()
                if income_stmt is not None and not income_stmt.empty:
                    date_cols = [col for col in income_stmt.columns if col != 'Breakdown']
                    if date_cols:
                        latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
                        interest_expense = None
                        for idx, row in income_stmt.iterrows():
                            breakdown = str(row['Breakdown']).lower()
                            if 'interest expense' in breakdown or 'interest' in breakdown and 'expense' in breakdown:
                                val = row[latest_date_col]
                                if pd.notna(val) and val != '*':
                                    try:
                                        interest_expense = abs(float(val))  # Interest expense is usually negative
                                        break
                                    except (ValueError, TypeError):
                                        continue

                        if interest_expense is not None and interest_expense != 0:
                            result["interestCoverage"] = _sanitize_float(ebit / interest_expense)
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[financial_health] {symbol}: interest coverage failed: {exc}", flush=True)

    try:
        # OCF/Debt: Operating Cash Flow / Total Debt
        cash_flow_stmt = t.quarterly_cash_flow()
        if cash_flow_stmt is not None:
            cash_flow = cash_flow_stmt.df()
            if cash_flow is not None and not cash_flow.empty:
                date_cols = [col for col in cash_flow.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
                    operating_cash_flow = None
                    for idx, row in cash_flow.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        if 'operating cash flow' in breakdown or 'cash from operations' in breakdown:
                            val = row[latest_date_col]
                            if pd.notna(val) and val != '*':
                                try:
                                    operating_cash_flow = float(val)
                                    break
                                except (ValueError, TypeError):
                                    continue

                    # Get total debt from balance sheet
                    balance_sheet_stmt = t.annual_balance_sheet()
                    if balance_sheet_stmt is not None:
                        balance_sheet = balance_sheet_stmt.df()
                        if balance_sheet is not None and not balance_sheet.empty:
                            date_cols = [col for col in balance_sheet.columns if col != 'Breakdown']
                            if date_cols:
                                latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]
                                total_debt = None
                                for idx, row in balance_sheet.iterrows():
                                    breakdown = str(row['Breakdown']).lower()
                                    if 'total debt' in breakdown or ('debt' in breakdown and 'total' in breakdown):
                                        val = row[latest_date_col]
                                        if pd.notna(val) and val != '*':
                                            try:
                                                total_debt = float(val)
                                                break
                                            except (ValueError, TypeError):
                                                continue

                                if operating_cash_flow is not None and total_debt is not None and total_debt != 0:
                                    result["ocfToDebt"] = _sanitize_float(operating_cash_flow / total_debt)
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[financial_health] {symbol}: OCF/Debt failed: {exc}", flush=True)

    return result


def _compute_cash_flow_health(symbol: str, t: Ticker, market_cap: Optional[float]) -> Dict[str, Optional[float]]:
    """
    Compute cash flow health metrics:
      - FCF TTM (Free Cash Flow Trailing Twelve Months)
      - FCF Margin (FCF / Revenue)
      - FCF Yield (FCF / Market Cap)
      - OCF TTM (Operating Cash Flow TTM)
    """
    symbol = symbol.upper()
    result: Dict[str, Optional[float]] = {
        "fcfTTM": None,
        "fcfMargin": None,
        "fcfYield": None,
        "ocfTTM": None,
    }

    try:
        # Get cash flow statement
        cash_flow_stmt = t.quarterly_cash_flow()
        if cash_flow_stmt is not None:
            cash_flow = cash_flow_stmt.df()
            if cash_flow is not None and not cash_flow.empty:
                date_cols = [col for col in cash_flow.columns if col != 'Breakdown']
                if date_cols:
                    latest_date_col = 'TTM' if 'TTM' in date_cols else date_cols[0]

                    # FCF TTM
                    fcf = None
                    ocf = None
                    for idx, row in cash_flow.iterrows():
                        breakdown = str(row['Breakdown']).lower()
                        val = row[latest_date_col]
                        if pd.notna(val) and val != '*':
                            try:
                                fval = float(val)
                                if 'free cash flow' in breakdown:
                                    fcf = fval
                                elif 'operating cash flow' in breakdown or 'cash from operations' in breakdown:
                                    ocf = fval
                            except (ValueError, TypeError):
                                continue

                    if fcf is not None:
                        result["fcfTTM"] = _sanitize_float(fcf)

                    if ocf is not None:
                        result["ocfTTM"] = _sanitize_float(ocf)

                    # FCF Margin = FCF / Revenue
                    if fcf is not None:
                        ttm_revenue_df = getattr(t, "ttm_revenue", lambda: None)()
                        if ttm_revenue_df is not None and not ttm_revenue_df.empty:
                            if 'ttm_total_revenue_usd' in ttm_revenue_df.columns:
                                ttm_revenue = ttm_revenue_df.iloc[-1]['ttm_total_revenue_usd']
                                if pd.notna(ttm_revenue) and ttm_revenue != 0:
                                    result["fcfMargin"] = _sanitize_float(fcf / float(ttm_revenue))

                    # FCF Yield = FCF / Market Cap
                    if fcf is not None and market_cap is not None and market_cap != 0:
                        result["fcfYield"] = _sanitize_float(fcf / market_cap)

    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[cash_flow] {symbol}: failed: {exc}", flush=True)

    return result


def _compute_growth_metrics(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Compute growth metrics (YoY):
      - Revenue growth
      - EBIT growth (operating income growth)
      - EPS growth
      - FCF growth
    Uses quarterly YoY growth methods from defeatbeta_api.
    """
    symbol = symbol.upper()
    result: Dict[str, Optional[float]] = {
        "revenueGrowthTTM": None,
        "ebitGrowthTTM": None,
        "epsGrowthTTM": None,
        "fcfGrowthTTM": None,
    }

    def _latest_growth(method_name: str, column: str) -> Optional[float]:
        try:
            fn = getattr(t, method_name, None)
            if not fn or not callable(fn):
                return None
            df = fn()
            if isinstance(df, pd.DataFrame) and not df.empty:
                # Look for the growth column (could be named differently)
                if column in df.columns:
                    val = df.iloc[-1][column]
                    if pd.notna(val):
                        return _sanitize_float(float(val))
                # Try to find any numeric column that looks like growth
                for col in df.columns:
                    if 'growth' in col.lower() or 'yoy' in col.lower():
                        val = df.iloc[-1][col]
                        if pd.notna(val):
                            return _sanitize_float(float(val))
        except Exception as exc:
            if symbol in ["TSLA", "AAPL", "MSFT"]:
                print(f"[growth] {symbol}: {method_name} failed: {exc}", flush=True)
        return None

    # Revenue growth
    result["revenueGrowthTTM"] = _latest_growth("quarterly_revenue_yoy_growth", "revenue_yoy_growth")

    # EBIT growth (operating income growth)
    result["ebitGrowthTTM"] = _latest_growth("quarterly_operating_income_yoy_growth", "operating_income_yoy_growth")

    # EPS growth
    result["epsGrowthTTM"] = _latest_growth("quarterly_ttm_eps_yoy_growth", "ttm_eps_yoy_growth")

    # FCF growth
    result["fcfGrowthTTM"] = _latest_growth("quarterly_fcf_yoy_growth", "fcf_yoy_growth")

    return result


def _get_shares_outstanding(symbol: str, t: Ticker) -> Optional[float]:
    """
    Get current shares outstanding from defeatbeta_api.
    Uses the shares() method which returns a DataFrame with shares_outstanding column.
    """
    symbol = symbol.upper()
    try:
        shares_fn = getattr(t, "shares", None)
        if not shares_fn or not callable(shares_fn):
            return None
        
        shares_df = shares_fn()
        if shares_df is None or shares_df.empty:
            return None
        
        # Look for shares_outstanding column
        if "shares_outstanding" in shares_df.columns:
            # Get the most recent value (last row)
            latest_shares = shares_df.iloc[-1]["shares_outstanding"]
            if pd.notna(latest_shares):
                return _sanitize_float(float(latest_shares))
        
        # Fallback: try other column names
        for col in shares_df.columns:
            if "shares" in col.lower() and "outstanding" in col.lower():
                latest_shares = shares_df.iloc[-1][col]
                if pd.notna(latest_shares):
                    return _sanitize_float(float(latest_shares))
        
        return None
    except Exception:
        # Silently fail - shares data may not be available for all stocks
        return None


def _compute_dividend_yield(symbol: str, t: Ticker, market_cap: Optional[float]) -> Optional[float]:
    """
    Calculate dividend yield from dividends() and current price.
    Dividend Yield = (Annual Dividends / Market Cap) or (Dividend per Share / Price per Share)
    """
    symbol = symbol.upper()
    try:
        
        
        dividends_fn = getattr(t, "dividends", None)
        if not dividends_fn or not callable(dividends_fn):
            return None
        
        dividends_df = dividends_fn()
        
        if dividends_df is None:
            return None
        
        if not isinstance(dividends_df, pd.DataFrame):
            return None
        
        if dividends_df.empty:
            return None
        
        
        # Get current price
        price_df = t.price()
        if price_df is None or price_df.empty or "close" not in price_df.columns:
            return None
        
        current_price = float(price_df.iloc[-1]["close"])
        if current_price <= 0:
            return None
        
        
        # Method 1: Try to get dividend per share and calculate yield
        # Look for columns like 'dividend', 'dividend_per_share', 'amount', etc.
        dividend_cols = [col for col in dividends_df.columns if any(term in col.lower() for term in ['dividend', 'amount', 'payment'])]
        
        if not dividend_cols:
            # Try to use any numeric column
            numeric_cols = dividends_df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                dividend_cols = numeric_cols[:1]  # Use first numeric column
        
        if dividend_cols:
            # Get last 4 quarters (TTM) of dividends
            # Sort by date if available
            date_cols = [col for col in dividends_df.columns if any(term in col.lower() for term in ['date', 'ex_date', 'payment_date', 'report_date'])]
            
            if date_cols:
                # Sort by date descending
                try:
                    dividends_df = dividends_df.sort_values(date_cols[0], ascending=False)
                except Exception as e:
                    print(f"[dividend] {symbol}: Failed to sort by date: {e}", flush=True)
            
            # Sum last 4 dividend payments (assuming quarterly)
            ttm_dividend = 0.0
            dividend_col = dividend_cols[0]
            
            rows_processed = 0
            for idx, row in dividends_df.head(4).iterrows():
                val = row[dividend_col]
                if pd.notna(val) and val != '*':
                    try:
                        dividend_val = float(val)
                        ttm_dividend += dividend_val
                        rows_processed += 1
                    except (ValueError, TypeError):
                        continue
            
            
            if ttm_dividend > 0:
                # Calculate yield: (Annual Dividend per Share) / Current Price
                dividend_yield = _sanitize_float(ttm_dividend / current_price)
                return dividend_yield
            else:
                print(f"[dividend] {symbol}: TTM dividend is 0 or negative, cannot calculate yield", flush=True)
        else:
            print(f"[dividend] {symbol}: No suitable dividend columns found after fallback", flush=True)
        
        # Method 2: If market cap is available, try to calculate from total dividends
        if market_cap is not None and market_cap > 0:
            # Sum all dividends in the last year
            total_dividends = 0.0
            for col in dividend_cols if dividend_cols else dividends_df.select_dtypes(include=[np.number]).columns:
                for idx, row in dividends_df.head(4).iterrows():
                    val = row[col]
                    if pd.notna(val) and val != '*':
                        try:
                            total_dividends += float(val)
                        except (ValueError, TypeError):
                            continue
            
            if total_dividends > 0:
                pass
        
        
        return None
    except Exception:
        import traceback
        traceback.print_exc()
        return None


def _compute_valuation_extras(symbol: str, t: Ticker) -> Dict[str, Optional[float]]:
    """
    Compute additional valuation metrics:
      - Forward P/E (if available from earnings forecast)
      - PEG ratio (if available from defeatbeta_api)
    """
    symbol = symbol.upper()
    result: Dict[str, Optional[float]] = {
        "forwardPE": None,
        "pegRatio": None,
    }

    # PEG ratio
    try:
        peg_fn = getattr(t, "peg_ratio", None)
        if peg_fn and callable(peg_fn):
            df = peg_fn()
            if isinstance(df, pd.DataFrame) and not df.empty:
                # Look for peg_ratio column or similar
                for col in df.columns:
                    if 'peg' in col.lower():
                        val = df.iloc[-1][col]
                        if pd.notna(val):
                            result["pegRatio"] = _sanitize_float(float(val))
                            break
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[valuation_extras] {symbol}: peg_ratio failed: {exc}", flush=True)

    # Forward P/E: Calculate from earnings forecast / current price
    try:
        earnings_forecast_df = getattr(t, "earnings_forecast", lambda: None)()
        if earnings_forecast_df is not None and not earnings_forecast_df.empty:
            # Get forward EPS estimate (next year)
            # This is a simplified approach - actual implementation may vary
            price_df = t.price()
            if price_df is not None and not price_df.empty and "close" in price_df.columns:
                current_price = float(price_df.iloc[-1]["close"])
                # Look for forward EPS in earnings forecast
                # Note: This is a placeholder - actual column names may differ
                for col in earnings_forecast_df.columns:
                    if 'eps' in col.lower() and ('forward' in col.lower() or 'next' in col.lower() or 'estimate' in col.lower()):
                        forward_eps = earnings_forecast_df.iloc[-1][col]
                        if pd.notna(forward_eps) and forward_eps != 0:
                            result["forwardPE"] = _sanitize_float(current_price / float(forward_eps))
                            break
    except Exception as exc:
        if symbol in ["TSLA", "AAPL", "MSFT"]:
            print(f"[valuation_extras] {symbol}: forward PE failed: {exc}", flush=True)

    return result


@lru_cache(maxsize=1024)
def _calculate_symbol_metrics(symbol: str) -> Dict[str, Optional[float]]:
    """
    Compute valuation metrics for a single symbol and cache the result.
    This avoids recomputing expensive DuckDB queries across requests.
    """
    symbol = symbol.upper()
    t = _get_ticker(symbol)
    market_cap = _get_market_cap(symbol)

    pe_df = getattr(t, "ttm_pe", lambda: None)()
    ps_df = getattr(t, "ps_ratio", lambda: None)()
    pb_df = getattr(t, "pb_ratio", lambda: None)()

    # Calculate EV/EBIT and EV/EBITDA manually (methods don't exist in defeatbeta_api)
    enterprise_value = _get_enterprise_value(symbol, market_cap)
    ebit = _get_ebit(symbol)
    ebitda = _get_ebitda(symbol)

    ev_ebit_ratio = None
    if enterprise_value is not None and ebit is not None and ebit != 0:
        ev_ebit_ratio = _sanitize_float(enterprise_value / ebit)

    ev_ebitda_ratio = None
    if enterprise_value is not None and ebitda is not None and ebitda != 0:
        ev_ebitda_ratio = _sanitize_float(enterprise_value / ebitda)

    # EV/Sales (Enterprise Value to Sales)
    ev_sales_ratio = None
    if enterprise_value is not None:
        # Get TTM revenue
        ttm_revenue_df = getattr(t, "ttm_revenue", lambda: None)()
        if ttm_revenue_df is not None and not ttm_revenue_df.empty:
            if 'ttm_total_revenue_usd' in ttm_revenue_df.columns:
                ttm_revenue = ttm_revenue_df.iloc[-1]['ttm_total_revenue_usd']
                if pd.notna(ttm_revenue) and ttm_revenue != 0:
                    ev_sales_ratio = _sanitize_float(enterprise_value / float(ttm_revenue))

    profitability = _compute_profitability_and_margins(symbol, t)
    financial_health = _compute_financial_health(symbol, t)
    cash_flow = _compute_cash_flow_health(symbol, t, market_cap)
    growth = _compute_growth_metrics(symbol, t)
    valuation_extras = _compute_valuation_extras(symbol, t)
    
    # Calculate dividend yield
    dividend_yield = _compute_dividend_yield(symbol, t, market_cap)
    
    # Get shares outstanding
    shares_outstanding = _get_shares_outstanding(symbol, t)

    return {
        "symbol": symbol,
        "marketCap": _sanitize_float(market_cap),
        "sharesOutstanding": shares_outstanding,
        "peRatioTTM": _latest_from_df(pe_df, "ttm_pe"),
        "priceToSalesRatioTTM": _latest_from_df(ps_df, "ps_ratio"),
        "priceToBookRatioTTM": _latest_from_df(pb_df, "pb_ratio"),
        "enterpriseValueOverEBITDATTM": ev_ebitda_ratio,
        "enterpriseValueOverEBITTTM": ev_ebit_ratio,
        "enterpriseValueToSalesTTM": ev_sales_ratio,
        "dividendYieldTTM": dividend_yield,
        "revenueGrowthTTM": growth.get("revenueGrowthTTM"),  # Use from growth metrics
        "profitability": profitability,
        "financialHealth": financial_health,
        "cashFlow": cash_flow,
        "growth": growth,
        "valuationExtras": valuation_extras,
    }


@app.post("/metrics")
def metrics(payload: SymbolsPayload):
    """
    Fetch metrics for multiple symbols in parallel for better performance.
    Uses ThreadPoolExecutor to process symbols concurrently (I/O-bound DuckDB queries).
    """
    symbols = payload.symbols
    if not symbols:
        return {"metrics": []}
    
    def process_symbol_metrics(symbol: str) -> Dict[str, Any]:
        """Process a single symbol's metrics (used for parallel processing)."""
        import time as _time
        start = _time.time()
        try:
            print(f"[metrics] Starting {symbol}...")
            result = _calculate_symbol_metrics(symbol)
            elapsed = _time.time() - start
            print(f"[metrics] Finished {symbol} in {elapsed:.1f}s")
            return result
        except Exception as exc:
            elapsed = _time.time() - start
            print(f"[metrics] ERROR {symbol} after {elapsed:.1f}s: {exc}")
            import traceback
            traceback.print_exc()
            return {
                "symbol": symbol.upper(),
                "marketCap": None,
                "sharesOutstanding": None,
                "ttmEps": None,
                "peRatioTTM": None,
                "priceToSalesRatioTTM": None,
                "priceToBookRatioTTM": None,
                "enterpriseValueOverEBITTTM": None,
                "enterpriseValueOverEBITDATTM": None,
                "enterpriseValueToSalesTTM": None,
                "dividendYieldTTM": None,
                "revenueGrowthTTM": None,
                "profitability": {},
                "financialHealth": {},
                "cashFlow": {},
                "growth": {},
                "valuationExtras": {},
            }
    
    # Use parallel processing for batches of 5+ symbols, sequential for smaller batches
    # Reduced to 8 workers to avoid DuckDB contention with local parquet files
    if len(symbols) >= 5:
        max_workers = min(len(symbols), 8)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            data = list(executor.map(process_symbol_metrics, symbols))
    else:
        # Sequential for small batches (overhead not worth it)
        data = [process_symbol_metrics(symbol) for symbol in symbols]
    
    return {"metrics": data}


@app.post("/prices")
def prices(req: PriceRequest):
    try:
        t = _get_ticker(req.symbol)
        df = t.price()
        if req.days and req.days > 0:
            df = df.tail(req.days)
        closes = df["close"].tolist()
        return {"symbol": req.symbol.upper(), "closes": closes}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch prices: {exc}")


@app.post("/prices/batch")
def prices_batch(payload: SymbolsPayload, days: int = 180):
    """
    Batch endpoint to fetch prices for multiple symbols at once.
    Uses multithreading to fetch prices in parallel for better performance.
    """
    def fetch_single_price(symbol: str) -> Dict[str, Any]:
        symbol_upper = symbol.upper()
        print(f"[prices/batch] Fetching {symbol_upper} (days={days})", flush=True)
        try:
            t = _get_ticker(symbol_upper)
            print(f"[prices/batch] Ticker created for {symbol_upper}", flush=True)
            df = t.price()
            print(f"[prices/batch] {symbol_upper}: price() returned df type={type(df)}, empty={df.empty if hasattr(df, 'empty') else 'N/A'}, shape={df.shape if hasattr(df, 'shape') else 'N/A'}", flush=True)
            
            if df is None:
                print(f"[prices/batch] {symbol_upper}: price() returned None", flush=True)
                return {"symbol": symbol_upper, "closes": []}
            
            if not hasattr(df, 'empty') or df.empty:
                print(f"[prices/batch] {symbol_upper}: DataFrame is empty or has no empty attr", flush=True)
                return {"symbol": symbol_upper, "closes": []}
            
            if "close" not in df.columns:
                print(f"[prices/batch] {symbol_upper}: No 'close' column. Available columns: {list(df.columns)[:10]}", flush=True)
                return {"symbol": symbol_upper, "closes": []}
            
            if days and days > 0:
                df = df.tail(days)
                print(f"[prices/batch] {symbol_upper}: After tail({days}), shape={df.shape}", flush=True)
            
            closes = df["close"].tolist()
            closes_count = len(closes)
            closes_non_null = sum(1 for c in closes if c is not None and not (isinstance(c, float) and (pd.isna(c) or pd.isnull(c))))
            print(f"[prices/batch] {symbol_upper}: Success! closes count={closes_count}, non-null={closes_non_null}, first={closes[0] if closes else 'N/A'}, last={closes[-1] if closes else 'N/A'}", flush=True)
            return {"symbol": symbol_upper, "closes": closes}
        except Exception as exc:
            print(f"[prices/batch] Exception for {symbol_upper}: {type(exc).__name__}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            return {"symbol": symbol_upper, "closes": []}
    
    # Use ThreadPoolExecutor to fetch prices in parallel
    symbols = payload.symbols
    print(f"[prices/batch] Starting batch fetch for {len(symbols)} symbols: {symbols[:5]}{'...' if len(symbols) > 5 else ''}", flush=True)
    max_workers = min(len(symbols), 20)  # Cap at 20 workers to avoid overwhelming the system
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(fetch_single_price, symbols))
    
    print(f"[prices/batch] Batch complete. Results: {[(r['symbol'], len(r.get('closes', []))) for r in results]}", flush=True)
    return {"prices": results}


def _warm_caches():
    """
    Fire-and-forget cache warmup to reduce first-request latency.
    Pulls a small set of symbols to trigger DuckDB/httpfs, NLTK download, and
    the lru_cache entries for key helpers.
    """
    sample_symbols = ["AAPL", "MSFT", "SPY"]
    for symbol in sample_symbols:
        try:
            # Kick off expensive primitives
            _get_info(symbol)
            metrics = _calculate_symbol_metrics(symbol)
        except Exception:
            pass

@app.post("/earnings/calendar")
def earnings_calendar(req: EarningsCalendarRequest):
    """
    Get earnings calendar (upcoming and recent earnings dates).
    Returns dates, estimates, actuals, and beat/miss status.
    """
    symbol = req.symbol.upper()
    try:
        t = _get_ticker(symbol)
        calendar_fn = getattr(t, "calendar", None)
        if not calendar_fn or not callable(calendar_fn):
            return {"symbol": symbol, "events": []}
        
        calendar_df = calendar_fn()
        if calendar_df is None or calendar_df.empty:
            return {"symbol": symbol, "events": []}
        
        # Process calendar data
        events = []
        for _, row in calendar_df.iterrows():
            # Try to find date column (could be 'date', 'report_date', 'earnings_date', etc.)
            date_val = None
            for date_col in ['date', 'report_date', 'earnings_date', 'fiscal_date']:
                if date_col in row.index:
                    date_val = row[date_col]
                    if pd.notna(date_val):
                        # Convert to ISO string if it's a datetime
                        if isinstance(date_val, pd.Timestamp):
                            date_val = date_val.isoformat()
                        elif isinstance(date_val, datetime):
                            date_val = date_val.isoformat()
                        break
            
            # Try to find EPS estimate
            estimate = None
            for est_col in ['eps_estimate', 'estimate', 'estimated_eps', 'consensus_eps']:
                if est_col in row.index:
                    val = row[est_col]
                    if pd.notna(val):
                        estimate = _sanitize_float(float(val))
                        break
            
            # Try to find EPS actual
            actual = None
            for act_col in ['eps_actual', 'actual', 'actual_eps', 'reported_eps']:
                if act_col in row.index:
                    val = row[act_col]
                    if pd.notna(val):
                        actual = _sanitize_float(float(val))
                        break
            
            # Calculate surprise if we have both estimate and actual
            surprise = None
            surprise_percent = None
            if estimate is not None and actual is not None and estimate != 0:
                surprise = _sanitize_float(actual - estimate)
                surprise_percent = _sanitize_float((surprise / abs(estimate)) * 100)
            
            # Convert date to string properly
            date_str = None
            if date_val:
                if isinstance(date_val, pd.Timestamp):
                    date_str = date_val.isoformat()
                elif isinstance(date_val, datetime):
                    date_str = date_val.isoformat()
                elif hasattr(date_val, 'isoformat'):
                    date_str = date_val.isoformat()
                else:
                    date_str = str(date_val)
            
            events.append({
                "date": date_str,
                "estimate": estimate,
                "actual": actual,
                "surprise": surprise,
                "surprisePercent": surprise_percent,
            })
        
        # Sort by date descending (most recent first)
        events.sort(key=lambda x: x.get("date") or "", reverse=True)
        
        return {"symbol": symbol, "events": events}
    except Exception as exc:
        print(f"[earnings/calendar] failed for {symbol}: {exc}", flush=True)
        import traceback
        traceback.print_exc()
        return {"symbol": symbol, "events": []}


@app.post("/earnings/history")
def earnings_history(payload: SymbolsPayload):
    """
    Get historical EPS data including TTM EPS.
    Returns quarterly/historical EPS and current TTM EPS.
    """
    results = []
    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)
            
            # Get historical earnings
            earnings_fn = getattr(t, "earnings", None)
            earnings_df = None
            if earnings_fn and callable(earnings_fn):
                earnings_df = earnings_fn()
            
            # Get TTM EPS
            ttm_eps_fn = getattr(t, "ttm_eps", None)
            ttm_eps_df = None
            ttm_eps_value = None
            if ttm_eps_fn and callable(ttm_eps_fn):
                ttm_eps_df = ttm_eps_fn()
                if ttm_eps_df is not None and not ttm_eps_df.empty:
                    # Look for ttm_eps column
                    for col in ['ttm_eps', 'eps', 'trailing_eps']:
                        if col in ttm_eps_df.columns:
                            val = ttm_eps_df.iloc[-1][col]
                            if pd.notna(val):
                                ttm_eps_value = _sanitize_float(float(val))
                                break
            
            # Process historical earnings
            history = []
            if earnings_df is not None and not earnings_df.empty:
                for _, row in earnings_df.iterrows():
                    # Find date
                    date_val = None
                    for date_col in ['date', 'report_date', 'fiscal_date']:
                        if date_col in row.index:
                            date_val = row[date_col]
                            if pd.notna(date_val):
                                if isinstance(date_val, pd.Timestamp):
                                    date_val = date_val.isoformat()
                                elif isinstance(date_val, datetime):
                                    date_val = date_val.isoformat()
                                break
                    
                    # Find EPS value
                    eps_val = None
                    for eps_col in ['eps', 'earnings_per_share', 'diluted_eps']:
                        if eps_col in row.index:
                            val = row[eps_col]
                            if pd.notna(val):
                                eps_val = _sanitize_float(float(val))
                                break
                    
                    # Find quarter
                    quarter = None
                    for q_col in ['quarter', 'fiscal_quarter', 'period']:
                        if q_col in row.index:
                            quarter = str(row[q_col]) if pd.notna(row[q_col]) else None
                            break
                    
                    # Convert date to string properly
                    date_str = None
                    if date_val:
                        if isinstance(date_val, pd.Timestamp):
                            date_str = date_val.isoformat()
                        elif isinstance(date_val, datetime):
                            date_str = date_val.isoformat()
                        elif hasattr(date_val, 'isoformat'):
                            date_str = date_val.isoformat()
                        else:
                            date_str = str(date_val)
                    
                    if date_str or eps_val is not None:
                        history.append({
                            "date": date_str,
                            "eps": eps_val,
                            "quarter": quarter,
                        })
            
            # Sort by date descending
            history.sort(key=lambda x: x.get("date") or "", reverse=True)
            
            results.append({
                "symbol": symbol,
                "history": history,
                "ttmEps": ttm_eps_value,
            })
        except Exception as exc:
            print(f"[earnings/history] failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({"symbol": symbol.upper(), "history": [], "ttmEps": None})
    
    return {"earnings": results}


@app.post("/revenue/estimates")
def revenue_estimates(payload: SymbolsPayload):
    """
    Revenue estimates (consensus) from defeatbeta_api (stock_revenue_estimates parquet).

    Response: { "estimates": [ { "symbol": "GOOG", "data": [ ... ] } ] }
    """

    def _to_float(v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            fval = float(v)
            if math.isnan(fval) or math.isinf(fval):
                return None
            return fval
        except Exception:
            return None

    symbols = [s.strip().upper() for s in (payload.symbols or []) if s and s.strip()]
    if not symbols:
        return {"estimates": []}

    results: List[Dict[str, Any]] = []

    for symbol in symbols:
        try:
            t = _get_ticker(symbol)
            forecast_fn = getattr(t, "revenue_forecast", None)
            if not forecast_fn or not callable(forecast_fn):
                results.append({"symbol": symbol, "data": []})
                continue

            df = forecast_fn()
            if df is None or not isinstance(df, pd.DataFrame) or df.empty:
                results.append({"symbol": symbol, "data": []})
                continue

            df = df.copy()
            if "report_date" in df.columns:
                df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
                df = df[df["report_date"].notna()].sort_values("report_date", ascending=True)

            items: List[Dict[str, Any]] = []
            for _, row in df.iterrows():
                period = None
                if "report_date" in row.index and pd.notna(row["report_date"]):
                    try:
                        period = pd.Timestamp(row["report_date"]).date().isoformat()
                    except Exception:
                        period = str(row["report_date"])

                items.append(
                    {
                        "period": period,
                        "revenueAvg": _to_float(row.get("estimate_avg_revenue")),
                        "revenueHigh": _to_float(row.get("estimate_high_revenue")),
                        "revenueLow": _to_float(row.get("estimate_low_revenue")),
                        "numberAnalysts": int(row.get("number_of_analysts"))
                        if row.get("number_of_analysts") is not None
                        else None,
                        "periodType": row.get("period_type"),
                        "currency": row.get("currency"),
                        "revenueGrowth": _to_float(row.get("estimate_revenue_growth")),
                    }
                )

            results.append({"symbol": symbol, "data": items})
        except Exception as exc:
            print(f"[revenue/estimates] failed for {symbol}: {exc}", flush=True)
            results.append({"symbol": symbol, "data": []})

    return {"estimates": results}


@app.post("/dividends")
def dividends(payload: SymbolsPayload):
    """
    Get dividend history for symbols.
    Returns date, amount, and dividend details.
    """
    results = []
    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)
            dividends_fn = getattr(t, "dividends", None)

            if not dividends_fn or not callable(dividends_fn):
                results.append({"symbol": symbol, "dividends": []})
                continue

            dividends_df = dividends_fn()
            if dividends_df is None or dividends_df.empty:
                results.append({"symbol": symbol, "dividends": []})
                continue

            dividends_list = []
            for _, row in dividends_df.iterrows():
                # Find date column
                date_val = None
                for date_col in ['date', 'ex_date', 'payment_date', 'report_date', 'fiscal_date']:
                    if date_col in row.index:
                        date_val = row[date_col]
                        if pd.notna(date_val):
                            if isinstance(date_val, pd.Timestamp):
                                date_val = date_val.isoformat()
                            elif isinstance(date_val, datetime):
                                date_val = date_val.isoformat()
                            break

                # Find amount/value column
                amount = None
                for amt_col in ['amount', 'dividend', 'value', 'cash_amount']:
                    if amt_col in row.index:
                        val = row[amt_col]
                        if pd.notna(val) and isinstance(val, (int, float)):
                            amount = _sanitize_float(float(val))
                            break

                # Find frequency if available
                frequency = None
                for freq_col in ['frequency', 'payment_frequency', 'type']:
                    if freq_col in row.index:
                        val = row[freq_col]
                        if pd.notna(val):
                            frequency = str(val)
                            break

                # Convert date to string properly
                date_str = None
                if date_val:
                    if isinstance(date_val, pd.Timestamp):
                        date_str = date_val.isoformat()
                    elif isinstance(date_val, datetime):
                        date_str = date_val.isoformat()
                    elif hasattr(date_val, 'isoformat'):
                        date_str = date_val.isoformat()
                    else:
                        date_str = str(date_val)

                if date_str and amount is not None:
                    dividends_list.append({
                        "date": date_str,
                        "amount": amount,
                        "frequency": frequency,
                    })

            # Sort by date descending (most recent first)
            dividends_list.sort(key=lambda x: x.get("date") or "", reverse=True)

            results.append({"symbol": symbol, "dividends": dividends_list})
        except Exception as exc:
            print(f"[dividends] failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({"symbol": symbol, "dividends": []})

    return {"dividends": results}


@app.post("/splits")
def splits(payload: SymbolsPayload):
    """
    Get stock split history for symbols.
    Returns date, ratio, and split details.
    """
    results = []
    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)
            splits_fn = getattr(t, "splits", None)
            
            if not splits_fn or not callable(splits_fn):
                results.append({"symbol": symbol, "splits": []})
                continue
            
            splits_df = splits_fn()
            if splits_df is None or splits_df.empty:
                results.append({"symbol": symbol, "splits": []})
                continue
            
            splits_list = []
            for _, row in splits_df.iterrows():
                # Find date column
                date_val = None
                for date_col in ['date', 'split_date', 'report_date', 'fiscal_date']:
                    if date_col in row.index:
                        date_val = row[date_col]
                        if pd.notna(date_val):
                            if isinstance(date_val, pd.Timestamp):
                                date_val = date_val.isoformat()
                            elif isinstance(date_val, datetime):
                                date_val = date_val.isoformat()
                            break
                
                # Find ratio (could be 'ratio', 'split_ratio', 'from_to', etc.)
                ratio = None
                ratio_str = None
                for ratio_col in ['ratio', 'split_ratio', 'from_to']:
                    if ratio_col in row.index:
                        val = row[ratio_col]
                        if pd.notna(val):
                            ratio_str = str(val)
                            # Try to parse ratio like "2:1" or "2/1"
                            if ':' in ratio_str or '/' in ratio_str:
                                ratio = ratio_str
                            break
                
                # Find 'from' and 'to' values if available
                from_val = None
                to_val = None
                for from_col in ['from', 'from_shares', 'before']:
                    if from_col in row.index:
                        val = row[from_col]
                        if pd.notna(val):
                            from_val = _sanitize_float(float(val)) if isinstance(val, (int, float)) else None
                            break
                
                for to_col in ['to', 'to_shares', 'after']:
                    if to_col in row.index:
                        val = row[to_col]
                        if pd.notna(val):
                            to_val = _sanitize_float(float(val)) if isinstance(val, (int, float)) else None
                            break
                
                # If we have from and to but no ratio string, construct it
                if not ratio and from_val and to_val:
                    ratio = f"{int(to_val)}:{int(from_val)}"
                
                # Convert date to string properly
                date_str = None
                if date_val:
                    if isinstance(date_val, pd.Timestamp):
                        date_str = date_val.isoformat()
                    elif isinstance(date_val, datetime):
                        date_str = date_val.isoformat()
                    elif hasattr(date_val, 'isoformat'):
                        date_str = date_val.isoformat()
                    else:
                        date_str = str(date_val)
                
                if date_str or ratio:
                    splits_list.append({
                        "date": date_str,
                        "ratio": ratio or ratio_str,
                        "from": from_val,
                        "to": to_val,
                    })
            
            # Sort by date descending (most recent first)
            splits_list.sort(key=lambda x: x.get("date") or "", reverse=True)
            
            results.append({"symbol": symbol, "splits": splits_list})
        except Exception as exc:
            print(f"[splits] failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({"symbol": symbol, "splits": []})
    
    return {"splits": results}


@app.post("/revenue/breakdown")
def revenue_breakdown(payload: SymbolsPayload):
    """
    Get revenue breakdown by geography and product/service segments.
    Returns geographic and segment revenue distribution.
    """
    results = []
    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)
            
            # Use the private method _revenue_by_breakdown which requires breakdown_type
            revenue_by_breakdown_fn = getattr(t, "_revenue_by_breakdown", None)
            
            if not revenue_by_breakdown_fn or not callable(revenue_by_breakdown_fn):
                results.append({"symbol": symbol, "geography": [], "segments": []})
                continue
            
            # Get breakdown data for geography and segments
            geography_df = None
            segments_df = None
            
            try:
                geography_df = revenue_by_breakdown_fn('geography')
            except Exception as e:
                print(f"[revenue/breakdown] Geography fetch failed for {symbol}: {e}", flush=True)
            
            try:
                segments_df = revenue_by_breakdown_fn('segment')
            except Exception as e:
                print(f"[revenue/breakdown] Segment fetch failed for {symbol}: {e}", flush=True)
            
            if (geography_df is None or geography_df.empty) and (segments_df is None or segments_df.empty):
                results.append({"symbol": symbol, "geography": [], "segments": []})
                continue
            
            # Parse breakdown data
            # The _revenue_by_breakdown returns a pivoted DataFrame with report_date as index
            # and item_name as columns, with item_value as values
            geography = []
            segments = []
            
            # Process geography data
            # The DataFrame is pivoted: columns are item_name (regions), rows are report_date
            if geography_df is not None and not geography_df.empty:
                # Get the most recent report_date (last row)
                latest_geo_row = geography_df.iloc[-1]
                report_date = latest_geo_row.get("report_date") if "report_date" in latest_geo_row.index else None
                
                date_str = None
                if pd.notna(report_date):
                    if isinstance(report_date, pd.Timestamp):
                        date_str = report_date.isoformat()
                    elif isinstance(report_date, datetime):
                        date_str = report_date.isoformat()
                    else:
                        date_str = str(report_date)
                
                # Each column (except report_date) is a geographic region
                for col in geography_df.columns:
                    if col != "report_date":
                        item_value = latest_geo_row.get(col)
                        if pd.notna(item_value) and isinstance(item_value, (int, float)) and item_value != 0:
                            geography.append({
                                "name": str(col),
                                "value": _sanitize_float(float(item_value)),
                                "date": date_str,
                            })
            
            # Process segment data
            # Same structure as geography
            if segments_df is not None and not segments_df.empty:
                # Get the most recent report_date (last row)
                latest_seg_row = segments_df.iloc[-1]
                report_date = latest_seg_row.get("report_date") if "report_date" in latest_seg_row.index else None
                
                date_str = None
                if pd.notna(report_date):
                    if isinstance(report_date, pd.Timestamp):
                        date_str = report_date.isoformat()
                    elif isinstance(report_date, datetime):
                        date_str = report_date.isoformat()
                    else:
                        date_str = str(report_date)
                
                # Each column (except report_date) is a segment
                for col in segments_df.columns:
                    if col != "report_date":
                        item_value = latest_seg_row.get(col)
                        if pd.notna(item_value) and isinstance(item_value, (int, float)) and item_value != 0:
                            segments.append({
                                "name": str(col),
                                "value": _sanitize_float(float(item_value)),
                                "date": date_str,
                            })
            
            # Sort by value descending
            geography.sort(key=lambda x: x.get("value", 0), reverse=True)
            segments.sort(key=lambda x: x.get("value", 0), reverse=True)
            
            results.append({
                "symbol": symbol,
                "geography": geography,
                "segments": segments,
            })
        except Exception as exc:
            print(f"[revenue/breakdown] failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({"symbol": symbol, "geography": [], "segments": []})
    
    return {"breakdown": results}


@app.post("/transcripts")
def transcripts(payload: TranscriptsRequest):
    """
    Get earnings call transcripts for symbols with pagination.
    Returns paginated list of available transcripts with dates and metadata.
    """
    page = payload.page
    limit = payload.limit
    all_transcripts = []
    
    # Collect all transcripts from all symbols
    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)

            # defeatbeta_api exposes transcripts via earning_call_transcripts()
            transcripts_fn = getattr(t, "earning_call_transcripts", None)

            if not transcripts_fn or not callable(transcripts_fn):
                continue

            # Get Transcripts object from defeatbeta_api
            transcripts_obj = transcripts_fn()

            # defeatbeta_api Transcripts exposes get_transcripts_list()
            transcript_list = []
            if hasattr(transcripts_obj, "get_transcripts_list"):
                try:
                    transcript_list_raw = transcripts_obj.get_transcripts_list()
                    if transcript_list_raw is not None:
                        if isinstance(transcript_list_raw, pd.DataFrame):
                            # Convert DataFrame to list of dicts
                            for _, row in transcript_list_raw.iterrows():
                                transcript_info = {}

                                # Find date
                                date_val = None
                                for date_col in ['date', 'report_date', 'fiscal_date', 'quarter_date']:
                                    if date_col in row.index:
                                        val = row[date_col]
                                        # Handle Series/array by taking first value if needed
                                        if isinstance(val, (pd.Series, np.ndarray)):
                                            if len(val) > 0:
                                                val = val.iloc[0] if isinstance(val, pd.Series) else val[0]
                                            else:
                                                val = None
                                        # Check if value is not NA (explicit check to avoid ambiguous truth value)
                                        if val is not None and pd.notna(val):
                                            if isinstance(val, pd.Timestamp):
                                                date_val = val.isoformat()
                                            elif isinstance(val, datetime):
                                                date_val = val.isoformat()
                                            elif hasattr(val, 'isoformat'):
                                                date_val = val.isoformat()
                                            else:
                                                date_val = str(val)
                                            break

                                # Find quarter/year info
                                quarter = None
                                for q_col in ['quarter', 'fiscal_quarter', 'period']:
                                    if q_col in row.index:
                                        val = row[q_col]
                                        # Handle Series/array by taking first value if needed
                                        if isinstance(val, (pd.Series, np.ndarray)):
                                            if len(val) > 0:
                                                val = val.iloc[0] if isinstance(val, pd.Series) else val[0]
                                            else:
                                                val = None
                                        # Check if value is not NA (explicit check to avoid ambiguous truth value)
                                        if val is not None and pd.notna(val):
                                            quarter = str(val)
                                            break

                                year = None
                                for y_col in ['year', 'fiscal_year']:
                                    if y_col in row.index:
                                        val = row[y_col]
                                        # Handle Series/array by taking first value if needed
                                        if isinstance(val, (pd.Series, np.ndarray)):
                                            if len(val) > 0:
                                                val = val.iloc[0] if isinstance(val, pd.Series) else val[0]
                                            else:
                                                val = None
                                        # Check if value is not NA (explicit check to avoid ambiguous truth value)
                                        if val is not None and pd.notna(val):
                                            if isinstance(val, (int, float)):
                                                year = int(val)
                                            else:
                                                try:
                                                    year = int(str(val))
                                                except (ValueError, TypeError):
                                                    year = None
                                            break

                                # Find transcript type
                                transcript_type = None
                                for type_col in ['type', 'transcript_type', 'call_type']:
                                    if type_col in row.index:
                                        val = row[type_col]
                                        # Handle Series/array by taking first value if needed
                                        if isinstance(val, (pd.Series, np.ndarray)):
                                            if len(val) > 0:
                                                val = val.iloc[0] if isinstance(val, pd.Series) else val[0]
                                            else:
                                                val = None
                                        # Check if value is not NA (explicit check to avoid ambiguous truth value)
                                        if val is not None and pd.notna(val):
                                            transcript_type = str(val)
                                            break

                                # date_val is already processed above (converted to string/isoformat)
                                date_str = date_val

                                transcript_info = {
                                    "date": date_str,
                                    "quarter": quarter,
                                    "year": year,
                                    "type": transcript_type,
                                }

                                # Add all other columns as metadata
                                for col in row.index:
                                    if col not in [
                                        'date',
                                        'report_date',
                                        'fiscal_date',
                                        'quarter_date',
                                        'quarter',
                                        'fiscal_quarter',
                                        'period',
                                        'year',
                                        'fiscal_year',
                                        'type',
                                        'transcript_type',
                                        'call_type',
                                    ]:
                                        val = row[col]
                                        # Handle Series/array by taking first value if needed
                                        if isinstance(val, (pd.Series, np.ndarray)):
                                            if len(val) > 0:
                                                val = val.iloc[0] if isinstance(val, pd.Series) else val[0]
                                            else:
                                                val = None
                                        # Check if value is not NA (explicit check to avoid ambiguous truth value)
                                        if val is not None and pd.notna(val):
                                            transcript_info[col] = (
                                                _sanitize_float(float(val))
                                                if isinstance(val, (int, float))
                                                else str(val)
                                            )

                                transcript_list.append(transcript_info)
                        elif isinstance(transcript_list_raw, list):
                            transcript_list = transcript_list_raw
                except Exception as e:
                    print(f"[transcripts] Error getting transcript list for {symbol}: {e}", flush=True)

            # Add symbol to each transcript and add to all_transcripts
            for transcript in transcript_list:
                transcript["symbol"] = symbol
                all_transcripts.append(transcript)
                
        except Exception as exc:
            print(f"[transcripts] failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
    
    # Sort all transcripts by date (most recent first)
    all_transcripts.sort(key=lambda x: x.get("date") or "", reverse=True)
    
    # Calculate pagination
    total = len(all_transcripts)
    start_index = (page - 1) * limit
    end_index = start_index + limit
    paginated_transcripts = all_transcripts[start_index:end_index]
    
    # Calculate pagination metadata
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    has_more = end_index < total
    
    return {
        "transcripts": paginated_transcripts,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": total_pages,
            "hasMore": has_more,
        }
    }


class TranscriptContentRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol")
    fiscal_year: int = Field(..., description="Fiscal year of the earnings call")
    fiscal_quarter: int = Field(..., description="Fiscal quarter of the earnings call (e.g. 1-4)")


@app.post("/transcripts/content")
def transcript_content(req: TranscriptContentRequest):
    """
    Get full earnings call transcript paragraphs for a single symbol and quarter.

    Returns a list of paragraphs with all available fields (speaker, content, etc.).
    """
    symbol = req.symbol.upper()
    try:
        t = _get_ticker(symbol)

        transcripts_fn = getattr(t, "earning_call_transcripts", None)
        if not transcripts_fn or not callable(transcripts_fn):
            return {
                "symbol": symbol,
                "fiscal_year": req.fiscal_year,
                "fiscal_quarter": req.fiscal_quarter,
                "paragraphs": [],
            }

        transcripts_obj = transcripts_fn()

        # defeatbeta_api Transcripts.get_transcript(fiscal_year, fiscal_quarter)
        if not hasattr(transcripts_obj, "get_transcript"):
            return {
                "symbol": symbol,
                "fiscal_year": req.fiscal_year,
                "fiscal_quarter": req.fiscal_quarter,
                "paragraphs": [],
            }

        df = transcripts_obj.get_transcript(req.fiscal_year, req.fiscal_quarter)
        if df is None or not isinstance(df, pd.DataFrame) or df.empty:
            return {
                "symbol": symbol,
                "fiscal_year": req.fiscal_year,
                "fiscal_quarter": req.fiscal_quarter,
                "paragraphs": [],
            }

        paragraphs = []
        for _, row in df.iterrows():
            para: Dict[str, Any] = {}
            for col, val in row.items():
                if pd.isna(val):
                    continue
                if isinstance(val, (pd.Timestamp, datetime)):
                    para[col] = val.isoformat()
                elif isinstance(val, (int, float)):
                    para[col] = _sanitize_float(float(val))
                else:
                    para[col] = str(val)
            paragraphs.append(para)

        return {
            "symbol": symbol,
            "fiscal_year": req.fiscal_year,
            "fiscal_quarter": req.fiscal_quarter,
            "paragraphs": paragraphs,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[transcripts/content] failed for {symbol}: {exc}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch transcript content")


# ============================================================================
# PORTFOLIO ENDPOINTS
# ============================================================================

class PortfolioHoldingCreate(BaseModel):
    symbol: str
    shares: float
    averageCost: float
    purchaseDate: str  # ISO date string


class PortfolioHoldingUpdate(BaseModel):
    shares: Optional[float] = None
    averageCost: Optional[float] = None
    purchaseDate: Optional[str] = None


@app.get("/portfolio/holdings")
def get_portfolio_holdings(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get all portfolio holdings for a user"""
    holdings = db.query(PortfolioHolding).filter(
        PortfolioHolding.user_id == user_id
    ).order_by(PortfolioHolding.added_at.desc()).all()
    
    return {
        "holdings": [h.to_dict() for h in holdings],
        "createdAt": holdings[0].created_at.isoformat() if holdings else datetime.utcnow().isoformat(),
        "updatedAt": holdings[0].updated_at.isoformat() if holdings else datetime.utcnow().isoformat(),
    }


@app.post("/portfolio/holdings")
def add_portfolio_holding(
    holding: PortfolioHoldingCreate,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Add a new portfolio holding"""
    # Check if holding already exists
    existing = db.query(PortfolioHolding).filter(
        PortfolioHolding.user_id == user_id,
        PortfolioHolding.symbol == holding.symbol.upper()
    ).first()
    
    if existing:
        # Merge with existing (combine shares and recalculate average cost)
        total_shares = existing.shares + holding.shares
        total_cost = existing.shares * existing.average_cost + holding.shares * holding.averageCost
        new_average_cost = total_cost / total_shares
        
        existing.shares = total_shares
        existing.average_cost = new_average_cost
        existing.purchase_date = datetime.fromisoformat(holding.purchaseDate.replace('Z', '+00:00'))
        existing.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(existing)
        return existing.to_dict()
    else:
        # Create new holding
        purchase_date = datetime.fromisoformat(holding.purchaseDate.replace('Z', '+00:00'))
        new_holding = PortfolioHolding(
            user_id=user_id,
            symbol=holding.symbol.upper(),
            shares=holding.shares,
            average_cost=holding.averageCost,
            purchase_date=purchase_date,
            added_at=datetime.utcnow(),
        )
        db.add(new_holding)
        db.commit()
        db.refresh(new_holding)
        return new_holding.to_dict()


@app.put("/portfolio/holdings/{symbol}")
def update_portfolio_holding(
    symbol: str,
    updates: PortfolioHoldingUpdate,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update a portfolio holding"""
    holding = db.query(PortfolioHolding).filter(
        PortfolioHolding.user_id == user_id,
        PortfolioHolding.symbol == symbol.upper()
    ).first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    if updates.shares is not None:
        holding.shares = updates.shares
    if updates.averageCost is not None:
        holding.average_cost = updates.averageCost
    if updates.purchaseDate is not None:
        holding.purchase_date = datetime.fromisoformat(updates.purchaseDate.replace('Z', '+00:00'))
    
    holding.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(holding)
    return holding.to_dict()


@app.delete("/portfolio/holdings/{symbol}")
def delete_portfolio_holding(
    symbol: str,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Delete a portfolio holding"""
    holding = db.query(PortfolioHolding).filter(
        PortfolioHolding.user_id == user_id,
        PortfolioHolding.symbol == symbol.upper()
    ).first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    db.delete(holding)
    db.commit()
    return {"message": "Holding deleted"}


@app.delete("/portfolio/holdings")
def clear_portfolio(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Clear all portfolio holdings for a user"""
    db.query(PortfolioHolding).filter(
        PortfolioHolding.user_id == user_id
    ).delete()
    db.commit()
    return {"message": "Portfolio cleared"}


# ============================================================================
# SAVED SCREENS ENDPOINTS
# ============================================================================

class SavedScreenCreate(BaseModel):
    name: str
    filters: dict  # ScreenerFilters as dict


class SavedScreenUpdate(BaseModel):
    name: Optional[str] = None
    filters: Optional[dict] = None


@app.get("/saved-screens")
def get_saved_screens(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get all saved screens for a user"""
    screens = db.query(SavedScreen).filter(
        SavedScreen.user_id == user_id
    ).order_by(SavedScreen.last_used.desc()).all()
    
    return {"screens": [s.to_dict() for s in screens]}


@app.post("/saved-screens")
def create_saved_screen(
    screen: SavedScreenCreate,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Create a new saved screen"""
    # Check if name already exists
    existing = db.query(SavedScreen).filter(
        SavedScreen.user_id == user_id,
        SavedScreen.name == screen.name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="A screen with this name already exists")
    
    new_screen = SavedScreen(
        user_id=user_id,
        name=screen.name,
        filters=screen.filters,
        created_at=datetime.utcnow(),
        last_used=datetime.utcnow(),
    )
    db.add(new_screen)
    db.commit()
    db.refresh(new_screen)
    return new_screen.to_dict()


@app.get("/saved-screens/{screen_id}")
def get_saved_screen(
    screen_id: int,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific saved screen"""
    screen = db.query(SavedScreen).filter(
        SavedScreen.id == screen_id,
        SavedScreen.user_id == user_id
    ).first()
    
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    
    # Update last_used
    screen.last_used = datetime.utcnow()
    db.commit()
    
    return screen.to_dict()


@app.put("/saved-screens/{screen_id}")
def update_saved_screen(
    screen_id: int,
    updates: SavedScreenUpdate,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update a saved screen"""
    screen = db.query(SavedScreen).filter(
        SavedScreen.id == screen_id,
        SavedScreen.user_id == user_id
    ).first()
    
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    
    if updates.name is not None:
        # Check if new name conflicts with another screen
        existing = db.query(SavedScreen).filter(
            SavedScreen.user_id == user_id,
            SavedScreen.name == updates.name,
            SavedScreen.id != screen_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A screen with this name already exists")
        screen.name = updates.name
    
    if updates.filters is not None:
        screen.filters = updates.filters
    
    screen.updated_at = datetime.utcnow()
    screen.last_used = datetime.utcnow()
    db.commit()
    db.refresh(screen)
    return screen.to_dict()


@app.delete("/saved-screens/{screen_id}")
def delete_saved_screen(
    screen_id: int,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Delete a saved screen"""
    screen = db.query(SavedScreen).filter(
        SavedScreen.id == screen_id,
        SavedScreen.user_id == user_id
    ).first()
    
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    
    db.delete(screen)
    db.commit()
    return {"message": "Screen deleted"}


@app.post("/analysis/comprehensive")
def comprehensive_analysis(payload: SymbolsPayload):
    """
    Generate comprehensive analysis including:
    - 6-factor scores
    - DCF-Lite valuation
    - News sentiment
    - Investment signal (BUY/WATCHLIST/AVOID)
    """
    from valuation_models import calculate_dcf_lite
    from factor_scoring import (
        calculate_valuation_factor,
        calculate_quality_factor,
        calculate_growth_factor,
        calculate_risk_factor,
        calculate_composite_score
    )
    from investment_signal import generate_investment_signal
    from sec_insights import load_filing_insights

    results = []

    for symbol in payload.symbols:
        try:
            symbol = symbol.upper()
            t = _get_ticker(symbol)

            # --- Get Industry Peers for Percentile Ranking ---
            try:
                info_fn = getattr(t, "info", None)
                if info_fn:
                    info_df = info_fn()
                    if not info_df.empty:
                        industry = info_df.get("industry", ["Unknown"])[0] if "industry" in info_df.columns else "Unknown"
                        sector = info_df.get("sector", ["Unknown"])[0] if "sector" in info_df.columns else "Unknown"
                    else:
                        industry, sector = "Unknown", "Unknown"
                else:
                    industry, sector = "Unknown", "Unknown"
            except:
                industry, sector = "Unknown", "Unknown"

            # Get peer symbols from industry (simplified - you'd want better peer selection)
            # For now, we'll just use the focal stock's own metrics (no peers)
            # In production, fetch all stocks in same industry
            peer_symbols = [symbol]  # TODO: Add proper peer selection

            # --- Collect DCF Inputs from Yahoo Finance (Free, No API Key) ---
            from yahoo_dcf_data import get_dcf_inputs_from_yahoo

            yahoo_data = get_dcf_inputs_from_yahoo(symbol)

            # Extract DCF inputs
            revenue_ttm = yahoo_data.get("revenue_ttm")
            fcf_margin = yahoo_data.get("fcf_margin")
            revenue_growth = yahoo_data.get("revenue_growth_rate")
            shares_outstanding = yahoo_data.get("shares_outstanding")
            market_cap = yahoo_data.get("market_cap")

            # Valuation Ratios
            pe_fn = getattr(t, "ttm_pe", None)
            pe_ratio = None
            if pe_fn and callable(pe_fn):
                df = pe_fn()
                if df is not None and not df.empty and "ttm_pe" in df.columns:
                    pe_ratio = _sanitize_float(df.iloc[-1]["ttm_pe"]) if pd.notna(df.iloc[-1]["ttm_pe"]) else None

            ps_fn = getattr(t, "ps_ratio", None)
            ps_ratio = None
            if ps_fn and callable(ps_fn):
                df = ps_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    ps_ratio = vals[0] if vals else None

            pb_fn = getattr(t, "pb_ratio", None)
            pb_ratio = None
            if pb_fn and callable(pb_fn):
                df = pb_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    pb_ratio = vals[0] if vals else None

            # Quality Metrics
            roe_fn = getattr(t, "roe", None)
            roe = None
            if roe_fn and callable(roe_fn):
                df = roe_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    roe = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            roa_fn = getattr(t, "roa", None)
            roa = None
            if roa_fn and callable(roa_fn):
                df = roa_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    roa = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            # Get margins
            gross_margin_fn = getattr(t, "quarterly_gross_margin", None)
            gross_margin = None
            if gross_margin_fn and callable(gross_margin_fn):
                df = gross_margin_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    gross_margin = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            operating_margin_fn = getattr(t, "quarterly_operating_margin", None)
            operating_margin = None
            if operating_margin_fn and callable(operating_margin_fn):
                df = operating_margin_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    operating_margin = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            net_margin_fn = getattr(t, "quarterly_net_margin", None)
            net_margin = None
            if net_margin_fn and callable(net_margin_fn):
                df = net_margin_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    net_margin = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            # Growth metrics
            eps_growth_fn = getattr(t, "quarterly_eps_yoy_growth", None)
            eps_growth = None
            if eps_growth_fn and callable(eps_growth_fn):
                df = eps_growth_fn()
                if df is not None and not df.empty:
                    vals = [_sanitize_float(v) for v in df.iloc[:, -1] if pd.notna(v)]
                    eps_growth = vals[0] / 100 if vals and vals[0] > 1 else (vals[0] if vals else None)

            # --- DCF-Lite Valuation ---
            debug_dcf = os.getenv("COMPREHENSIVE_ANALYSIS_DEBUG") in (
                "1",
                "true",
                "TRUE",
                "yes",
                "YES",
                "on",
                "ON",
            )

            dcf_result = None
            if debug_dcf:
                print(
                    f"[analysis] {symbol}: revenue_ttm={revenue_ttm}, fcf_margin={fcf_margin}, "
                    f"revenue_growth={revenue_growth}, shares={shares_outstanding}, market_cap={market_cap}",
                    flush=True,
                )
            if revenue_ttm and fcf_margin and revenue_growth:
                dcf_result = calculate_dcf_lite(
                    revenue_ttm=revenue_ttm,
                    fcf_margin=fcf_margin,
                    revenue_growth_rate=revenue_growth,
                    wacc=0.10,  # 10% default for tech
                    terminal_growth=0.03,
                    shares_outstanding=shares_outstanding,
                    market_cap=market_cap
                )
                if debug_dcf:
                    print(f"[analysis] {symbol}: DCF calculated successfully", flush=True)
            else:
                if debug_dcf:
                    print(f"[analysis] {symbol}: Missing required data for DCF", flush=True)

            # --- Factor Scores (Simplified - no peer data yet) ---
            # In production, you'd fetch peer data from database
            valuation_factor = calculate_valuation_factor(
                pe_ratio, ps_ratio, pb_ratio, None, None, None,
                [], [], [], [], [], []  # Empty peer lists for now
            )

            quality_factor = calculate_quality_factor(
                roe, roa, None, gross_margin, operating_margin, net_margin, fcf_margin,
                [], [], [], [], [], [], []
            )

            growth_factor = calculate_growth_factor(
                revenue_growth, None, eps_growth, None,
                [], [], [], []
            )

            # --- Load SEC Risks ---
            filing_insights = load_filing_insights(symbol)
            high_severity_risks = 0
            medium_severity_risks = 0
            low_severity_risks = 0

            if filing_insights:
                latest = filing_insights[0]
                categorized_risks = latest.get("categorized_risks", [])
                for risk in categorized_risks:
                    severity = risk.get("severity", "").lower()
                    if severity == "high":
                        high_severity_risks += 1
                    elif severity == "medium":
                        medium_severity_risks += 1
                    elif severity == "low":
                        low_severity_risks += 1

            risk_factor = calculate_risk_factor(
                debt_to_equity=None,
                current_ratio=None,
                interest_coverage=None,
                beta=None,
                risk_count_high=high_severity_risks,
                risk_count_medium=medium_severity_risks,
                risk_count_low=low_severity_risks
            )

            # Sentiment & Momentum (placeholder - would need price/news data)
            sentiment_factor = {"score": None, "interpretation": "insufficient_data"}
            momentum_factor = {"score": None, "interpretation": "insufficient_data"}

            # Composite Score
            composite = calculate_composite_score(
                valuation_factor.get("score"),
                quality_factor.get("score"),
                growth_factor.get("score"),
                momentum_factor.get("score"),
                sentiment_factor.get("score"),
                risk_factor.get("score")
            )

            # --- Investment Signal ---
            signal_result = generate_investment_signal(
                composite_score=composite.get("composite_score"),
                valuation_score=valuation_factor.get("score"),
                quality_score=quality_factor.get("score"),
                growth_score=growth_factor.get("score"),
                risk_score=risk_factor.get("score"),
                dcf_upside_pct=dcf_result.get("upside_downside_pct") if dcf_result else None,
                dcf_rating=dcf_result.get("rating") if dcf_result else None,
                relative_valuation_score=None,
                relative_valuation_interpretation=None,
                high_severity_risks=high_severity_risks,
                medium_severity_risks=medium_severity_risks,
                revenue_growth=revenue_growth
            )

            results.append({
                "symbol": symbol,
                "dcf_valuation": dcf_result,
                "factor_scores": {
                    "valuation": valuation_factor,
                    "quality": quality_factor,
                    "growth": growth_factor,
                    "momentum": momentum_factor,
                    "sentiment": sentiment_factor,
                    "risk": risk_factor,
                    "composite": composite
                },
                "investment_signal": signal_result
            })

        except Exception as exc:
            print(f"[analysis/comprehensive] Failed for {symbol}: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            results.append({
                "symbol": symbol,
                "error": str(exc)
            })

    return {"analysis": results}


@app.on_event("startup")
def _on_startup():
    # Warm caches asynchronously so startup isn't blocked.
    threading.Thread(target=_warm_caches, daemon=True).start()
