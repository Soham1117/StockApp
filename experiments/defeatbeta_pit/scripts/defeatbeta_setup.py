from __future__ import annotations

import platform
import sys
from dataclasses import dataclass
from pathlib import Path


def force_utf8_stdio() -> None:
    """
    DefeatBeta prints a welcome banner with emojis at import time.
    On some Windows setups, stdout is cp1252 and throws UnicodeEncodeError.
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def ensure_repo_root_on_path() -> Path | None:
    """
    When running from `experiments/defeatbeta_pit`, the repo root (which contains
    the checked-out `defeatbeta_api/` package) isn't guaranteed to be on sys.path.
    Walk upwards until we find it and add it.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "defeatbeta_api").is_dir():
            parent_str = str(parent)
            if parent_str not in sys.path:
                sys.path.insert(0, parent_str)
            return parent
    return None


@dataclass(frozen=True)
class DefeatBetaEnv:
    is_windows: bool


def get_env() -> DefeatBetaEnv:
    return DefeatBetaEnv(is_windows=platform.system() == "Windows")


def get_windows_compatible_config():
    """
    DefeatBeta's DuckDB settings try to INSTALL/LOAD cache_httpfs which 404s on Windows.
    This mirrors the workaround you already have in `fastapi_app/main.py`.
    """
    from defeatbeta_api.client.duckdb_conf import Configuration

    class WindowsCompatibleDuckDBConfig(Configuration):
        def get_duckdb_settings(self):
            settings = super().get_duckdb_settings()
            if platform.system() != "Windows":
                return settings
            filtered = []
            for setting in settings:
                if "cache_httpfs" in setting:
                    continue
                filtered.append(setting)
            return filtered

    return WindowsCompatibleDuckDBConfig()


def get_ticker(symbol: str):
    force_utf8_stdio()
    ensure_repo_root_on_path()
    from defeatbeta_api.data.ticker import Ticker

    config = get_windows_compatible_config() if get_env().is_windows else None
    return Ticker(symbol.upper(), config=config)
