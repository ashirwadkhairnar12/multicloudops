import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from core.config import settings
from routers import monitoring, agents, auth, history, incidents, cloud_accounts
from services.ws_manager import manager, metrics_broadcaster
from db.database import init_db

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def cloud_auto_poller():
    """
    Auto-poll all active cloud accounts on their configured poll_interval.
    Runs as a background task — no manual sync needed.
    """
    from db.database import AsyncSessionLocal
    from db.models import CloudAccount
    from sqlalchemy import select
    from services.cloud.poller import poll_account
    from services.ws_manager import manager
    from datetime import datetime, timezone
    import json

    logger.info("Cloud auto-poller started")

    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(CloudAccount).where(CloudAccount.status == "active")
                )
                accounts = result.scalars().all()

            for account in accounts:
                try:
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc).replace(tzinfo=None)
                    # Check if it's time to poll this account
                    if account.last_sync:
                        age = (now - account.last_sync).total_seconds()
                        if age < account.poll_interval:
                            continue  # not yet time

                    logger.info(f"Auto-polling account {account.id} ({account.name})")

                    acc_dict = {
                        "id":           account.id,
                        "name":         account.name,
                        "provider":     account.provider,
                        "account_id":   account.account_id,
                        "regions":      account.regions,
                        "access_key":   account.access_key,
                        "secret_key":   account.secret_key,
                        "role_arn":     account.role_arn,
                        "poll_interval":account.poll_interval,
                        "status":       account.status,
                    }

                    data = await poll_account(acc_dict)

                    # Update last_sync and error_msg in DB
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(CloudAccount).where(CloudAccount.id == account.id)
                        )
                        acc = result.scalar_one_or_none()
                        if acc:
                            acc.last_sync = datetime.now(timezone.utc).replace(tzinfo=None)
                            acc.error_msg = "; ".join(data.get("errors", [])[:3]) if data.get("errors") else ""
                            await db.commit()

                    # Broadcast to dashboard
                    await manager.broadcast({
                        "type":      "cloud_update",
                        "account_id": account.id,
                        "aws_account_id": data.get("account_id", ""),
                        "resource_count": len(data.get("resources", [])),
                    })

                    logger.info(f"Auto-poll done: {account.name} — "
                                f"{len(data.get('resources',[]))} resources, "
                                f"{len(data.get('errors',[]))} errors")

                except Exception as e:
                    logger.error(f"Auto-poll error for {account.id}: {e}")

        except Exception as e:
            logger.error(f"Cloud poller loop error: {e}")

        await asyncio.sleep(60)  # check every 60s which accounts need polling


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting MultiCloudOps API — Phase 3...")
    await init_db()
    task1 = asyncio.create_task(metrics_broadcaster())
    task2 = asyncio.create_task(cloud_auto_poller())
    logger.info("MultiCloudOps API ready.")
    yield
    task1.cancel()
    task2.cancel()


app = FastAPI(title=settings.APP_NAME,
              version=settings.APP_VERSION,
              lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception {request.url}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(monitoring.router)
app.include_router(agents.router)
app.include_router(history.router)
app.include_router(incidents.router)
app.include_router(cloud_accounts.router)


@app.get("/")
def root():
    return {"message": "MultiCloudOps API",
            "version": settings.APP_VERSION,
            "phase":   "3 — Cloud Integrations + Auto-Polling"}


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
