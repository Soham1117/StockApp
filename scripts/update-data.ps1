# =============================================================================
# Weekly Data Update Script for QuantDash
# =============================================================================
# This script:
# 1. Downloads parquet files from HuggingFace
# 2. Patches the installed defeatbeta_api to use local files
# 3. Starts FastAPI server
# 4. Generates ticker universe and sector stocks
# 5. Generates sector metrics
# =============================================================================

param(
    [switch]$SkipDownload,      # Skip downloading parquet files
    [switch]$SkipMetrics,       # Skip generating sector metrics
    [int]$BatchSize = 100,      # Batch size for metrics generation
    [float]$BatchDelay = 0      # Delay between batches
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "D:\Personal Projects\StockApp"
$FastAPIDir = "$ProjectRoot\backend"
$LocalDataPath = "$FastAPIDir\local_data"
$VenvPackages = "$FastAPIDir\.venv\Lib\site-packages\defeatbeta_api"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  QuantDash Weekly Data Update" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# Step 1: Download parquet files from HuggingFace
# =============================================================================
if (-not $SkipDownload) {
    Write-Host "[Step 1/5] Downloading parquet files from HuggingFace..." -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Path $LocalDataPath)) {
        New-Item -ItemType Directory -Force -Path $LocalDataPath | Out-Null
        Write-Host "  Created directory: $LocalDataPath"
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
    $downloaded = 0
    $failed = 0
    $downloadStart = Get-Date

    foreach ($table in $tables) {
        $url = "$baseUrl/$table.parquet"
        $output = "$LocalDataPath\$table.parquet"

        Write-Host "  [$($downloaded + $failed + 1)/$($tables.Count)] $table.parquet... " -NoNewline

        try {
            $tableStart = Get-Date
            Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
            $duration = ((Get-Date) - $tableStart).TotalSeconds
            $size = [math]::Round((Get-Item $output).Length / 1MB, 2)
            Write-Host "OK ($size MB, $([math]::Round($duration, 1))s)" -ForegroundColor Green
            $downloaded++
        }
        catch {
            Write-Host "FAILED" -ForegroundColor Red
            Write-Host "    Error: $_" -ForegroundColor Red
            $failed++
        }
    }

    $downloadTime = ((Get-Date) - $downloadStart).TotalMinutes
    Write-Host ""
    Write-Host "  Download complete: $downloaded succeeded, $failed failed ($([math]::Round($downloadTime, 1)) min)" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "[Step 1/5] Skipping download (--SkipDownload)" -ForegroundColor DarkGray
    Write-Host ""
}

# =============================================================================
# Step 2: Patch installed defeatbeta_api to use local files
# =============================================================================
Write-Host "[Step 2/5] Patching defeatbeta_api to use local files..." -ForegroundColor Yellow

# Copy modified files from local defeatbeta_api to installed package
$filesToCopy = @(
    @{ src = "$ProjectRoot\defeatbeta_api\client\hugging_face_client.py"; dst = "$VenvPackages\client\hugging_face_client.py" },
    @{ src = "$ProjectRoot\defeatbeta_api\__init__.py"; dst = "$VenvPackages\__init__.py" }
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file.src) {
        Copy-Item -Path $file.src -Destination $file.dst -Force
        Write-Host "  Copied: $($file.src | Split-Path -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "  Warning: Source not found: $($file.src)" -ForegroundColor Yellow
    }
}
Write-Host ""

# =============================================================================
# Step 3: Start FastAPI server in background
# =============================================================================
Write-Host "[Step 3/5] Starting FastAPI server..." -ForegroundColor Yellow

# Check if FastAPI is already running
$existingProcess = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "  FastAPI already running on port 8000" -ForegroundColor Cyan
} else {
    # Start FastAPI in a new PowerShell window
    $fastapiScript = @"
cd '$FastAPIDir'
& '.\.venv\Scripts\Activate.ps1'
`$env:HF_HOME = '$FastAPIDir\.cache\huggingface'
`$env:DEFEATBETA_LOCAL_DATA = '$LocalDataPath'
Write-Host 'FastAPI starting with local data...' -ForegroundColor Cyan
uvicorn main:app --host 0.0.0.0 --port 8000
"@

    Start-Process powershell -ArgumentList "-NoExit", "-Command", $fastapiScript
    Write-Host "  Started FastAPI in new window" -ForegroundColor Green

    # Wait for server to be ready
    Write-Host "  Waiting for server to start..." -NoNewline
    $maxWait = 60
    $waited = 0
    while ($waited -lt $maxWait) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host " Ready!" -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 2
            $waited += 2
            Write-Host "." -NoNewline
        }
    }

    if ($waited -ge $maxWait) {
        Write-Host " Timeout!" -ForegroundColor Red
        Write-Host "  Please check the FastAPI window for errors" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host ""

# =============================================================================
# Step 4: Generate ticker universe and sector stocks
# =============================================================================
Write-Host "[Step 4/5] Generating ticker universe..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    # Activate venv and run script
    & "$FastAPIDir\.venv\Scripts\Activate.ps1"
    $env:DEFEATBETA_LOCAL_DATA = $LocalDataPath

    python "$ProjectRoot\scripts\generate-universe.py"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Error generating universe" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
Write-Host ""

# =============================================================================
# Step 5: Generate sector metrics
# =============================================================================
if (-not $SkipMetrics) {
    Write-Host "[Step 5/5] Generating sector metrics..." -ForegroundColor Yellow
    Write-Host "  Batch size: $BatchSize, Delay: $BatchDelay" -ForegroundColor DarkGray

    Push-Location $ProjectRoot
    try {
        python "$ProjectRoot\scripts\generate-sector-metrics.py" --batch-size $BatchSize --batch-delay $BatchDelay

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Error generating metrics" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[Step 5/5] Skipping metrics generation (--SkipMetrics)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Data update complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output files:" -ForegroundColor Cyan
Write-Host "    - data\ticker-universe.json"
Write-Host "    - data\sector-stocks.json"
Write-Host "    - data\sector-metrics.json"
Write-Host ""
Write-Host "  FastAPI is still running. Close its window when done." -ForegroundColor Yellow
Write-Host ""
