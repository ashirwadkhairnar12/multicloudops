"""
Incidents router — Phase 2.
Auto-creates incidents when servers go critical.
Supports manual creation, status updates, assignment.
"""
import secrets
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from db.database import get_db
from db.models import Incident, AgentMetric, Agent
from core.config import settings

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class IncidentCreate(BaseModel):
    title: str
    severity: str = "medium"
    impact: str = "Medium"
    description: str = ""
    server_id: Optional[str] = None
    server_name: Optional[str] = ""
    assignee: str = "Unassigned"


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    assignee: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None


@router.get("")
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).order_by(Incident.created_at.desc()))
    incidents = result.scalars().all()
    return {"incidents": [i.to_dict() for i in incidents], "total": len(incidents)}


@router.post("")
async def create_incident(payload: IncidentCreate, db: AsyncSession = Depends(get_db)):
    inc = Incident(
        id=f"INC-{secrets.randbelow(9000) + 1000}",
        title=payload.title,
        severity=payload.severity,
        status="open",
        impact=payload.impact,
        description=payload.description,
        assignee=payload.assignee,
        server_id=payload.server_id,
        server_name=payload.server_name or "",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(inc)
    await db.commit()
    return inc.to_dict()


@router.patch("/{incident_id}")
async def update_incident(incident_id: str, payload: IncidentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    inc = result.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if payload.status:
        inc.status = payload.status
        if payload.status in ("resolved", "closed") and not inc.resolved_at:
            inc.resolved_at = _now()
    if payload.assignee is not None:
        inc.assignee = payload.assignee
    if payload.description is not None:
        inc.description = payload.description
    if payload.severity:
        inc.severity = payload.severity
    inc.updated_at = _now()
    await db.commit()
    return inc.to_dict()


@router.delete("/{incident_id}")
async def delete_incident(incident_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    inc = result.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    await db.delete(inc)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/auto-detect")
async def auto_detect_incidents(db: AsyncSession = Depends(get_db)):
    """
    Scan critical servers and auto-create incidents if none exist for them.
    Called periodically by the broadcaster or manually.
    """
    from routers.monitoring import _get_servers_with_agent_status
    servers = await _get_servers_with_agent_status(db)
    created = []
    for s in servers:
        if s["status"] != "critical":
            continue
        # Check if open incident already exists for this server
        existing = await db.execute(
            select(Incident).where(
                Incident.server_id == s["id"],
                Incident.status.in_(["open", "investigating"])
            )
        )
        if existing.scalar_one_or_none():
            continue
        inc = Incident(
            id=f"INC-{secrets.randbelow(9000) + 1000}",
            title=f"Critical: {s['name']} — {s['provider']} {s['region']}",
            severity="critical",
            status="open",
            impact="High",
            description=f"Auto-detected: CPU {s['cpu']}% MEM {s['mem']}% DISK {s['disk']}%",
            server_id=s["id"],
            server_name=s["name"],
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(inc)
        created.append(inc.id)
    if created:
        await db.commit()
    return {"created": created, "total": len(created)}
