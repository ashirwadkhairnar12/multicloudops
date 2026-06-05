"""
Cloud Accounts router — Phase 3
Manage connected cloud accounts (AWS/Azure/GCP).
Each account has credentials, regions, and polling config.
"""
import secrets
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from db.database import get_db
from db.models import CloudAccount

router = APIRouter(prefix="/api/cloud-accounts", tags=["cloud-accounts"])
logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name:           str
    provider:       str                  # AWS | Azure | GCP
    account_id:     Optional[str] = ""
    regions:        Optional[List[str]] = ["us-east-1"]
    access_key:     Optional[str] = ""
    secret_key:     Optional[str] = ""
    role_arn:       Optional[str] = ""
    poll_interval:  Optional[int] = 300  # seconds


class AccountUpdate(BaseModel):
    name:           Optional[str] = None
    regions:        Optional[List[str]] = None
    access_key:     Optional[str] = None
    secret_key:     Optional[str] = None
    role_arn:       Optional[str] = None
    poll_interval:  Optional[int] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).order_by(CloudAccount.created_at.desc()))
    accounts = result.scalars().all()
    return {"accounts": [a.to_dict() for a in accounts], "total": len(accounts)}


@router.post("")
async def create_account(payload: AccountCreate, db: AsyncSession = Depends(get_db)):
    account = CloudAccount(
        id           = f"ca-{secrets.token_hex(6)}",
        name         = payload.name,
        provider     = payload.provider,
        account_id   = payload.account_id or "",
        regions      = json.dumps(payload.regions or ["us-east-1"]),
        access_key   = payload.access_key or "",
        secret_key   = payload.secret_key or "",
        role_arn     = payload.role_arn or "",
        poll_interval= payload.poll_interval or 300,
        status       = "pending",
        created_at   = _now(),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account.to_dict()


@router.get("/{account_id}")
async def get_account(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account.to_dict()


@router.patch("/{account_id}")
async def update_account(account_id: str, payload: AccountUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if payload.name         is not None: account.name          = payload.name
    if payload.regions      is not None: account.regions       = json.dumps(payload.regions)
    if payload.access_key   is not None: account.access_key    = payload.access_key
    if payload.secret_key   is not None: account.secret_key    = payload.secret_key
    if payload.role_arn     is not None: account.role_arn      = payload.role_arn
    if payload.poll_interval is not None: account.poll_interval = payload.poll_interval
    await db.commit()
    return account.to_dict()


@router.delete("/{account_id}")
async def delete_account(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{account_id}/test")
async def test_connection(account_id: str, db: AsyncSession = Depends(get_db)):
    """Test credentials by calling STS GetCallerIdentity."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.provider != "AWS":
        return {"success": False, "message": f"{account.provider} integration coming soon"}

    import asyncio
    loop = asyncio.get_event_loop()

    def _test():
        try:
            from services.cloud.aws_collector import _boto_session
            session  = _boto_session({"access_key": account.access_key, "secret_key": account.secret_key, "role_arn": account.role_arn})
            sts      = session.client("sts")
            identity = sts.get_caller_identity()
            return {"success": True, "aws_account_id": identity["Account"], "arn": identity["Arn"]}
        except Exception as e:
            return {"success": False, "message": str(e)}

    test_result = await loop.run_in_executor(None, _test)

    # Update account with real account ID and status
    if test_result.get("success"):
        account.account_id = test_result.get("aws_account_id", account.account_id)
        account.status     = "active"
        account.error_msg  = ""
    else:
        account.status    = "error"
        account.error_msg = test_result.get("message", "")
    await db.commit()

    return test_result


@router.post("/{account_id}/sync")
async def trigger_sync(account_id: str, db: AsyncSession = Depends(get_db)):
    """Trigger an immediate sync for this account."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != "active":
        raise HTTPException(status_code=400, detail="Account not active — test connection first")

    import asyncio
    from services.cloud.poller import poll_account

    # Pass raw fields so regions stays as JSON string (aws_collector handles both formats)
    acc_dict = {
        "id":           account.id,
        "name":         account.name,
        "provider":     account.provider,
        "account_id":   account.account_id,
        "regions":      account.regions,      # raw JSON string from DB
        "access_key":   account.access_key,
        "secret_key":   account.secret_key,
        "role_arn":     account.role_arn,
        "poll_interval":account.poll_interval,
        "status":       account.status,
    }

    data = await poll_account(acc_dict)

    account.last_sync = _now()
    if data.get("errors"):
        account.error_msg = "; ".join(data["errors"][:3])
    else:
        account.error_msg = ""
    await db.commit()

    return {
        "message":        "Sync complete",
        "resources_found": len(data.get("resources", [])),
        "errors":          data.get("errors", []),
        "costs":           data.get("costs", {}),
    }


@router.get("/{account_id}/resources")
async def get_account_resources(account_id: str, db: AsyncSession = Depends(get_db)):
    """Get all resources for a specific account (from last sync)."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id or account.id)
    if not cached:
        return {"resources": [], "message": "No data yet — trigger a sync first"}

    data = cached["data"]
    return {
        "account_id":    data.get("account_id"),
        "resources":     data.get("resources", []),
        "costs":         data.get("costs", {}),
        "ssm":           data.get("ssm", []),
        "security":      data.get("security", []),
        "optimisations": data.get("optimisations", []),
        "collected_at":  data.get("collected_at"),
        "errors":        data.get("errors", []),
    }


@router.get("/{account_id}/costs")
async def get_account_costs(account_id: str, db: AsyncSession = Depends(get_db)):
    """Get cost breakdown for account (cached — won't trigger new CE API call if recent)."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id or account.id)
    if not cached:
        return {"costs": {}, "message": "No data yet"}
    return {"costs": cached["data"].get("costs", {}), "collected_at": cached.get("fetched_at", "").isoformat() if cached.get("fetched_at") else ""}


@router.get("/{account_id}/security")
async def get_account_security(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id or account.id)
    if not cached:
        return {"findings": [], "message": "No data yet"}
    return {"findings": cached["data"].get("security", []), "ssm": cached["data"].get("ssm", [])}


@router.get("/{account_id}/optimisations")
async def get_optimisations(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id or account.id)
    if not cached:
        return {"optimisations": [], "message": "No data yet"}
    return {"optimisations": cached["data"].get("optimisations", [])}
