from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class StatusEnum(str, Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"
    fluctuating = "fluctuating"
    stopped = "stopped"


class ProviderEnum(str, Enum):
    aws = "AWS"
    azure = "Azure"
    gcp = "GCP"
    oracle = "Oracle"
    kubernetes = "Kubernetes"
    onprem = "On-Prem"


# ── Server ──────────────────────────────────────────────────────────────────

class Server(BaseModel):
    id: str
    name: str
    provider: str
    region: str
    type: str
    status: str
    cpu: float
    mem: float
    disk: float
    net: str
    uptime: str
    agent_id: Optional[str] = None
    timestamp: Optional[str] = None


# ── Alert ────────────────────────────────────────────────────────────────────

class Alert(BaseModel):
    id: str
    severity: str
    title: str
    resource: str
    source: str
    time: str
    status: str


# ── Incident ─────────────────────────────────────────────────────────────────

class Incident(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    impact: str
    created: str
    updated: str
    mttr: str


# ── Dashboard Stats ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total: int
    healthy: int
    warning: int
    critical: int
    fluctuating: int
    stopped: int
    critical_alerts: int
    warning_alerts: int
    open_incidents: int


# ── Agent schemas ─────────────────────────────────────────────────────────────

class AgentRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: Optional[str] = ""
    provider: Optional[str] = "Unknown"
    region: Optional[str] = ""


class AgentRegisterResponse(BaseModel):
    id: str
    name: str
    api_key: str
    message: str


class AgentHeartbeatRequest(BaseModel):
    version: Optional[str] = ""
    servers: Optional[List[dict]] = []


class AgentHeartbeatResponse(BaseModel):
    status: str
    message: str
    server_time: str


class AgentMetricPushRequest(BaseModel):
    servers: List[dict]


class AgentDetail(BaseModel):
    id: str
    name: str
    description: str
    provider: str
    region: str
    status: str
    version: str
    last_seen: Optional[str]
    created_at: Optional[str]
    servers_reporting: int
