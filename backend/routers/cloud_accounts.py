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
    # Try both the AWS account ID and the internal account ID as cache keys
    cached = _cache.get(account.account_id) or _cache.get(account.id)
    if not cached:
        return {"resources": [], "message": "No data yet — trigger a sync first",
                "costs": {}, "ssm": [], "security": {}, "optimisations": []}

    data = cached["data"]
    return {
        "account_id":    data.get("account_id", account.account_id),
        "resources":     data.get("resources", []),
        "costs":         data.get("costs", {}),
        "ssm":           data.get("ssm", []),
        "security":      data.get("security", {}),
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
    cached = _cache.get(account.account_id) or _cache.get(account.id)
    if not cached:
        return {"costs": {}, "message": "No data yet"}
    return {"costs": cached["data"].get("costs", {}),
            "collected_at": cached.get("fetched_at", "").isoformat() if cached.get("fetched_at") else ""}


@router.get("/{account_id}/security")
async def get_account_security(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id) or _cache.get(account.id)
    if not cached:
        return {"findings": [], "guardduty": [], "iam_unused_roles": [],
                "config_non_compliant": [], "cloudtrail_events": [],
                "ssm": [], "message": "No data yet — trigger a sync first"}

    sec = cached["data"].get("security", {})
    # Support both old format (list) and new format (dict)
    if isinstance(sec, list):
        findings = sec
        guardduty = config_nc = iam_unused = cloudtrail = []
    else:
        findings    = sec.get("securityhub", [])
        guardduty   = sec.get("guardduty", [])
        iam_unused  = sec.get("iam_unused_roles", [])
        config_nc   = sec.get("config_non_compliant", [])
        cloudtrail  = sec.get("cloudtrail_events", [])

    return {
        "findings":              findings,
        "guardduty":             guardduty,
        "iam_unused_roles":      iam_unused,
        "config_non_compliant":  config_nc,
        "cloudtrail_events":     cloudtrail,
        "ssm":                   cached["data"].get("ssm", []),
    }


@router.get("/{account_id}/optimisations")
async def get_optimisations(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.cloud.poller import _cache
    cached = _cache.get(account.account_id) or _cache.get(account.id)
    if not cached:
        return {"optimisations": [], "message": "No data yet"}
    return {"optimisations": cached["data"].get("optimisations", [])}

@router.patch("/{account_id}/poll-interval")
async def update_poll_interval(
    account_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update poll interval (seconds). Min 60s, Max 3600s."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    interval = int(payload.get("poll_interval", 300))
    interval = max(60, min(3600, interval))
    account.poll_interval = interval
    await db.commit()
    return {"poll_interval": interval, "message": f"Poll interval updated to {interval}s"}


@router.post("/{account_id}/force-sync")
async def force_sync(account_id: str, db: AsyncSession = Depends(get_db)):
    """Force immediate sync regardless of poll interval."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != "active":
        raise HTTPException(status_code=400, detail="Account not active")

    # Reset last_sync to force re-poll
    account.last_sync = None
    await db.commit()

    # Trigger immediate poll
    from services.cloud.poller import poll_account, _cache
    acc_dict = {
        "id": account.id, "name": account.name, "provider": account.provider,
        "account_id": account.account_id, "regions": account.regions,
        "access_key": account.access_key, "secret_key": account.secret_key,
        "role_arn": account.role_arn, "poll_interval": account.poll_interval,
        "status": account.status,
    }
    # Bypass cache by clearing it first
    _cache.pop(account.account_id, None)
    _cache.pop(account.id, None)

    data = await poll_account(acc_dict)

    from db.database import AsyncSessionLocal as _ASL
    from datetime import datetime, timezone
    async with _ASL() as db2:
        result2 = await db2.execute(select(CloudAccount).where(CloudAccount.id == account_id))
        acc2 = result2.scalar_one_or_none()
        if acc2:
            acc2.last_sync = datetime.now(timezone.utc).replace(tzinfo=None)
            acc2.error_msg = "; ".join(data.get("errors", [])[:3]) if data.get("errors") else ""
            await db2.commit()

    return {
        "message":        "Force sync complete",
        "resources_found": len(data.get("resources", [])),
        "errors":          data.get("errors", []),
    }


@router.post("/{account_id}/ssm/run-patch-scan")
async def run_patch_scan(account_id: str, db: AsyncSession = Depends(get_db)):
    """Trigger AWS-RunPatchBaseline Scan on all Online SSM instances for this account."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != "active":
        raise HTTPException(status_code=400, detail="Account not active")

    import asyncio
    loop = asyncio.get_event_loop()

    def _run():
        results = []
        errors  = []
        try:
            from services.cloud.aws_collector import _boto_session
            import json
            regions = json.loads(account.regions) if account.regions else ["us-east-1"]
            session = _boto_session({
                "access_key": account.access_key,
                "secret_key": account.secret_key,
                "role_arn":   account.role_arn,
            })
            for region in regions:
                try:
                    ssm_client = session.client("ssm", region_name=region)
                    pages = ssm_client.get_paginator("describe_instance_information").paginate()
                    instance_ids = [
                        inst["InstanceId"]
                        for page in pages
                        for inst in page["InstanceInformationList"]
                        if inst.get("PingStatus") == "Online"
                    ]
                    if not instance_ids:
                        continue
                    # Send in batches of 50 (AWS limit)
                    for i in range(0, len(instance_ids), 50):
                        batch = instance_ids[i:i+50]
                        resp = ssm_client.send_command(
                            InstanceIds=batch,
                            DocumentName="AWS-RunPatchBaseline",
                            Parameters={"Operation": ["Scan"]},
                            Comment="Patch scan by MultiCloudOps",
                            TimeoutSeconds=600,
                        )
                        results.append({
                            "region":     region,
                            "command_id": resp["Command"]["CommandId"],
                            "instances":  len(batch),
                        })
                except Exception as e:
                    errors.append(f"{region}: {str(e)}")
        except Exception as e:
            errors.append(str(e))
        return {"results": results, "errors": errors}

    data = await loop.run_in_executor(None, _run)
    total_instances = sum(r["instances"] for r in data["results"])
    return {
        "message":  f"Patch scan triggered on {total_instances} instance(s)" if total_instances else "No online instances found",
        "commands": data["results"],
        "errors":   data["errors"],
    }


@router.get("/{account_id}/ssm/command-status/{command_id}")
async def get_command_status(account_id: str, command_id: str, db: AsyncSession = Depends(get_db)):
    """Poll the status of an SSM send_command invocation."""
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    import asyncio
    loop = asyncio.get_event_loop()

    def _check():
        try:
            from services.cloud.aws_collector import _boto_session
            import json
            regions = json.loads(account.regions) if account.regions else ["us-east-1"]
            session = _boto_session({
                "access_key": account.access_key,
                "secret_key": account.secret_key,
                "role_arn":   account.role_arn,
            })
            for region in regions:
                try:
                    ssm_client = session.client("ssm", region_name=region)
                    resp = ssm_client.list_command_invocations(CommandId=command_id, Details=False)
                    invocations = resp.get("CommandInvocations", [])
                    statuses: dict = {}
                    for inv in invocations:
                        s = inv.get("Status", "Unknown")
                        statuses[s] = statuses.get(s, 0) + 1
                    if invocations:
                        return {"command_id": command_id, "region": region, "statuses": statuses, "total": len(invocations)}
                except Exception:
                    continue
        except Exception as e:
            return {"error": str(e)}
        return {"command_id": command_id, "statuses": {}, "total": 0}

    return await loop.run_in_executor(None, _check)
