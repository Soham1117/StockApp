#!/usr/bin/env python
import argparse
import json
from pathlib import Path


def load_mapping(path: Path) -> dict:
  with path.open("r", encoding="utf-8") as handle:
    raw = json.load(handle)
  if isinstance(raw, dict):
    return raw
  raise ValueError("Unexpected JSON format for company_tickers.json")


def find_cik(mapping: dict, symbol: str) -> str | None:
  for entry in mapping.values():
    if not isinstance(entry, dict):
      continue
    if str(entry.get("ticker", "")).upper() == symbol:
      cik = str(entry.get("cik_str", "")).strip()
      if cik.isdigit():
        return cik.zfill(10)
  return None


def main() -> None:
  parser = argparse.ArgumentParser(description="Lookup SEC CIK for a ticker symbol.")
  parser.add_argument("--symbol", required=True, help="Ticker symbol (e.g., KD)")
  parser.add_argument(
    "--file",
    default=str(Path("backend") / "data" / "sec" / "company_tickers.json"),
    help="Path to company_tickers.json",
  )
  args = parser.parse_args()
  symbol = args.symbol.strip().upper()
  mapping = load_mapping(Path(args.file))
  cik = find_cik(mapping, symbol)
  if not cik:
    raise SystemExit(f"CIK not found for symbol {symbol}")
  print(cik)


if __name__ == "__main__":
  main()
