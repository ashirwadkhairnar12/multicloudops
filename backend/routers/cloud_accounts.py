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
            import json, botocore.exceptions
            regions = json.loads(account.regions) if account.regions else ["us-east-1"]
            session = _boto_session({
                "access_key": account.access_key,
                "secret_key": account.secret_key,
                "role_arn":   account.role_arn,
            })
            for region in regions:
                try:
                    ssm_client = session.client("ssm", region_name=region)

                    # Fetch all managed instances (not just Online) and filter
                    instance_ids = []
                    next_token = None
                    while True:
                        kwargs = {"MaxResults": 50}
                        if next_token:
                            kwargs["NextToken"] = next_token
                        resp = ssm_client.describe_instance_information(**kwargs)
                        for inst in resp.get("InstanceInformationList", []):
                            # Accept Online and any non-empty ping status
                            ping = inst.get("PingStatus", "")
                            if ping in ("Online", "ConnectionLost"):
                                instance_ids.append(inst["InstanceId"])
                        next_token = resp.get("NextToken")
                        if not next_token:
                            break

                    if not instance_ids:
                        # Silently skip — having no instances in a region is normal
                        continue

                    # Custom patch scan script — always exits 0 so SSM marks Success.
                    # AWS-RunPatchBaseline fails on Ubuntu because apt exits 1 when
                    # upgrades exist, which SSM misreads as a script error.
                    # This script outputs structured data we parse in the collector.
                    PATCH_SCAN_SCRIPT = r"""#!/bin/bash
set -o pipefail
echo "MULTICLOUDOPS_PATCH_SCAN_START"

# Detect package manager
if command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
    apt-get update -qq 2>/dev/null || true
    UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c "upgradable" || true)
    INSTALLED=$(dpkg -l 2>/dev/null | grep -c "^ii" || echo 0)
    PKGS=$(apt list --upgradable 2>/dev/null | grep "upgradable" | awk -F/ '{print $1}' | tr '\n' ',' || true)
elif command -v yum &>/dev/null; then
    PKG_MGR="yum"
    UPGRADABLE=$(yum check-update --quiet 2>/dev/null | grep -c "^[a-zA-Z]" || true)
    INSTALLED=$(rpm -qa 2>/dev/null | wc -l || echo 0)
    PKGS=$(yum check-update --quiet 2>/dev/null | grep "^[a-zA-Z]" | awk '{print $1}' | tr '\n' ',' || true)
elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
    UPGRADABLE=$(dnf check-update --quiet 2>/dev/null | grep -c "^[a-zA-Z]" || true)
    INSTALLED=$(rpm -qa 2>/dev/null | wc -l || echo 0)
    PKGS=$(dnf check-update --quiet 2>/dev/null | grep "^[a-zA-Z]" | awk '{print $1}' | tr '\n' ',' || true)
else
    PKG_MGR="unknown"
    UPGRADABLE=0
    INSTALLED=0
    PKGS=""
fi

echo "PKG_MGR=$PKG_MGR"
echo "MISSING_COUNT=$UPGRADABLE"
echo "INSTALLED_COUNT=$INSTALLED"
echo "MISSING_PACKAGES=$PKGS"
echo "MULTICLOUDOPS_PATCH_SCAN_END"
exit 0
"""

                    for i in range(0, len(instance_ids), 50):
                        batch = instance_ids[i:i+50]
                        cmd_resp = None
                        try:
                            cmd_resp = ssm_client.send_command(
                                InstanceIds=batch,
                                DocumentName="AWS-RunShellScript",
                                Parameters={"commands": [PATCH_SCAN_SCRIPT]},
                                Comment="MultiCloudOps patch scan",
                                TimeoutSeconds=300,
                            )
                        except botocore.exceptions.ClientError as e:
                            errors.append(f"{region}: {e.response['Error']['Message']}")
                            continue

                        if cmd_resp:
                            results.append({
                                "region":     region,
                                "command_id": cmd_resp["Command"]["CommandId"],
                                "instances":  len(batch),
                            })
                except botocore.exceptions.ClientError as e:
                    errors.append(f"{region}: {e.response['Error']['Message']}")
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
                    resp = ssm_client.list_command_invocations(CommandId=command_id, Details=True)
                    invocations = resp.get("CommandInvocations", [])
                    statuses: dict = {}
                    failures = []
                    for inv in invocations:
                        s = inv.get("Status", "Unknown")
                        statuses[s] = statuses.get(s, 0) + 1
                        if s in ("Failed", "DeliveryTimedOut", "ExecutionTimedOut", "Cancelled"):
                            iid = inv.get("InstanceId", "")
                            detail = inv.get("StatusDetails", s)
                            # Try to get stderr output for the exact error
                            output = ""
                            try:
                                for cp in inv.get("CommandPlugins", []):
                                    output = cp.get("Output", "") or cp.get("StandardErrorContent", "")
                                    if output:
                                        break
                            except Exception:
                                pass
                            failures.append({
                                "instance_id":  iid,
                                "status":       s,
                                "status_detail": detail,
                                "output":       output[:500] if output else "",
                            })
                    if invocations:
                        return {
                            "command_id": command_id,
                            "region":     region,
                            "statuses":   statuses,
                            "total":      len(invocations),
                            "failures":   failures,
                        }
                except Exception:
                    continue
        except Exception as e:
            return {"error": str(e)}
        return {"command_id": command_id, "statuses": {}, "total": 0}

    return await loop.run_in_executor(None, _check)


# ── SSM: Custom Compliance Check ──────────────────────────────────────────────

class ComplianceCheckRequest(BaseModel):
    package:  str              # e.g. "nginx"
    operator: str = ">="      # >, >=, <, <=, ==, !=
    version:  str              # e.g. "1.24.0"
    label:    Optional[str] = None


@router.post("/{account_id}/ssm/compliance-check")
async def run_compliance_check(
    account_id: str,
    payload: ComplianceCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a custom compliance check across all SSM-managed instances.
    Example: is nginx >= 1.24 installed on every server?

    POST body:
      { "package": "nginx", "operator": ">=", "version": "1.24.0" }
    """
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != "active":
        raise HTTPException(status_code=400, detail="Account not active — connect and sync first")

    import asyncio
    loop = asyncio.get_event_loop()

    def _run():
        from services.cloud.aws_collector import run_ssm_compliance_check
        acc_dict = {
            "access_key":  account.access_key,
            "secret_key":  account.secret_key,
            "role_arn":    account.role_arn,
            "regions":     account.regions,
            "account_id":  account.account_id,
        }
        check = {
            "package":  payload.package,
            "operator": payload.operator,
            "version":  payload.version,
            "label":    payload.label or f"{payload.package} {payload.operator} {payload.version}",
        }
        return run_ssm_compliance_check(acc_dict, check)

    data = await loop.run_in_executor(None, _run)
    return data


@router.post("/{account_id}/ssm/run-process-scan")
async def run_process_scan(
    account_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a RunCommand to one or all Online SSM instances to collect process list.
    Runs `ps aux` on Linux, Get-Process on Windows.
    Returns command_id(s) — poll /ssm/process-scan-result/{command_id} until done.

    Optionally filter to a single instance:
      POST body: { "instance_id": "i-0abc123" }   (omit to scan all)
    """
    from fastapi import Request
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != "active":
        raise HTTPException(status_code=400, detail="Account not active")

    import asyncio
    loop = asyncio.get_event_loop()

    def _run():
        import json, botocore.exceptions
        from services.cloud.aws_collector import _boto_session

        regions = json.loads(account.regions) if account.regions else ["us-east-1"]
        session = _boto_session({
            "access_key": account.access_key,
            "secret_key": account.secret_key,
            "role_arn":   account.role_arn,
        })

        # Linux script — exits 0 always; structured between markers
        LINUX_SCRIPT = r"""#!/bin/bash
echo "MCO_PROCESS_START"
ps aux --no-headers 2>/dev/null \
  | awk '{
      user=$1; pid=$2; cpu=$3; mem=$4;
      cmd="";
      for(i=11;i<=NF;i++) cmd=cmd" "$i;
      gsub(/^ /,"",cmd);
      printf "%s\t%s\t%s\t%s\t%s\n", user, pid, cpu, mem, cmd
    }' \
  | sort -t$'\t' -k3 -rn \
  | head -60
echo "MCO_PROCESS_END"
exit 0
"""

        # Windows script — Get-Process gives CPU seconds not %; we normalise
        # WorkingSet64 to KB for the parser (4 GB baseline on backend side)
        WIN_SCRIPT = r"""
Write-Output "MCO_WIN_PROCESS_START"
Get-Process | Sort-Object CPU -Descending | Select-Object -First 60 |
  ForEach-Object {
    $cpu = if ($_.CPU) { [math]::Round($_.CPU, 1) } else { 0 }
    $mem = [math]::Round($_.WorkingSet64 / 1KB, 0)
    $user = try { $_.GetOwner().User } catch { "" }
    "{0},{1},{2},{3},{4}" -f $_.ProcessName, $_.Id, $cpu, $mem, $user
  }
Write-Output "MCO_WIN_PROCESS_END"
exit 0
"""

        commands = []
        errors   = []

        for region in regions:
            try:
                ssm_client = session.client("ssm", region_name=region)

                # Discover Online instances
                linux_ids   = []
                windows_ids = []
                next_token  = None
                while True:
                    kwargs = {"MaxResults": 50}
                    if next_token:
                        kwargs["NextToken"] = next_token
                    resp = ssm_client.describe_instance_information(**kwargs)
                    for inst in resp.get("InstanceInformationList", []):
                        if inst.get("PingStatus") != "Online":
                            continue
                        iid      = inst["InstanceId"]
                        platform = (inst.get("PlatformName") or "").lower()
                        if "windows" in platform:
                            windows_ids.append(iid)
                        else:
                            linux_ids.append(iid)
                    next_token = resp.get("NextToken")
                    if not next_token:
                        break

                # Send Linux batch
                for i in range(0, len(linux_ids), 50):
                    batch = linux_ids[i:i+50]
                    try:
                        r = ssm_client.send_command(
                            InstanceIds=batch,
                            DocumentName="AWS-RunShellScript",
                            Parameters={"commands": [LINUX_SCRIPT]},
                            Comment="MCO process scan",
                            TimeoutSeconds=60,
                        )
                        commands.append({
                            "region":     region,
                            "command_id": r["Command"]["CommandId"],
                            "instances":  len(batch),
                            "platform":   "linux",
                        })
                    except botocore.exceptions.ClientError as e:
                        errors.append(f"{region}/linux: {e.response['Error']['Message']}")

                # Send Windows batch
                for i in range(0, len(windows_ids), 50):
                    batch = windows_ids[i:i+50]
                    try:
                        r = ssm_client.send_command(
                            InstanceIds=batch,
                            DocumentName="AWS-RunPowerShellScript",
                            Parameters={"commands": [WIN_SCRIPT]},
                            Comment="MCO process scan",
                            TimeoutSeconds=60,
                        )
                        commands.append({
                            "region":     region,
                            "command_id": r["Command"]["CommandId"],
                            "instances":  len(batch),
                            "platform":   "windows",
                        })
                    except botocore.exceptions.ClientError as e:
                        errors.append(f"{region}/windows: {e.response['Error']['Message']}")

            except botocore.exceptions.ClientError as e:
                errors.append(f"{region}: {e.response['Error']['Message']}")
            except Exception as e:
                errors.append(f"{region}: {str(e)}")

        total = sum(c["instances"] for c in commands)
        return {"commands": commands, "errors": errors, "total_instances": total}

    data = await loop.run_in_executor(None, _run)
    return {
        "message":  f"Process scan sent to {data['total_instances']} instance(s)" if data["total_instances"] else "No online instances found",
        "commands": data["commands"],
        "errors":   data["errors"],
    }


@router.get("/{account_id}/ssm/process-scan-result/{command_id}")
async def get_process_scan_result(
    account_id: str,
    command_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Poll a process-scan RunCommand and return parsed process lists per instance.
    Returns:
      status: "pending" | "done" | "partial"
      by_instance: { instance_id: [ process, ... ] }
      summary: { total_instances, completed, pending, failed }
    """
    result = await db.execute(select(CloudAccount).where(CloudAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    import asyncio
    loop = asyncio.get_event_loop()

    def _fetch():
        import json
        from services.cloud.aws_collector import _boto_session, _parse_process_output

        regions = json.loads(account.regions) if account.regions else ["us-east-1"]
        session = _boto_session({
            "access_key": account.access_key,
            "secret_key": account.secret_key,
            "role_arn":   account.role_arn,
        })

        by_instance  = {}
        total = completed = pending = failed = 0

        for region in regions:
            try:
                ssm_client = session.client("ssm", region_name=region)
                resp = ssm_client.list_command_invocations(
                    CommandId=command_id, Details=True
                )
                for inv in resp.get("CommandInvocations", []):
                    iid    = inv["InstanceId"]
                    status = inv.get("Status", "Pending")
                    total += 1

                    if status in ("Pending", "InProgress", "Delayed"):
                        pending += 1
                        continue
                    if status in ("Failed", "Cancelled", "DeliveryTimedOut", "ExecutionTimedOut"):
                        failed += 1
                        continue

                    # Success — parse output
                    completed += 1
                    output = ""
                    for plugin in inv.get("CommandPlugins", []):
                        output = plugin.get("Output", "") or plugin.get("StandardOutputContent", "")
                        if output:
                            break
                    procs = _parse_process_output(output)
                    if procs:
                        by_instance[iid] = procs

            except Exception:
                continue

        overall = (
            "pending" if pending > 0 and completed == 0
            else "partial" if pending > 0
            else "done"
        )
        return {
            "status":      overall,
            "by_instance": by_instance,
            "summary":     {
                "total":     total,
                "completed": completed,
                "pending":   pending,
                "failed":    failed,
            },
        }

    return await loop.run_in_executor(None, _fetch)
