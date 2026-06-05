from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from db.database import get_db
from db.models import Agent, AgentMetric
from core.config import settings

router = APIRouter(prefix="/api", tags=["monitoring"])


def _now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_servers_with_agent_status(db: AsyncSession) -> list:
    metrics_result = await db.execute(select(AgentMetric))
    metrics = metrics_result.scalars().all()
    agents_result = await db.execute(select(Agent))
    agents = {a.id: a for a in agents_result.scalars().all()}
    now = _now_utc()
    servers = []
    for m in metrics:
        d = m.to_server_dict()
        agent = agents.get(m.agent_id)
        if agent:
            if agent.last_seen:
                seconds_ago = (now - agent.last_seen).total_seconds()
                if seconds_ago > settings.AGENT_OFFLINE_THRESHOLD:
                    d["status"] = "stopped"
                    d["cpu"]    = 0.0
                    d["mem"]    = 0.0
            elif agent.status == "offline":
                d["status"] = "stopped"
                d["cpu"]    = 0.0
                d["mem"]    = 0.0
        servers.append(d)
    return servers


@router.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0", "mode": "agent-driven"}


@router.get("/servers")
async def get_servers(provider: str = None, status: str = None, db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    if provider and provider != "All":
        servers = [s for s in servers if s["provider"] == provider]
    if status and status != "All":
        servers = [s for s in servers if s["status"] == status]
    return {"servers": servers, "total": len(servers)}


@router.get("/servers/live")
async def get_live_servers(db: AsyncSession = Depends(get_db)):
    return {"servers": await _get_servers_with_agent_status(db)}


@router.get("/servers/{server_id}")
async def get_server(server_id: str, db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    server = next((s for s in servers if s["id"] == server_id), None)
    return server or {"error": "Not found"}


@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    alerts = []
    for s in servers:
        if s["status"] in ("critical", "warning"):
            alerts.append({
                "id":       f"alert-{s['id']}",
                "severity": s["status"] if s["status"] == "critical" else "warning",
                "title":    f"{'Critical' if s['status'] == 'critical' else 'Warning'}: {_reason(s)}",
                "resource": f"{s['name']} ({s['provider']})",
                "source":   "Agent",
                "time":     s.get("timestamp", "—"),
                "status":   "New",
                "server":   s,
            })
    return {"alerts": alerts, "total": len(alerts)}


@router.get("/stats/overview")
async def get_overview_stats(db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    statuses = [s["status"] for s in servers]
    critical = statuses.count("critical")
    warning  = statuses.count("warning")

    # SLA: uptime of healthy servers / total
    healthy_pct = (statuses.count("healthy") / len(servers) * 100) if servers else 100.0

    return {
        "total":           len(servers),
        "healthy":         statuses.count("healthy"),
        "warning":         warning,
        "critical":        critical,
        "fluctuating":     statuses.count("fluctuating"),
        "stopped":         statuses.count("stopped"),
        "critical_alerts": critical,
        "warning_alerts":  warning,
        "open_incidents":  0,
        "sla_percent":     round(healthy_pct, 2),
        "providers":       _provider_stats(servers),
    }


def _provider_stats(servers: list) -> dict:
    providers = {}
    for s in servers:
        p = s["provider"]
        if p not in providers:
            providers[p] = {"total": 0, "healthy": 0, "warning": 0, "critical": 0, "stopped": 0}
        providers[p]["total"] += 1
        providers[p][s["status"]] = providers[p].get(s["status"], 0) + 1
    return providers


def _reason(s: dict) -> str:
    reasons = []
    cpu, mem, disk = s.get("cpu", 0), s.get("mem", 0), s.get("disk", 0)
    if cpu  >= 90: reasons.append(f"CPU {cpu}%")
    if mem  >= 90: reasons.append(f"MEM {mem}%")
    if disk >= 85: reasons.append(f"Disk {disk}%")
    if 70 <= cpu < 90: reasons.append(f"CPU {cpu}%")
    if 75 <= mem < 90: reasons.append(f"MEM {mem}%")
    return ", ".join(reasons) if reasons else "High resource usage"
