import json
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional, List


class Settings(BaseSettings):
    APP_NAME: str = "MultiCloudOps API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = True
    PHASE: str = "1"

    # CORS — accepts either a Python list or a JSON string from env var
    CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend",
        "http://frontend:80",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # single origin passed as plain string
                return [v]
        return v

    # Database — defaults to /data/ so Docker volume works out of the box
    DATABASE_URL: str = "sqlite+aiosqlite:////data/multicloudops.db"

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # Auth (Phase 2)
    SECRET_KEY: str = "change-me-in-production-use-env-var"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Agent settings
    AGENT_HEARTBEAT_INTERVAL: int = 30
    AGENT_OFFLINE_THRESHOLD: int = 90
    METRICS_BROADCAST_INTERVAL: int = 5

    # Cloud APIs (Phase 3)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_DEFAULT_REGION: str = "us-east-1"

    AZURE_SUBSCRIPTION_ID: Optional[str] = None
    AZURE_TENANT_ID: Optional[str] = None
    AZURE_CLIENT_ID: Optional[str] = None
    AZURE_CLIENT_SECRET: Optional[str] = None

    GCP_PROJECT_ID: Optional[str] = None
    GCP_CREDENTIALS_FILE: Optional[str] = None

    MOCK_MODE: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
