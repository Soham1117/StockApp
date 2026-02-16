import os

import pandas as pd
import pyfiglet

from defeatbeta_api.__version__ import __version__
from defeatbeta_api.client.hugging_face_client import HuggingFaceClient
import nltk

from defeatbeta_api.utils.util import validate_nltk_directory

# ---------------------------------------------------------------------------
# Monkey-patch pd.merge_asof to auto-normalize datetime merge keys.
# DuckDB returns datetime64[us], pandas 2.x pd.to_datetime() may return
# datetime64[s] or datetime64[us] depending on input.  merge_asof requires
# identical resolutions.  This patch normalises both sides to datetime64[ns]
# before calling the original implementation.
# ---------------------------------------------------------------------------
_original_merge_asof = pd.merge_asof

def _patched_merge_asof(left, right, on=None, left_on=None, right_on=None, **kwargs):
    left = left.copy()
    right = right.copy()
    if on is not None:
        for col in ([on] if isinstance(on, str) else on):
            if col in left.columns and pd.api.types.is_datetime64_any_dtype(left[col]):
                left[col] = left[col].astype("datetime64[ns]")
            if col in right.columns and pd.api.types.is_datetime64_any_dtype(right[col]):
                right[col] = right[col].astype("datetime64[ns]")
    else:
        if left_on is not None:
            for col in ([left_on] if isinstance(left_on, str) else left_on):
                if col in left.columns and pd.api.types.is_datetime64_any_dtype(left[col]):
                    left[col] = left[col].astype("datetime64[ns]")
        if right_on is not None:
            for col in ([right_on] if isinstance(right_on, str) else right_on):
                if col in right.columns and pd.api.types.is_datetime64_any_dtype(right[col]):
                    right[col] = right[col].astype("datetime64[ns]")
    return _original_merge_asof(left, right, on=on, left_on=left_on, right_on=right_on, **kwargs)

pd.merge_asof = _patched_merge_asof

if not os.getenv("DEFEATBETA_NO_NLTK_DOWNLOAD"):
    nltk.download('punkt_tab', download_dir=validate_nltk_directory())

_welcome_printed = False
data_update_time = ""

def _print_welcome():
    global _welcome_printed
    global data_update_time
    if not _welcome_printed:
        try:
            client = HuggingFaceClient()
            data_update_time = client.get_data_update_time()
        except (RuntimeError, Exception) as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                data_update_time = "Rate limited - unable to fetch"
                print("[WARNING] HuggingFace rate limit hit. Continuing without data update time.")
            else:
                data_update_time = "Unable to fetch"
                print(f"[WARNING] Failed to fetch data update time: {e}")

        text = "Defeat Beta"
        ascii_lines = pyfiglet.figlet_format(text, font="doom").split('\n')
        ascii_art = '\n'.join(line for line in ascii_lines if line.strip())
        colored_art = "\033[38;5;10m" + ascii_art + "\033[0m"
        print(f"{colored_art}\n"
              f"\033[1;38;5;10m📈:: Data Update Time ::\033[0m\t{data_update_time} \033[1;38;5;10m::\033[0m\n"
              f"\033[1;38;5;10m📈:: Software Version ::\033[0m\t{__version__}      \033[1;38;5;10m::\033[0m")
        _welcome_printed = True

if not os.getenv("DEFEATBETA_NO_WELCOME"):
    _print_welcome()
