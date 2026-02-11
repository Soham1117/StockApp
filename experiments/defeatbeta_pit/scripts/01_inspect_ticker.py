from __future__ import annotations

import sys
from pathlib import Path
import re
from pprint import pprint

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.defeatbeta_setup import force_utf8_stdio


def main() -> None:
    force_utf8_stdio()
    # Ensure the repo root (with the local `defeatbeta_api/` checkout) is importable.
    from scripts.defeatbeta_setup import ensure_repo_root_on_path
    ensure_repo_root_on_path()
    from defeatbeta_api.data.ticker import Ticker
    import inspect

    print("Ticker.__init__ signature:")
    print(inspect.signature(Ticker.__init__))
    print()

    patterns = [
        r"annual_",
        r"quarterly_",
        r"income|balance|cash",
        r"earn",
        r"ratio|ps_ratio|pb_ratio|peg_ratio",
        r"info|summary|price",
    ]
    rx = re.compile("|".join(patterns), re.IGNORECASE)
    methods = [m for m in dir(Ticker) if not m.startswith("_") and rx.search(m)]

    print("Candidate methods for fundamentals/history:")
    pprint(sorted(methods))


if __name__ == "__main__":
    main()
