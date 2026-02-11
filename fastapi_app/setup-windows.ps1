# FastAPI Windows Setup Script
# Run this from the fastapi_app directory

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FastAPI Windows Setup with uv" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if uv is installed
Write-Host "[1/8] Checking uv installation..." -ForegroundColor Yellow
try {
    $uvVersion = uv --version
    Write-Host "✓ uv found: $uvVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ uv not found. Installing..." -ForegroundColor Red
    Write-Host "Run: pip install uv" -ForegroundColor Yellow
    Write-Host "Or: powershell -ExecutionPolicy ByPass -c 'irm https://astral.sh/uv/install.ps1 | iex'" -ForegroundColor Yellow
    exit 1
}

# Check Python version
Write-Host "[2/8] Checking Python version..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($pythonVersion -match "Python 3\.(11|12)") {
    Write-Host "✓ $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "⚠ Warning: Python 3.11+ recommended. Found: $pythonVersion" -ForegroundColor Yellow
}

# Create venv
Write-Host "[3/8] Creating virtual environment..." -ForegroundColor Yellow
if (Test-Path ".venv") {
    Write-Host "✓ Virtual environment already exists" -ForegroundColor Green
} else {
    uv venv
    Write-Host "✓ Virtual environment created" -ForegroundColor Green
}

# Activate venv
Write-Host "[4/8] Activating virtual environment..." -ForegroundColor Yellow
& ".\.venv\Scripts\Activate.ps1"
Write-Host "✓ Virtual environment activated" -ForegroundColor Green

# Install PyTorch
Write-Host "[5/8] Installing PyTorch (CPU version)..." -ForegroundColor Yellow
Write-Host "  (For GPU support, manually install: uv pip install torch --index-url https://download.pytorch.org/whl/cu121)" -ForegroundColor Gray
uv pip install torch torchvision torchaudio
Write-Host "✓ PyTorch installed" -ForegroundColor Green

# Install HuggingFace packages (must be before defeatbeta-api to avoid conflicts)
Write-Host "[6/8] Installing HuggingFace packages..." -ForegroundColor Yellow
uv pip install "transformers==4.40.0" "huggingface-hub>=0.19.3,<1.0"
Write-Host "✓ HuggingFace packages installed" -ForegroundColor Green

# Install defeatbeta-api (local editable install or PyPI with --no-deps)
Write-Host "[7/8] Installing defeatbeta-api..." -ForegroundColor Yellow
$projectRoot = Split-Path -Parent $PSScriptRoot
if (Test-Path "$projectRoot\defeatbeta_api") {
    Push-Location $projectRoot
    uv pip install -e .
    Pop-Location
    Write-Host "✓ defeatbeta-api installed (editable mode)" -ForegroundColor Green
} else {
    Write-Host "⚠ Local defeatbeta_api not found, installing from PyPI with --no-deps..." -ForegroundColor Yellow
    uv pip install --no-deps "defeatbeta-api==0.0.27"
    Write-Host "✓ defeatbeta-api installed from PyPI (no deps to avoid conflicts)" -ForegroundColor Green
}

# Install remaining dependencies
Write-Host "[8/8] Installing remaining dependencies..." -ForegroundColor Yellow
uv pip install -r requirements.txt
Write-Host "✓ All dependencies installed" -ForegroundColor Green

# Create cache directory
Write-Host ""
Write-Host "Creating cache directory..." -ForegroundColor Yellow
if (-not (Test-Path ".cache\huggingface")) {
    New-Item -ItemType Directory -Force -Path ".cache\huggingface" | Out-Null
    Write-Host "✓ Cache directory created" -ForegroundColor Green
} else {
    Write-Host "✓ Cache directory already exists" -ForegroundColor Green
}

# Set environment variable
$env:HF_HOME = "$PWD\.cache\huggingface"
Write-Host "✓ HF_HOME set to: $env:HF_HOME" -ForegroundColor Green

# Download NLTK data
Write-Host ""
Write-Host "Downloading NLTK data..." -ForegroundColor Yellow
python -c "import nltk; nltk.download('punkt', quiet=True)" 2>&1 | Out-Null
Write-Host "✓ NLTK data downloaded" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the server, run:" -ForegroundColor Yellow
Write-Host "  uvicorn main:app --host 0.0.0.0 --port 8000 --reload" -ForegroundColor White
Write-Host ""
Write-Host "Or use the run.ps1 script:" -ForegroundColor Yellow
Write-Host "  .\run.ps1" -ForegroundColor White
Write-Host ""

