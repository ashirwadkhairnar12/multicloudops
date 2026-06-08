"""
Monitoring router — unified data from agent DB + cloud resource cache.
"""
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
    metrics        = metrics_result.scalars().all()
    agents_result  = await db.execute(select(Agent))
    agents         = {a.id: a for a in agents_result.scalars().all()}
    now = _now_utc()
    servers = []
    for m in metrics:
        d     = m.to_server_dict()
        agent = agents.get(m.agent_id)
        if agent and agent.last_seen:
            age = (now - agent.last_seen).total_seconds()
            if age > settings.AGENT_OFFLINE_THRESHOLD:
                d["status"] = "stopped"
                d["cpu"]    = 0.0
                d["mem"]    = 0.0
        elif agent and agent.status == "offline":
            d["status"] = "stopped"
            d["cpu"]    = 0.0
            d["mem"]    = 0.0
        servers.append(d)
    return servers


def _get_cloud_resources() -> list:
    """Pull all cloud resources from the in-memory cache."""
    try:
        from services.cloud.poller import _cache
        resources = []
        for cached in _cache.values():
            resources.extend(cached["data"].get("resources", []))
        return resources
    except Exception:
        return []


@router.get("/health")
def health():
    return {"status": "ok", "version": "3.0.0", "mode": "agent+cloud"}


@router.get("/servers")
async def get_servers(
    provider: str = None,
    status:   str = None,
    source:   str = None,  # 'agent' | 'cloud' | None = all
    db: AsyncSession = Depends(get_db),
):
    servers = await _get_servers_with_agent_status(db)
    cloud   = [r for r in _get_cloud_resources()
               if not any(s["id"] == r["id"] for s in servers)]

    if source == "cloud":
        all_resources = cloud
    elif source == "all":
        all_resources = servers + cloud
    else:
        # Default: agent servers only — cloud resources are fetched separately by the frontend
        all_resources = servers

    if provider and provider != "All":
        all_resources = [s for s in all_resources if s.get("provider") == provider]
    if status and status != "All":
        all_resources = [s for s in all_resources if s.get("status")   == status]

    return {"servers": all_resources, "total": len(all_resources)}


@router.get("/servers/live")
async def get_live_servers(db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    cloud   = [r for r in _get_cloud_resources()
               if not any(s["id"] == r["id"] for s in servers)]
    return {"servers": servers + cloud}


@router.get("/servers/{server_id}")
async def get_server(server_id: str, db: AsyncSession = Depends(get_db)):
    servers = await _get_servers_with_agent_status(db)
    cloud   = _get_cloud_resources()
    all_res = servers + cloud
    server  = next((s for s in all_res if s["id"] == server_id), None)
    return server or {"error": "Not found"}


@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    """
    Alerts from BOTH agent servers AND cloud resources.
    Critical/warning status → alert entry.
    """
    agent_servers  = await _get_servers_with_agent_status(db)
    cloud_resources= _get_cloud_resources()
    all_resources  = agent_servers + cloud_resources

    alerts = []
    for s in all_resources:
        svc    = s.get("service", s.get("type", "Server"))
        source = "CloudWatch" if s.get("account_id") else "Agent"
        if s["status"] == "critical":
            alerts.append({
                "id":       f"alert-{s['id']}",
                "severity": "critical",
                "title":    f"Critical: {_reason(s)}",
                "resource": f"{s['name']} ({s.get('provider','?')})",
                "source":   source,
                "service":  svc,
                "time":     s.get("timestamp", "—"),
                "status":   "New",
                "server":   s,
            })
        elif s["status"] == "warning":
            alerts.append({
                "id":       f"alert-{s['id']}",
                "severity": "warning",
                "title":    f"Warning: {_reason(s)}",
                "resource": f"{s['name']} ({s.get('provider','?')})",
                "source":   source,
                "service":  svc,
                "time":     s.get("timestamp", "—"),
                "status":   "New",
                "server":   s,
            })
    return {"alerts": alerts, "total": len(alerts)}



@router.get("/stats/overview")
async def get_overview_stats(db: AsyncSession = Depends(get_db)):
    agent_servers  = await _get_servers_with_agent_status(db)
    cloud_resources= _get_cloud_resources()
    all_resources  = agent_servers + cloud_resources

    statuses  = [s["status"] for s in all_resources]
    critical  = statuses.count("critical")
    warning   = statuses.count("warning")
    healthy   = statuses.count("healthy")
    total     = len(all_resources)
    sla_pct   = round((healthy / total * 100), 2) if total > 0 else 100.0

    # Pull cost totals from cloud cache
    total_cost = 0.0
    try:
        from services.cloud.poller import _cache
        for cached in _cache.values():
            total_cost += cached["data"].get("costs", {}).get("total_mtd", 0)
    except Exception:
        pass

    return {
        "total":           total,
        "healthy":         healthy,
        "warning":         warning,
        "critical":        critical,
        "fluctuating":     statuses.count("fluctuating"),
        "stopped":         statuses.count("stopped"),
        "critical_alerts": critical,
        "warning_alerts":  warning,
        "open_incidents":  0,
        "sla_percent":     sla_pct,
        "total_cost_mtd":  round(total_cost, 2),
        "agent_count":     len(agent_servers),
        "cloud_count":     len(cloud_resources),
        "providers":       _provider_stats(all_resources),
    }


def _provider_stats(servers: list) -> dict:
    providers = {}
    for s in servers:
        p = s.get("provider", "Unknown")
        if p not in providers:
            providers[p] = {"total":0,"healthy":0,"warning":0,"critical":0,"stopped":0}
        providers[p]["total"] += 1
        providers[p][s.get("status","healthy")] = providers[p].get(s.get("status","healthy"),0) + 1
    return providers


def _reason(s: dict) -> str:
    reasons = []
    cpu  = s.get("cpu",  0) or 0
    mem  = s.get("mem",  0) or 0
    disk = s.get("disk", 0) or 0
    if cpu  >= 90: reasons.append(f"CPU {cpu}%")
    if mem  >= 90: reasons.append(f"MEM {mem}%")
    if disk >= 85: reasons.append(f"Disk {disk}%")
    if 70 <= cpu  < 90: reasons.append(f"CPU {cpu}%")
    if 75 <= mem  < 90: reasons.append(f"MEM {mem}%")
    # Lambda / ALB special
    er = s.get("error_rate", 0)
    if er > 5: reasons.append(f"Error rate {er}%")
    return ", ".join(reasons) if reasons else "High resource usage"
