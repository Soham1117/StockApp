#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
HOST="soham@100.99.203.74"
SSH_KEY="$HOME/.ssh/lightsail.pem"
REMOTE_DIR="/home/soham/stockapp-backend"
LOCAL_BACKEND="$(dirname "$0")/backend"
LOCAL_DEFEATBETA="$(dirname "$0")/defeatbeta_api"

SSH_CMD="ssh -i $SSH_KEY $HOST"
SCP_CMD="scp -i $SSH_KEY"

# ── Files to deploy ────────────────────────────────────────────
PY_FILES=(
  main.py
  database.py
  factor_scoring.py
  insight_jobs.py
  investment_signal.py
  rrg_history.py
  rrg_predictions.py
  sec_download.py
  sec_insights.py
  transcript_insights.py
  valuation_models.py
  yahoo_dcf_data.py
)

# Only tables that exist on HuggingFace (verified 2026-02-16)
PARQUET_TABLES=(
  stock_profile stock_officers stock_tailing_eps
  stock_earning_calendar stock_statement stock_prices
  stock_dividend_events stock_split_events exchange_rate
  daily_treasury_yield stock_earning_call_transcripts stock_news
  stock_revenue_breakdown stock_shares_outstanding stock_sec_filing
)

echo "==> Deploying backend to $HOST:$REMOTE_DIR"

# ── 1. Create remote directory structure ───────────────────────
echo "--- Creating remote directories..."
$SSH_CMD "mkdir -p $REMOTE_DIR/data/sec_filings $REMOTE_DIR/data/sec_insights $REMOTE_DIR/local_data $REMOTE_DIR/defeatbeta_api"

# ── 2. Upload Python files + requirements ──────────────────────
echo "--- Uploading Python files..."
for f in "${PY_FILES[@]}"; do
  $SCP_CMD "$LOCAL_BACKEND/$f" "$HOST:$REMOTE_DIR/$f"
done
$SCP_CMD "$LOCAL_BACKEND/requirements.txt" "$HOST:$REMOTE_DIR/requirements.txt"

# ── 3. Upload defeatbeta_api package ───────────────────────────
echo "--- Uploading defeatbeta_api package..."
$SCP_CMD -r "$LOCAL_DEFEATBETA/" "$HOST:$REMOTE_DIR/defeatbeta_api/"

# ── 4. Upload .env if it exists locally (won't overwrite remote)
if [ -f "$LOCAL_BACKEND/.env" ]; then
  echo "--- Uploading .env..."
  $SCP_CMD "$LOCAL_BACKEND/.env" "$HOST:$REMOTE_DIR/.env.new"
  $SSH_CMD "[ -f $REMOTE_DIR/.env ] || mv $REMOTE_DIR/.env.new $REMOTE_DIR/.env"
  $SSH_CMD "rm -f $REMOTE_DIR/.env.new"
fi

# ── 5. Download parquet files on server ────────────────────────
echo "--- Downloading parquet data files on server..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
cd /home/soham/stockapp-backend/local_data

BASE_URL="https://huggingface.co/datasets/bwzheng2010/yahoo-finance-data/resolve/main/data"
TABLES=(
  stock_profile stock_officers stock_tailing_eps
  stock_earning_calendar stock_statement stock_prices
  stock_dividend_events stock_split_events exchange_rate
  daily_treasury_yield stock_earning_call_transcripts stock_news
  stock_revenue_breakdown stock_shares_outstanding stock_sec_filing
)

for table in "${TABLES[@]}"; do
  FILE="${table}.parquet"
  if [ -f "$FILE" ]; then
    echo "  [skip] $FILE already exists"
  else
    echo "  [download] $FILE ..."
    curl -fSL -o "$FILE" "$BASE_URL/$FILE"
  fi
done

echo "Parquet files ready"
REMOTE_SCRIPT

# ── 6. Install / update dependencies on remote ────────────────
echo "--- Installing dependencies..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
cd /home/soham/stockapp-backend

# Install Python 3.11+ if not present
if ! command -v python3 &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
fi

# Create venv if missing
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "Created new virtualenv"
fi

source .venv/bin/activate

pip install --upgrade pip -q

# Install defeatbeta_api from the uploaded local copy
pip install -e ./defeatbeta_api 2>/dev/null || pip install --no-deps "defeatbeta-api" -q

pip install gunicorn -q
pip install -r requirements.txt -q

# Download NLTK data if needed
python3 -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True)" 2>/dev/null || true

echo "Dependencies installed OK"
REMOTE_SCRIPT

# ── 7. Create / update systemd service ────────────────────────
echo "--- Setting up systemd service..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail

# Create gunicorn config
cat > /home/soham/stockapp-backend/gunicorn.conf.py << 'GUNICORN_EOF'
bind = "127.0.0.1:8001"
workers = 1
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 300
keepalive = 5
accesslog = "-"
errorlog = "-"
loglevel = "info"
GUNICORN_EOF

# Create systemd unit
sudo tee /etc/systemd/system/stockapp-backend.service > /dev/null << 'UNIT_EOF'
[Unit]
Description=StockApp FastAPI Backend
After=network.target

[Service]
User=soham
Group=soham
WorkingDirectory=/home/soham/stockapp-backend
EnvironmentFile=/home/soham/stockapp-backend/.env
Environment=DEFEATBETA_LOCAL_DATA=/home/soham/stockapp-backend/local_data
ExecStart=/home/soham/stockapp-backend/.venv/bin/gunicorn main:app -c /home/soham/stockapp-backend/gunicorn.conf.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT_EOF

sudo systemctl daemon-reload
sudo systemctl enable stockapp-backend
sudo systemctl restart stockapp-backend

echo "Service restarted"
REMOTE_SCRIPT

# ── 8. Set up nginx reverse proxy (idempotent) ────────────────
echo "--- Configuring nginx..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y nginx
fi

sudo tee /etc/nginx/sites-available/stockapp-backend > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name stockapi.aetherdash.xyz;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }
}
NGINX_EOF

sudo ln -sf /etc/nginx/sites-available/stockapp-backend /etc/nginx/sites-enabled/stockapp-backend
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "nginx configured"
REMOTE_SCRIPT

# ── 9. Set up SSL with Certbot ─────────────────────────────────
echo "--- Setting up SSL..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail

if ! command -v certbot &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx
fi

# Only request cert if not already present
if [ ! -d /etc/letsencrypt/live/stockapi.aetherdash.xyz ]; then
  sudo certbot --nginx -d stockapi.aetherdash.xyz --non-interactive --agree-tos -m soham@aetherdash.xyz --redirect
  echo "SSL certificate installed"
else
  echo "SSL certificate already exists"
fi
REMOTE_SCRIPT

# ── 10. Verify ─────────────────────────────────────────────────
echo "--- Verifying deployment..."
sleep 3
$SSH_CMD "curl -sf http://127.0.0.1:8001/docs > /dev/null && echo 'Backend is UP' || echo 'Backend may still be starting...'"
$SSH_CMD "sudo systemctl status stockapp-backend --no-pager -l | head -15"

echo ""
echo "==> Deployment complete!"
echo "    Backend: https://stockapi.aetherdash.xyz  (public IP: 44.197.214.28)"
echo "    Logs:    ssh -i $SSH_KEY $HOST 'journalctl -u stockapp-backend -f'"
