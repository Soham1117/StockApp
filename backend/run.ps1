# Quick start script for FastAPI on Windows
# Make sure you've run setup-windows.ps1 first

# Get the directory where this script is located (backend)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Change to backend directory
Push-Location $ScriptDir

try {

    # Set environment variables (use absolute paths)
    $env:HF_HOME = "$ScriptDir\.cache\huggingface"
    $env:DEFEATBETA_LOCAL_DATA = "$ScriptDir\local_data"

    # Ensure cache directory exists
    if (-not (Test-Path ".cache\huggingface")) {
        New-Item -ItemType Directory -Force -Path ".cache\huggingface" | Out-Null
    }

    # Ensure local_data directory exists
    if (-not (Test-Path "local_data")) {
        New-Item -ItemType Directory -Force -Path "local_data" | Out-Null
        Write-Host "Created local_data directory. Run scripts/download-parquet-data.ps1 to download data files." -ForegroundColor Yellow
    }

    # Start server
    Write-Host "Starting FastAPI server on http://0.0.0.0:8000" -ForegroundColor Cyan
    Write-Host "Working directory: $ScriptDir" -ForegroundColor Gray
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host ""

    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
}
finally {
    # Restore original directory
    Pop-Location
}

