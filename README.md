# MultiCloudOps — Production Monitoring Dashboard

Real-time infrastructure monitoring across AWS, Azure, GCP, Oracle, Kubernetes, and On-Prem.  
Agent-based architecture: deploy lightweight agents on your servers, metrics stream live to the dashboard.

---

## Quick Start

```bash
# 1. Clone / copy this project
cd multicloudops

# 2. Start everything
docker compose up --build

# 3. Open dashboard
open http://localhost

# 4. API docs
open http://localhost:8000/docs
```

First run takes ~2 minutes to build. Subsequent starts are instant.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Browser                         │
│              http://localhost  (port 80)                │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              Frontend  (React + Nginx)                  │
│   • Dashboard, charts, alerts, incidents, SLA           │
│   • WebSocket client — receives live metrics            │
│   • Agents page — register & manage agents              │
└────────────────────────┬────────────────────────────────┘
                         │  /api/*  /ws/*  (proxied)
┌────────────────────────▼────────────────────────────────┐
│              Backend   (FastAPI)  :8000                 │
│   • REST API for all data                               │
│   • WebSocket broadcaster                              │
│   • Agent management (register, heartbeat, metrics)     │
│   • SQLite DB (swap to Postgres in Phase 2)             │
└──────────┬─────────────────────────┬────────────────────┘
           │                         │
┌──────────▼──────┐         ┌────────▼────────┐
│  SQLite volume  │         │  Redis  :6379   │
│  (agents + DB)  │         │  (Phase 2: pub/ │
└─────────────────┘         │   sub, caching) │
                            └─────────────────┘

      Servers you own (any OS, any cloud)
┌────────────┐  ┌────────────┐  ┌────────────┐
│ AWS EC2    │  │ Azure VM   │  │ On-Prem    │
│ mco_agent  │  │ mco_agent  │  │ mco_agent  │
│  ↓ push    │  │  ↓ push    │  │  ↓ push    │
│ every 30s  │  │ every 30s  │  │ every 30s  │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      └────────────────┴────────────────┘
                       │
           POST /api/agents/heartbeat
           X-Agent-Key: mco-xxxx
```

---

## Deploying an Agent

### Step 1 — Register the agent in the dashboard

1. Open **http://localhost → Agents → Register Agent**
2. Fill in name, provider, region → click **Register Agent**
3. **Copy the API key** (shown only once)

### Step 2 — Install on your server

**Option A: Direct Python (any OS)**

```bash
# On the server you want to monitor:
pip install psutil requests

# Run it
python mco_agent.py \
  --server http://YOUR_DASHBOARD_IP:8000 \
  --key mco-YOUR_KEY_HERE \
  --provider AWS \
  --region us-east-1
```

**Option B: Linux systemd service (runs on boot, auto-restarts)**

```bash
# Copy agent files to the server
scp agent/mco_agent.py agent/requirements.txt agent/install_agent.sh user@server:/tmp/

# On the server:
chmod +x /tmp/install_agent.sh
sudo /tmp/install_agent.sh \
  --server http://YOUR_DASHBOARD_IP:8000 \
  --key mco-YOUR_KEY_HERE \
  --provider AWS \
  --region us-east-1

# Check it's running:
sudo journalctl -fu mco-agent
```

**Option C: Docker (run agent in a container)**

```bash
cd agent
docker build -t mco-agent .
docker run -d \
  -e MCO_SERVER=http://YOUR_DASHBOARD_IP:8000 \
  -e MCO_API_KEY=mco-YOUR_KEY_HERE \
  -e MCO_PROVIDER=AWS \
  -e MCO_REGION=us-east-1 \
  --name mco-agent-prod \
  mco-agent
```

### Agent environment variables

| Variable         | Required | Default         | Description                          |
|------------------|----------|-----------------|--------------------------------------|
| `MCO_SERVER`     | Yes      | localhost:8000  | Dashboard URL                        |
| `MCO_API_KEY`    | Yes      | —               | Agent API key from dashboard         |
| `MCO_INTERVAL`   | No       | 30              | Push interval in seconds             |
| `MCO_PROVIDER`   | No       | On-Prem         | Cloud provider label                 |
| `MCO_REGION`     | No       | local           | Region label                         |
| `MCO_SERVER_ID`  | No       | hostname        | Unique server ID in dashboard        |
| `MCO_SERVER_NAME`| No       | hostname        | Display name in dashboard            |

---

## API Reference

Full interactive docs at **http://localhost:8000/docs**

| Method | Endpoint                    | Description                       |
|--------|-----------------------------|-----------------------------------|
| GET    | `/api/servers`              | List all servers (with filters)   |
| GET    | `/api/servers/live`         | Live metric snapshot              |
| GET    | `/api/alerts`               | List alerts                       |
| GET    | `/api/incidents`            | List incidents                    |
| GET    | `/api/stats/overview`       | Dashboard KPI stats               |
| POST   | `/api/agents/register`      | Register a new agent              |
| GET    | `/api/agents`               | List all agents + status          |
| DELETE | `/api/agents/{id}`          | Remove an agent                   |
| POST   | `/api/agents/heartbeat`     | Agent heartbeat (with metrics)    |
| POST   | `/api/agents/metrics`       | Agent full metric push            |
| WS     | `/ws/metrics`               | Live metric stream                |

---

## Project Structure

```
multicloudops/
├── docker-compose.yml
├── backend/
│   ├── main.py                 # FastAPI app + WebSocket
│   ├── core/config.py          # All settings (env var driven)
│   ├── db/
│   │   ├── database.py         # SQLAlchemy async setup
│   │   └── models.py           # Agent + AgentMetric tables
│   ├── models/schemas.py       # Pydantic request/response models
│   ├── routers/
│   │   ├── monitoring.py       # Server/alert/incident endpoints
│   │   └── agents.py           # Agent management endpoints
│   ├── services/ws_manager.py  # WebSocket connection manager
│   └── mock_data/data.py       # Phase 1 mock data
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Root component
│   │   ├── store/useStore.js   # Zustand global state
│   │   ├── hooks/useWebSocket.js  # WS hook (auto-reconnect)
│   │   ├── pages/
│   │   │   ├── AgentsPage.jsx  # Agent management UI
│   │   │   ├── OverviewPage.jsx
│   │   │   └── ...
│   │   └── components/
│   └── nginx.conf              # Proxy /api/ and /ws/ to backend
└── agent/
    ├── mco_agent.py            # The monitoring agent
    ├── requirements.txt        # psutil + requests only
    ├── Dockerfile              # Containerised agent
    ├── install_agent.sh        # Linux systemd installer
    └── mco-agent.service       # Systemd unit template
```

---

## Phase Roadmap

| Phase | Status | What |
|-------|--------|------|
| 1     | ✅ Done | Foundation: DB, agents API, Docker Compose, real WebSocket |
| 1.5   | ✅ Done | Agent script: auto-collects metrics, pushes to dashboard |
| 2     | Next   | JWT auth, PostgreSQL, user roles, metric history & graphs |
| 3     | Planned | Real cloud integrations (CloudWatch, Azure Monitor, GCP) |
| 4     | Planned | Auto-remediation, alert rules engine, runbooks |

---

## Commands

```bash
# Start
docker compose up --build          # first run
docker compose up -d               # detached

# Stop
docker compose down                # stop containers
docker compose down -v             # also wipe database volumes

# Logs
docker compose logs -f backend
docker compose logs -f frontend

# Rebuild one service
docker compose up --build backend

# Check agent heartbeats
curl http://localhost:8000/api/agents

# Test agent API key
curl -X POST http://localhost:8000/api/agents/heartbeat \
  -H "X-Agent-Key: mco-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0","servers":[]}'
```
