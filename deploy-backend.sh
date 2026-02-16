#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
HOST="soham@100.99.203.74"
SSH_KEY="$HOME/.ssh/lightsail.pem"
REMOTE_DIR="/home/soham/stockapp-backend"
LOCAL_BACKEND="$(dirname "$0")/backend"
LOCAL_DEFEATBETA="$(dirname "$0")/defeatbeta_api"

SSH_CMD="ssh -i $SSH_KEY $HOST"
SSH_TTY="ssh -t -i $SSH_KEY $HOST"  # TTY for sudo password prompts
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

# ── 1. Clean old deployment (preserve .env, local_data, .venv) ─
echo "--- Cleaning old deployment (keeping .env, local_data/, .venv/)..."
$SSH_TTY "
  set -euo pipefail
  DIR=/home/soham/stockapp-backend
  if [ -d \"\$DIR\" ]; then
    sudo systemctl stop stockapp-backend 2>/dev/null || true
    find \"\$DIR\" -mindepth 1 -maxdepth 1 \
      ! -name '.env' \
      ! -name 'local_data' \
      ! -name '.venv' \
      -exec rm -rf {} +
    echo 'Old files cleaned'
  else
    echo 'No existing deployment found'
  fi
  mkdir -p \"\$DIR/data/sec_filings\" \"\$DIR/data/sec_insights\" \"\$DIR/local_data\" \"\$DIR/defeatbeta_api\"
"

# ── 2. Upload Python files + requirements ──────────────────────
echo "--- Uploading Python files..."
for f in "${PY_FILES[@]}"; do
  $SCP_CMD "$LOCAL_BACKEND/$f" "$HOST:$REMOTE_DIR/$f"
done
$SCP_CMD "$LOCAL_BACKEND/requirements.txt" "$HOST:$REMOTE_DIR/requirements.txt"

# ── 3. Upload data files (RRG history, ETF prices, etc.) ──────
LOCAL_DATA="$(dirname "$0")/data"
echo "--- Uploading data files..."
if [ -d "$LOCAL_DATA" ]; then
  for f in "$LOCAL_DATA"/*.json; do
    [ -f "$f" ] && $SCP_CMD "$f" "$HOST:$REMOTE_DIR/data/$(basename "$f")"
  done
  echo "Data files uploaded"
else
  echo "Warning: No local data/ directory found, skipping"
fi

# ── 4. Upload defeatbeta_api package (tar to preserve directory structure)
echo "--- Uploading defeatbeta_api package..."
tar --exclude='__pycache__' --exclude='*.pyc' \
  -cf - -C "$(dirname "$LOCAL_DEFEATBETA")" "$(basename "$LOCAL_DEFEATBETA")" \
  | $SSH_CMD "tar -xf - -C $REMOTE_DIR"

# ── 5. Upload .env if it exists locally (won't overwrite remote)
if [ -f "$LOCAL_BACKEND/.env" ]; then
  echo "--- Uploading .env..."
  $SCP_CMD "$LOCAL_BACKEND/.env" "$HOST:$REMOTE_DIR/.env.new"
  $SSH_CMD "[ -f $REMOTE_DIR/.env ] || mv $REMOTE_DIR/.env.new $REMOTE_DIR/.env"
  $SSH_CMD "rm -f $REMOTE_DIR/.env.new"
fi

# ── 6. Download parquet files on server ────────────────────────
echo "--- Downloading parquet data files on server..."
$SSH_CMD "
  set -euo pipefail
  cd /home/soham/stockapp-backend/local_data

  BASE_URL='https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main/data'
  TABLES=(
    stock_profile stock_officers stock_tailing_eps
    stock_earning_calendar stock_statement stock_prices
    stock_dividend_events stock_split_events exchange_rate
    daily_treasury_yield stock_earning_call_transcripts stock_news
    stock_revenue_breakdown stock_shares_outstanding stock_sec_filing
  )

  for table in \"\${TABLES[@]}\"; do
    FILE=\"\${table}.parquet\"
    if [ -f \"\$FILE\" ]; then
      echo \"  [skip] \$FILE already exists\"
    else
      echo \"  [download] \$FILE ...\"
      curl -fSL -o \"\$FILE\" \"\$BASE_URL/\$FILE\"
    fi
  done

  echo 'Parquet files ready'
"

# ── 7. Install / update dependencies on remote ────────────────
echo "--- Installing dependencies..."
$SSH_CMD "
  set -euo pipefail
  cd /home/soham/stockapp-backend

  if ! command -v python3 &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
  fi

  if [ ! -d .venv ]; then
    python3 -m venv .venv
    echo 'Created new virtualenv'
  fi

  source .venv/bin/activate

  pip install --upgrade pip -q

  # defeatbeta_api is imported directly from the working directory (custom v0.0.42 with local data support)
  # Remove any PyPI-installed version that would shadow our custom local copy
  pip uninstall defeatbeta-api -y 2>/dev/null || true

  pip install gunicorn -q
  pip install -r requirements.txt -q

  # Download NLTK data if needed
  python3 -c \"import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True)\" 2>/dev/null || true

  echo 'Dependencies installed OK'
"

# ── 8. Create gunicorn config (no sudo needed) ────────────────
echo "--- Creating gunicorn config..."
$SSH_CMD "cat > /home/soham/stockapp-backend/gunicorn.conf.py << 'EOF'
bind = \"127.0.0.1:8001\"
workers = 1
worker_class = \"uvicorn.workers.UvicornWorker\"
timeout = 300
keepalive = 5
accesslog = \"-\"
errorlog = \"-\"
loglevel = \"info\"
EOF
echo 'gunicorn.conf.py created'
"

# ── 9. Set up systemd service (needs sudo - TTY for password) ─
echo "--- Setting up systemd service (may prompt for sudo password)..."
$SSH_TTY "
  sudo tee /etc/systemd/system/stockapp-backend.service > /dev/null << 'EOF'
[Unit]
Description=StockApp FastAPI Backend
After=network.target

[Service]
User=soham
Group=soham
WorkingDirectory=/home/soham/stockapp-backend
EnvironmentFile=-/home/soham/stockapp-backend/.env
Environment=DEFEATBETA_LOCAL_DATA=/home/soham/stockapp-backend/local_data
ExecStart=/home/soham/stockapp-backend/.venv/bin/gunicorn main:app -c /home/soham/stockapp-backend/gunicorn.conf.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable stockapp-backend
  sudo systemctl restart stockapp-backend
  echo 'Service restarted'
"

# ── 10. Set up nginx reverse proxy (needs sudo) ───────────────
echo "--- Configuring nginx (may prompt for sudo password)..."
$SSH_TTY "
  if ! command -v nginx &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y nginx
  fi

  sudo tee /etc/nginx/sites-available/stockapp-backend > /dev/null << 'EOF'
server {
    listen 80;
    server_name stockapi.aetherdash.xyz;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }
}
EOF

  sudo ln -sf /etc/nginx/sites-available/stockapp-backend /etc/nginx/sites-enabled/stockapp-backend
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx

  echo 'nginx configured'
"

# ── 11. Set up SSL with Certbot (needs sudo) ──────────────────
echo "--- Setting up SSL..."
$SSH_TTY "
  if ! command -v certbot &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx
  fi

  if [ ! -d /etc/letsencrypt/live/stockapi.aetherdash.xyz ]; then
    sudo certbot --nginx -d stockapi.aetherdash.xyz --non-interactive --agree-tos -m soham@aetherdash.xyz --redirect
    echo 'SSL certificate installed'
  else
    echo 'SSL certificate already exists'
  fi
"

# ── 12. Verify ─────────────────────────────────────────────────
echo "--- Verifying deployment..."
sleep 3
$SSH_CMD "curl -sf http://127.0.0.1:8001/docs > /dev/null && echo 'Backend is UP' || echo 'Backend may still be starting...'"
$SSH_TTY "sudo systemctl status stockapp-backend --no-pager -l | head -15"

echo ""
echo "==> Deployment complete!"
echo "    Backend: https://stockapi.aetherdash.xyz  (public IP: 44.197.214.28)"
echo "    Logs:    ssh -i $SSH_KEY $HOST 'journalctl -u stockapp-backend -f'"
