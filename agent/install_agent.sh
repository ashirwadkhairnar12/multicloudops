#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  MultiCloudOps Agent — Linux Installer
#  Installs the agent as a systemd service.
#
#  Usage:
#    curl -sSL http://your-dashboard/install.sh | bash -s -- \
#      --server http://your-dashboard:8000 \
#      --key mco-YOUR_KEY_HERE
#
#  Or download and run:
#    chmod +x install_agent.sh
#    ./install_agent.sh --server http://192.168.1.10:8000 --key mco-abc123
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_DIR="/opt/mco-agent"
SERVICE_NAME="mco-agent"
AGENT_USER="mco-agent"
PYTHON_BIN="$(command -v python3 || command -v python)"

# ── Parse args ────────────────────────────────────────────────────
SERVER_URL=""
API_KEY=""
PROVIDER="On-Prem"
REGION="local"
INTERVAL=30

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)   SERVER_URL="$2"; shift 2 ;;
    --key)      API_KEY="$2";    shift 2 ;;
    --provider) PROVIDER="$2";  shift 2 ;;
    --region)   REGION="$2";    shift 2 ;;
    --interval) INTERVAL="$2";  shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

[[ -z "$SERVER_URL" ]] && { echo "ERROR: --server required"; exit 1; }
[[ -z "$API_KEY"    ]] && { echo "ERROR: --key required";    exit 1; }

echo ""
echo "  MultiCloudOps Agent Installer"
echo "  ─────────────────────────────"
echo "  Dashboard : $SERVER_URL"
echo "  Install to: $INSTALL_DIR"
echo ""

# ── Create user ────────────────────────────────────────────────────
if ! id "$AGENT_USER" &>/dev/null; then
  echo "▸ Creating system user: $AGENT_USER"
  useradd --system --no-create-home --shell /bin/false "$AGENT_USER"
fi

# ── Install dir ────────────────────────────────────────────────────
echo "▸ Setting up $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp "$(dirname "$0")/mco_agent.py" "$INSTALL_DIR/"
cp "$(dirname "$0")/requirements.txt" "$INSTALL_DIR/"

# ── Python venv ────────────────────────────────────────────────────
echo "▸ Installing Python dependencies"
"$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

# ── Systemd service ────────────────────────────────────────────────
echo "▸ Installing systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=MultiCloudOps Monitoring Agent
After=network.target

[Service]
Type=simple
User=${AGENT_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=MCO_SERVER=${SERVER_URL}
Environment=MCO_API_KEY=${API_KEY}
Environment=MCO_INTERVAL=${INTERVAL}
Environment=MCO_PROVIDER=${PROVIDER}
Environment=MCO_REGION=${REGION}
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/mco_agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

chown -R "$AGENT_USER:$AGENT_USER" "$INSTALL_DIR"

# ── Enable & start ─────────────────────────────────────────────────
echo "▸ Starting service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo ""
  echo "  ✓ Agent is running!"
  echo ""
  echo "  Useful commands:"
  echo "    systemctl status $SERVICE_NAME"
  echo "    journalctl -fu $SERVICE_NAME"
  echo "    systemctl stop $SERVICE_NAME"
  echo ""
else
  echo "  ✗ Agent failed to start. Check logs:"
  echo "    journalctl -u $SERVICE_NAME --no-pager -n 30"
  exit 1
fi
