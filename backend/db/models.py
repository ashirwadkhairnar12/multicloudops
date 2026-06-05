from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, Text, Boolean, ForeignKey, func
from sqlalchemy.orm import mapped_column, Mapped, relationship
from db.database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int]              = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str]           = mapped_column(String(256), unique=True, nullable=False)
    username: Mapped[str]        = mapped_column(String(64), unique=True, nullable=False)
    full_name: Mapped[str]       = mapped_column(String(128), default="")
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str]            = mapped_column(String(32), default="viewer")
    is_active: Mapped[bool]      = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "username": self.username,
            "full_name": self.full_name, "role": self.role, "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str]            = mapped_column(String(64), primary_key=True)
    name: Mapped[str]          = mapped_column(String(128), nullable=False)
    description: Mapped[str]   = mapped_column(Text, default="")
    api_key: Mapped[str]       = mapped_column(String(128), unique=True, nullable=False)
    provider: Mapped[str]      = mapped_column(String(64), default="Unknown")
    region: Mapped[str]        = mapped_column(String(64), default="")
    status: Mapped[str]        = mapped_column(String(32), default="offline")
    version: Mapped[str]       = mapped_column(String(32), default="")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    metrics: Mapped[list["AgentMetric"]] = relationship("AgentMetric", back_populates="agent", cascade="all, delete-orphan")
    history: Mapped[list["MetricHistory"]] = relationship("MetricHistory", back_populates="agent", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "provider": self.provider, "region": self.region, "status": self.status,
            "version": self.version,
            "last_seen":  self.last_seen.isoformat()  if self.last_seen  else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "servers_reporting": 0,
        }


class AgentMetric(Base):
    __tablename__ = "agent_metrics"
    id: Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str]      = mapped_column(String(64), ForeignKey("agents.id"), nullable=False)
    server_id: Mapped[str]     = mapped_column(String(64), nullable=False)
    server_name: Mapped[str]   = mapped_column(String(128), default="")
    public_ip: Mapped[str]     = mapped_column(String(64), default="")   # ← NEW
    provider: Mapped[str]      = mapped_column(String(64), default="")
    region: Mapped[str]        = mapped_column(String(64), default="")
    resource_type: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str]        = mapped_column(String(32), default="healthy")
    cpu: Mapped[float]         = mapped_column(Float, default=0.0)
    mem: Mapped[float]         = mapped_column(Float, default=0.0)
    disk: Mapped[float]        = mapped_column(Float, default=0.0)
    net: Mapped[str]           = mapped_column(String(32), default="0 Mbps")
    uptime: Mapped[str]        = mapped_column(String(16), default="0%")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    agent: Mapped["Agent"] = relationship("Agent", back_populates="metrics")

    def to_server_dict(self):
        return {
            "id": self.server_id, "name": self.server_name,
            "public_ip": self.public_ip,                    # ← NEW
            "provider": self.provider, "region": self.region,
            "type": self.resource_type, "status": self.status,
            "cpu": self.cpu, "mem": self.mem, "disk": self.disk,
            "net": self.net, "uptime": self.uptime,
            "agent_id": self.agent_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


class MetricHistory(Base):
    __tablename__ = "metric_history"
    id: Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str]      = mapped_column(String(64), ForeignKey("agents.id"), nullable=False)
    server_id: Mapped[str]     = mapped_column(String(64), nullable=False)
    server_name: Mapped[str]   = mapped_column(String(128), default="")
    cpu: Mapped[float]         = mapped_column(Float, default=0.0)
    mem: Mapped[float]         = mapped_column(Float, default=0.0)
    disk: Mapped[float]        = mapped_column(Float, default=0.0)
    status: Mapped[str]        = mapped_column(String(32), default="healthy")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    agent: Mapped["Agent"] = relationship("Agent", back_populates="history")


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str]            = mapped_column(String(32), primary_key=True)
    title: Mapped[str]         = mapped_column(String(256), nullable=False)
    severity: Mapped[str]      = mapped_column(String(32), default="medium")
    status: Mapped[str]        = mapped_column(String(32), default="open")
    impact: Mapped[str]        = mapped_column(String(32), default="Medium")
    description: Mapped[str]   = mapped_column(Text, default="")
    assignee: Mapped[str]      = mapped_column(String(128), default="Unassigned")
    server_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    server_name: Mapped[str]   = mapped_column(String(128), default="")
    created_at: Mapped[datetime]  = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime, default=func.now(), onupdate=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_dict(self):
        mttr = None
        if self.resolved_at and self.created_at:
            diff = (self.resolved_at - self.created_at).total_seconds() / 60
            mttr = f"{int(diff)}m"
        return {
            "id": self.id, "title": self.title, "severity": self.severity,
            "status": self.status, "impact": self.impact, "description": self.description,
            "assignee": self.assignee, "server_id": self.server_id, "server_name": self.server_name,
            "created": self.created_at.strftime("%b %d, %I:%M %p") if self.created_at else "",
            "updated": self.updated_at.strftime("%b %d, %I:%M %p") if self.updated_at else "",
            "mttr": mttr,
        }
