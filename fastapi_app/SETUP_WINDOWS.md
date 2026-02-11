# Running FastAPI on Windows with `uv`

This guide shows how to run the FastAPI app on Windows using `uv` instead of Docker.

## Prerequisites

1. **Python 3.11** (required for compatibility with dependencies)
   - Download from [python.org](https://www.python.org/downloads/)
   - Or use `pyenv-win` if you have it

2. **Install `uv`** (if not already installed):
   ```powershell
   # Using pip
   pip install uv

   # Or using PowerShell (recommended)
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

## Setup Steps

### 1. Navigate to FastAPI directory
```powershell
cd fastapi_app
```

### 2. Create virtual environment with `uv`
```powershell
uv venv
```

### 3. Activate the virtual environment
```powershell
# PowerShell
.\.venv\Scripts\Activate.ps1

# Or if you get execution policy errors:
.\.venv\Scripts\activate.bat
```

### 4. Install PyTorch (CPU or GPU)

**For CPU-only (simpler, slower for FinBERT):**
```powershell
uv pip install torch torchvision torchaudio
```

**For GPU support (faster, requires CUDA 12.1+):**
```powershell
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 5. Install HuggingFace packages
```powershell
uv pip install "transformers==4.40.0" "huggingface_hub==0.24.0"
```

### 6. Install defeatbeta-api

Since you have a local `defeatbeta_api` directory in the project root, you can install it in editable mode:

```powershell
# From the project root (not fastapi_app)
cd ..
uv pip install -e .
```

Or if you want to install from PyPI (but you'll miss local changes):
```powershell
uv pip install --no-deps "defeatbeta-api==0.0.27"
```

### 7. Install remaining dependencies
```powershell
cd fastapi_app
uv pip install -r requirements.txt
```

### 8. Set environment variables

**PowerShell:**
```powershell
$env:HF_HOME = "$PWD\.cache\huggingface"
```

**Or create a `.env` file** (recommended):
```powershell
# Create .env file
@"
HF_HOME=$PWD\.cache\huggingface
"@ | Out-File -FilePath .env -Encoding utf8
```

### 9. Create cache directory
```powershell
New-Item -ItemType Directory -Force -Path ".cache\huggingface"
```

### 10. Download NLTK data (first time only)
```powershell
python -c "import nltk; nltk.download('punkt', quiet=True)"
```

## Running the Server

```powershell
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables auto-reload on code changes (useful for development).

## Potential Issues & Solutions

### Issue 1: `defeatbeta_api` not found
**Solution:** Make sure you installed it. If using local version:
```powershell
# From project root
cd ..
uv pip install -e .
cd fastapi_app
```

### Issue 2: DuckDB extension installation fails
**Solution:** DuckDB's `cache_httpfs` extension should install automatically. If it fails, check your internet connection - it downloads from the community repository.

### Issue 3: FinBERT model download is slow
**Solution:** This is normal on first run. The model (~500MB) will be cached in `.cache\huggingface`. Subsequent runs will be faster.

### Issue 4: GPU not detected
**Solution:** 
- Check CUDA installation: `nvidia-smi`
- Verify PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- If False, reinstall PyTorch with CUDA support (step 4 above)

### Issue 5: Port 8000 already in use
**Solution:** Use a different port:
```powershell
uvicorn main:app --host 0.0.0.0 --port 8001
```

## Performance Notes

- **CPU mode**: FinBERT sentiment analysis will be slower (~2-5x) but still functional
- **GPU mode**: Much faster for FinBERT, but requires NVIDIA GPU with CUDA 12.1+
- **DuckDB**: Works identically on Windows (in-memory database)
- **Multithreading**: Works the same on Windows

## Advantages of Windows Setup

✅ Faster iteration (no Docker rebuilds)  
✅ Easier debugging (direct access to Python debugger)  
✅ Better IDE integration  
✅ No Docker overhead  

## Disadvantages

❌ GPU setup more complex than Docker  
❌ Environment not as isolated  
❌ Need to manage Python version manually  

## Quick Start Script

Create `run.ps1` in `fastapi_app/`:

```powershell
# run.ps1
$env:HF_HOME = "$PWD\.cache\huggingface"
if (-not (Test-Path ".cache\huggingface")) {
    New-Item -ItemType Directory -Force -Path ".cache\huggingface"
}
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Then run:
```powershell
.\run.ps1
```

