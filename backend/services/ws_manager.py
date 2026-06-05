import asyncio
import json
import logging
from typing import List
from fastapi import WebSocket
from core.config import settings

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WS client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        message = json.dumps(data)
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)

    @property
    def connection_count(self):
        return len(self.active_connections)


manager = ConnectionManager()


async def metrics_broadcaster():
    """
    Every N seconds: read latest metrics from DB respecting agent online/offline status.
    Servers whose agent is offline are broadcast as 'stopped'.
    """
    from db.database import AsyncSessionLocal
    from db.models import Agent, AgentMetric
    from sqlalchemy import select
    from datetime import datetime, timezone

    logger.info(f"Metrics broadcaster started (interval={settings.METRICS_BROADCAST_INTERVAL}s)")

    while True:
        await asyncio.sleep(settings.METRICS_BROADCAST_INTERVAL)
        try:
            if manager.connection_count == 0:
                continue

            async with AsyncSessionLocal() as db:
                metrics_result = await db.execute(select(AgentMetric))
                metrics = metrics_result.scalars().all()

                agents_result = await db.execute(select(Agent))
                agents = {a.id: a for a in agents_result.scalars().all()}

                now = datetime.now(timezone.utc).replace(tzinfo=None)
                servers = []
                for m in metrics:
                    d = m.to_server_dict()
                    agent = agents.get(m.agent_id)
                    if agent and agent.last_seen:
                        seconds_ago = (now - agent.last_seen).total_seconds()
                        if seconds_ago > settings.AGENT_OFFLINE_THRESHOLD:
                            d["status"] = "stopped"
                            d["cpu"]    = 0.0
                            d["mem"]    = 0.0
                    servers.append(d)

            await manager.broadcast({
                "type":   "metrics_update",
                "data":   servers,
                "source": "agents",
            })
        except Exception as e:
            logger.error(f"Broadcaster error: {e}")
