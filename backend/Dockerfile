# Use full Python image instead of slim
FROM python:3.11

# Optional: system deps (curl for downloads).
# Full image already includes bash and build tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast package installer)
RUN pip install --no-cache-dir uv

WORKDIR /app

# Hugging Face cache
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface

# Copy requirements
COPY requirements.txt .

# 1) Install PyTorch with CUDA 12.1 wheels
RUN uv pip install --system --no-cache torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121

# 2) Install Hugging Face core stack
# (these versions are known to work with ProsusAI/finbert)
RUN uv pip install --system --no-cache \
    "transformers==4.40.0" \
    "huggingface_hub==0.24.0"

# 3) Install defeatbeta-api WITHOUT its dependencies
# to avoid forcing incompatible huggingface-hub versions
RUN uv pip install --system --no-cache --no-deps "defeatbeta-api==0.0.27"

# 4) Install the rest from requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

# Copy app code
COPY main.py .
COPY sec_download.py .

# Ensure cache directory exists
RUN mkdir -p /app/.cache/huggingface

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
