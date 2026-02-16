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

# Copy requirements
COPY requirements.txt .

# Install defeatbeta-api WITHOUT its dependencies to avoid conflicts
RUN uv pip install --system --no-cache --no-deps "defeatbeta-api==0.0.27"

# Install the rest from requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

# Copy app code
COPY main.py .
COPY sec_download.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
