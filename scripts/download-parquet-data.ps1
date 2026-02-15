# Download DefeatBeta parquet files locally to avoid HuggingFace rate limits
# Run weekly after data updates

$localDataPath = "d:\Personal Projects\StockApp\backend\local_data"

# Create directory if it doesn't exist
if (-not (Test-Path $localDataPath)) {
    New-Item -ItemType Directory -Force -Path $localDataPath
    Write-Host "Created directory: $localDataPath"
}

$tables = @(
    "stock_profile",
    "stock_summary",
    "stock_prices",
    "stock_officers",
    "stock_tailing_eps",
    "stock_earning_calendar",
    "stock_revenue_estimates",
    "stock_earning_estimates",
    "stock_historical_eps",
    "stock_statement",
    "stock_dividend_events",
    "stock_split_events",
    "exchange_rate",
    "daily_treasury_yield",
    "stock_earning_call_transcripts",
    "stock_news",
    "stock_revenue_breakdown",
    "stock_shares_outstanding"
)

$baseUrl = "https://huggingface.co/datasets/bwzheng2010/yahoo-finance-data/resolve/main/data"

Write-Host "========================================"
Write-Host "Downloading DefeatBeta parquet files"
Write-Host "========================================"
Write-Host "Target: $localDataPath"
Write-Host "Tables: $($tables.Count)"
Write-Host ""

$startTime = Get-Date
$downloaded = 0
$failed = 0

foreach ($table in $tables) {
    $url = "$baseUrl/$table.parquet"
    $output = "$localDataPath\$table.parquet"

    Write-Host "[$($downloaded + $failed + 1)/$($tables.Count)] Downloading $table.parquet..." -NoNewline

    try {
        $tableStart = Get-Date
        Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
        $duration = ((Get-Date) - $tableStart).TotalSeconds
        $size = [math]::Round((Get-Item $output).Length / 1MB, 2)
        Write-Host " OK ($size MB, $([math]::Round($duration, 1))s)" -ForegroundColor Green
        $downloaded++
    }
    catch {
        Write-Host " FAILED: $_" -ForegroundColor Red
        $failed++
    }
}

$totalTime = ((Get-Date) - $startTime).TotalMinutes

Write-Host ""
Write-Host "========================================"
Write-Host "Download complete!"
Write-Host "========================================"
Write-Host "  Downloaded: $downloaded"
Write-Host "  Failed: $failed"
Write-Host "  Total time: $([math]::Round($totalTime, 1)) minutes"
Write-Host ""
Write-Host "To use local data, set environment variable:"
Write-Host "  `$env:DEFEATBETA_LOCAL_DATA = `"$localDataPath`""
Write-Host ""
