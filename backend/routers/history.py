"""
Metric history router — Phase 2.
GET /api/history/{server_id}?hours=24  → time-series data for charts
GET /api/history/overview?hours=24     → fleet-wide averages over time
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from db.database import get_db
from db.models import MetricHistory

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/overview")
async def get_overview_history(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Fleet-wide average CPU/MEM over time — used for the main performance chart."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    result = await db.execute(
        select(MetricHistory).where(MetricHistory.timestamp >= since)
        .order_by(MetricHistory.timestamp.asc())
    )
    rows = result.scalars().all()

    # Group by minute, average across all servers
    buckets: dict[str, list] = {}
    for r in rows:
        key = r.timestamp.strftime("%H:%M")
        if key not in buckets:
            buckets[key] = []
        buckets[key].append(r)

    points = []
    for time_key, group in buckets.items():
        points.append({
            "time":     time_key,
            "cpu":      round(sum(r.cpu for r in group) / len(group), 1),
            "mem":      round(sum(r.mem for r in group) / len(group), 1),
            "critical": sum(1 for r in group if r.status == "critical"),
            "warning":  sum(1 for r in group if r.status == "warning"),
        })

    return {"points": points, "hours": hours, "total_records": len(rows)}


@router.get("/{server_id}")
async def get_server_history(
    server_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Per-server time-series — used for server detail drilldown charts."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    result = await db.execute(
        select(MetricHistory)
        .where(MetricHistory.server_id == server_id)
        .where(MetricHistory.timestamp >= since)
        .order_by(MetricHistory.timestamp.asc())
    )
    rows = result.scalars().all()

    points = [{
        "time":   r.timestamp.strftime("%H:%M"),
        "cpu":    r.cpu,
        "mem":    r.mem,
        "disk":   r.disk,
        "status": r.status,
    } for r in rows]

    return {"server_id": server_id, "points": points, "hours": hours}
