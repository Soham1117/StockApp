$ErrorActionPreference = "Stop"

if (-not $args -or $args.Count -lt 1) {
  Write-Host "Usage:"
  Write-Host "  .\\run.ps1 inspect"
  Write-Host "  .\\run.ps1 sample <SYMBOL>"
  Write-Host "  .\\run.ps1 pit-demo <SYMBOL> <AS_OF_YYYY-MM-DD>"
  exit 1
}

$mode = $args[0]

# DefeatBeta prints emojis during import; force UTF-8 so Windows console doesn't throw.
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

switch ($mode) {
  "inspect" {
    python .\scripts\01_inspect_ticker.py
  }
  "sample" {
    $symbol = if ($args.Count -ge 2) { $args[1] } else { "AAPL" }
    python .\scripts\02_sample_statements.py --symbol $symbol
  }
  "pit-demo" {
    if ($args.Count -lt 3) {
      Write-Host "Missing args. Example: .\\run.ps1 pit-demo AAPL 2019-12-31"
      exit 1
    }
    python .\scripts\03_pit_snapshot_demo.py --symbol $args[1] --as-of $args[2]
  }
  default {
    Write-Host "Unknown mode: $mode"
    exit 1
  }
}

