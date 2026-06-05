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

# In-memory cache: account_id → {data, fetched_at}
_cache: Dict[str, dict] = {}
# Cost Explorer cache (separate — much longer TTL)
_cost_cache: Dict[str, dict] = {}

COST_CACHE_TTL = 3600   # 1 hour — Cost Explorer costs $0.01/request
DATA_CACHE_TTL = 60     # 1 minute minimum between full refreshes


async def poll_account(account_dict: dict) -> dict:
    """
    Poll a single AWS account. Uses cache to avoid excessive API calls.
    Returns collected data dict.
    """
    from services.cloud.aws_collector import collect_all, collect_costs, _boto_session
    import json

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

    # Run collection in thread (boto3 is sync)
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, collect_all, account_dict)
        _cache[account_id] = {"data": data, "fetched_at": now}
        return data
    except Exception as e:
        logger.error(f"Poll failed for account {account_id}: {e}")
        return {"account_id": account_id, "resources": [], "errors": [str(e)],
                "costs": {}, "ssm": [], "security": [], "optimisations": []}


async def background_poller(get_accounts_fn, on_result_fn, interval: int = 300):
    """
    Continuous background loop: poll all active accounts every `interval` seconds.
    get_accounts_fn: async callable that returns list of account dicts
    on_result_fn:    async callable(account_id, result) called after each poll
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
