"""
Agent Management Router — Phase 1

Endpoints for:
  POST /api/agents/register     → register a new agent, get API key
  GET  /api/agents              → list all agents + status
  GET  /api/agents/{id}         → agent detail
  DELETE /api/agents/{id}       → remove agent
  POST /api/agents/heartbeat    → agent sends heartbeat + optional metrics
  POST /api/agents/metrics      → agent pushes full metric batch

Authentication:
  Phase 1: simple API-key header (X-Agent-Key)
  Phase 2: JWT + role-based access
"""
import secrets
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional

from db.database import get_db
from db.models import Agent, AgentMetric
from models.schemas import (
    AgentRegisterRequest,
    AgentRegisterResponse,
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentMetricPushRequest,
)
from services.ws_manager import manager
from core.config import settings

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = logging.getLogger(__name__)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_agent_by_key(api_key: str, db: AsyncSession) -> Agent:
    """Dependency: validate X-Agent-Key and return the Agent."""
    result = await db.execute(select(Agent).where(Agent.api_key == api_key))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Invalid agent API key")
    return agent


# ── Register ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AgentRegisterResponse)
async def register_agent(
    payload: AgentRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new monitoring agent.
    Returns a unique API key the agent must include in all future requests.
    """
    agent_id = f"agent-{secrets.token_hex(6)}"
    api_key = f"mco-{secrets.token_urlsafe(32)}"

    agent = Agent(
        id=agent_id,
        name=payload.name,
        description=payload.description or "",
        provider=payload.provider or "Unknown",
        region=payload.region or "",
        api_key=api_key,
        status="offline",
        created_at=_now_utc(),
    )
    db.add(agent)
    await db.commit()

    logger.info(f"Agent registered: {agent_id} ({payload.name})")
    return AgentRegisterResponse(
        id=agent_id,
        name=payload.name,
        api_key=api_key,
        message="Agent registered successfully. Use X-Agent-Key header for all requests.",
    )


# ── List agents ───────────────────────────────────────────────────────────────

@router.get("")
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent))
    agents = result.scalars().all()

    # Check which agents are overdue (offline threshold)
    now = _now_utc()
    agent_list = []
    for a in agents:
        d = a.to_dict()
        if a.last_seen:
            seconds_ago = (now - a.last_seen).total_seconds()
            if seconds_ago > settings.AGENT_OFFLINE_THRESHOLD and a.status == "online":
                a.status = "offline"
                await db.commit()
                d["status"] = "offline"
        # Count servers reporting
        count_result = await db.execute(
            select(AgentMetric).where(AgentMetric.agent_id == a.id)
        )
        d["servers_reporting"] = len(count_result.scalars().all())
        agent_list.append(d)

    return {"agents": agent_list, "total": len(agent_list)}


# ── Agent detail ──────────────────────────────────────────────────────────────

@router.get("/{agent_id}")
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    d = agent.to_dict()
    count_result = await db.execute(
        select(AgentMetric).where(AgentMetric.agent_id == agent_id)
    )
    d["servers_reporting"] = len(count_result.scalars().all())
    return d


# ── Delete agent ──────────────────────────────────────────────────────────────

@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.execute(delete(AgentMetric).where(AgentMetric.agent_id == agent_id))
    await db.delete(agent)
    await db.commit()
    return {"message": f"Agent {agent_id} deleted"}


# ── Heartbeat (agent → server) ────────────────────────────────────────────────

@router.post("/heartbeat")
async def agent_heartbeat(
    payload: AgentHeartbeatRequest,
    x_agent_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Agent sends a heartbeat every 30s.
    Optionally includes a lightweight server list.
    """
    if not x_agent_key:
        raise HTTPException(status_code=401, detail="Missing X-Agent-Key header")

    agent = await _get_agent_by_key(x_agent_key, db)
    agent.status = "online"
    agent.last_seen = _now_utc()
    if payload.version:
        agent.version = payload.version

    # If agent included servers, upsert metrics
    if payload.servers:
        await _upsert_metrics(agent.id, payload.servers, db)
        await manager.broadcast({
            "type": "agent_metrics",
            "agent_id": agent.id,
            "data": payload.servers,
        })

    await db.commit()
    logger.debug(f"Heartbeat from {agent.id} ({agent.name})")

    return AgentHeartbeatResponse(
        status="ok",
        message="Heartbeat received",
        server_time=_now_utc().isoformat(),
    )


# ── Metric push (agent → server) ──────────────────────────────────────────────

@router.post("/metrics")
async def push_metrics(
    payload: AgentMetricPushRequest,
    x_agent_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Agent pushes full metric batch.
    Stored in DB and immediately broadcast to all WebSocket clients.
    """
    if not x_agent_key:
        raise HTTPException(status_code=401, detail="Missing X-Agent-Key header")

    agent = await _get_agent_by_key(x_agent_key, db)
    agent.status = "online"
    agent.last_seen = _now_utc()

    await _upsert_metrics(agent.id, payload.servers, db)
    await db.commit()

    # Broadcast to dashboard
    await manager.broadcast({
        "type": "agent_metrics",
        "agent_id": agent.id,
        "agent_name": agent.name,
        "data": payload.servers,
    })

    return {"status": "ok", "received": len(payload.servers)}


# ── Helper ────────────────────────────────────────────────────────────────────

async def _upsert_metrics(agent_id: str, servers: list, db: AsyncSession):
    """Delete old latest-metrics for this agent, insert fresh ones. Also append to history."""
    from db.models import MetricHistory
    await db.execute(delete(AgentMetric).where(AgentMetric.agent_id == agent_id))
    now = _now_utc()
    for s in servers:
        server_id = s.get("id", f"srv-{secrets.token_hex(4)}")
        public_ip = s.get("public_ip", s.get("ip", ""))
        cpu  = float(s.get("cpu",  0))
        mem  = float(s.get("mem",  0))
        disk = float(s.get("disk", 0))
        status = s.get("status", "healthy")

        # Latest snapshot
        m = AgentMetric(
            agent_id=agent_id,
            server_id=server_id,
            server_name=s.get("name", ""),
            public_ip=public_ip,
            provider=s.get("provider", ""),
            region=s.get("region", ""),
            resource_type=s.get("type", ""),
            status=status,
            cpu=cpu,
            mem=mem,
            disk=disk,
            net=str(s.get("net", "0 Mbps")),
            uptime=str(s.get("uptime", "0%")),
            timestamp=now,
        )
        db.add(m)

        # History row (time-series — never deleted)
        h = MetricHistory(
            agent_id=agent_id,
            server_id=server_id,
            server_name=s.get("name", ""),
            cpu=cpu,
            mem=mem,
            disk=disk,
            status=status,
            timestamp=now,
        )
        db.add(h)
