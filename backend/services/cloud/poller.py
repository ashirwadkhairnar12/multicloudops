"""
Background poller — runs per connected cloud account.
Respects poll intervals and caches Cost Explorer to avoid $$ waste.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict

logger = logging.getLogger(__name__)

_cache: Dict[str, dict] = {}

COST_CACHE_TTL = 3600
DATA_CACHE_TTL = 60


async def poll_account(account_dict: dict) -> dict:
    """
    Poll a single AWS account. Uses cache to avoid excessive API calls.
    Normalises regions to JSON string before passing to collector.
    """
    from services.cloud.aws_collector import collect_all

    account_id = account_dict.get("account_id") or account_dict.get("id")
    now = datetime.now(timezone.utc)

    # Check data cache
    cached = _cache.get(account_id)
    if cached:
        age = (now - cached["fetched_at"]).total_seconds()
        interval = account_dict.get("poll_interval", 300)
        if age < interval:
            logger.debug(f"Cache hit for {account_id} (age={age:.0f}s)")
            return cached["data"]

    # Normalise regions — collector expects a JSON string OR list (collector handles both)
    normalised = dict(account_dict)
    if isinstance(normalised.get("regions"), list):
        normalised["regions"] = json.dumps(normalised["regions"])

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, collect_all, normalised)
        _cache[account_id] = {"data": data, "fetched_at": now}
        return data
    except Exception as e:
        logger.error(f"Poll failed for account {account_id}: {e}")
        return {
            "account_id":    account_id,
            "resources":     [],
            "errors":        [str(e)],
            "costs":         {},
            "ssm":           [],
            "security":      [],
            "optimisations": [],
        }


async def background_poller(get_accounts_fn, on_result_fn, interval: int = 300):
    """
    Continuous background loop: poll all active accounts every `interval` seconds.
    """
    logger.info(f"Cloud poller started (interval={interval}s)")
    while True:
        try:
            accounts = await get_accounts_fn()
            for acc in accounts:
                if acc.get("status") != "active":
                    continue
                try:
                    result = await poll_account(acc)
                    await on_result_fn(acc["id"], result)
                except Exception as e:
                    logger.error(f"Poller error for {acc['id']}: {e}")
        except Exception as e:
            logger.error(f"Background poller error: {e}")
        await asyncio.sleep(interval)
