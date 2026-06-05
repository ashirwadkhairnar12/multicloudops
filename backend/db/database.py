"""
Database setup using SQLAlchemy async with SQLite.
Phase 1: SQLite  →  Phase 2: swap DATABASE_URL to postgresql+asyncpg://...
"""
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from core.config import settings

logger = logging.getLogger(__name__)

# aiosqlite does NOT accept check_same_thread — that's a sync sqlite3 arg
_connect_args = {}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,          # set True only for query debugging
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables on startup."""
    from db import models  # noqa — registers ORM models with Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized.")


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
