#!/usr/bin/env python3
"""
MultiCloudOps Monitoring Agent
================================
Runs on any Linux/Windows/macOS server.
Collects CPU, memory, disk, network metrics via psutil,
then pushes them to your MultiCloudOps dashboard every N seconds.

Usage:
    python mco_agent.py --server http://your-dashboard:8000 --key mco-xxxx

Or via environment variables:
    MCO_SERVER=http://your-dashboard:8000
    MCO_API_KEY=mco-xxxx
    python mco_agent.py
"""

import os
import sys
import time
import json
import socket
import logging
import argparse
import platform
import threading
from datetime import datetime, timezone
from typing import Optional

try:
    import psutil
except ImportError:
    print("[ERROR] psutil not installed. Run:  pip install psutil requests")
    sys.exit(1)

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("[ERROR] requests not installed. Run:  pip install psutil requests")
    sys.exit(1)

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mco-agent")


# ── Config ────────────────────────────────────────────────────────────────────

class Config:
    def __init__(self, args):
        self.server_url: str     = (args.server or os.getenv("MCO_SERVER", "http://localhost:8000")).rstrip("/")
        self.api_key: str        = args.key    or os.getenv("MCO_API_KEY", "")
        self.interval: int       = args.interval or int(os.getenv("MCO_INTERVAL", "30"))
        self.agent_name: str     = args.name   or os.getenv("MCO_AGENT_NAME", socket.gethostname())
        self.provider: str       = args.provider or os.getenv("MCO_PROVIDER", "On-Prem")
        self.region: str         = args.region  or os.getenv("MCO_REGION", "local")
        self.server_id: str      = args.server_id or os.getenv("MCO_SERVER_ID", f"srv-{socket.gethostname()}")
        self.server_name: str    = args.server_name or os.getenv("MCO_SERVER_NAME", socket.gethostname())
        self.resource_type: str  = args.resource_type or os.getenv("MCO_RESOURCE_TYPE", self._detect_type())
        self.version: str        = "1.0.0"

    def _detect_type(self) -> str:
        """Auto-detect resource type based on environment."""
        if os.path.exists("/.dockerenv"):
            return "Container"
        if os.path.exists("/var/run/kubernetes"):
            return "Pod"
        system = platform.system()
        if system == "Linux":
            return "VM" if self._is_vm() else "Physical"
        if system == "Windows":
            return "Windows VM"
        if system == "Darwin":
            return "macOS"
        return "Server"

    def _is_vm(self) -> bool:
        try:
            with open("/sys/class/dmi/id/sys_vendor") as f:
                vendor = f.read().lower()
                return any(v in vendor for v in ["vmware", "virtualbox", "kvm", "xen", "amazon", "microsoft", "google"])
        except Exception:
            return False

    def validate(self):
        if not self.api_key:
            log.error("API key is required. Use --key or set MCO_API_KEY env var.")
            log.error("Register an agent at your dashboard → Agents → Register Agent")
            sys.exit(1)
        if not self.server_url.startswith(("http://", "https://")):
            log.error(f"Invalid server URL: {self.server_url}")
            sys.exit(1)


# ── HTTP Client ───────────────────────────────────────────────────────────────

def build_session(api_key: str) -> requests.Session:
    """Build a requests session with retry logic and auth header."""
    session = requests.Session()
    session.headers.update({
        "X-Agent-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": "mco-agent/1.0.0",
    })
    retry = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


# ── Metric Collection ──────────────────────────────────────────────────────────

def collect_cpu() -> float:
    """CPU usage percent (1-second interval)."""
    return round(psutil.cpu_percent(interval=1), 1)


def collect_memory() -> float:
    """RAM usage percent."""
    vm = psutil.virtual_memory()
    return round(vm.percent, 1)


def collect_disk(path: str = "/") -> float:
    """Disk usage percent for the given mount point."""
    if platform.system() == "Windows":
        path = "C:\\"
    try:
        usage = psutil.disk_usage(path)
        return round(usage.percent, 1)
    except Exception:
        return 0.0


def collect_network() -> str:
    """Approximate network throughput (reads counters 1s apart)."""
    try:
        t0 = psutil.net_io_counters()
        time.sleep(1)
        t1 = psutil.net_io_counters()
        bytes_per_sec = (t1.bytes_sent + t1.bytes_recv) - (t0.bytes_sent + t0.bytes_recv)
        mbps = round(bytes_per_sec * 8 / 1_000_000, 1)
        if mbps >= 1000:
            return f"{round(mbps / 1000, 2)} Gbps"
        return f"{mbps} Mbps"
    except Exception:
        return "0 Mbps"


def collect_uptime() -> str:
    """System uptime as a percentage (days up / 30 days rolling window)."""
    try:
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        uptime_days = uptime_seconds / 86400
        # Express as % over a 30-day window
        pct = min(100.0, round((uptime_days / 30) * 100, 2))
        return f"{pct}%"
    except Exception:
        return "100%"


def get_status(cpu: float, mem: float, disk: float) -> str:
    """Determine server status based on current metrics."""
    if cpu >= 90 or mem >= 90:
        return "critical"
    if cpu >= 70 or mem >= 75 or disk >= 85:
        return "warning"
    return "healthy"


def collect_public_ip() -> str:
    """Try to get public IP from cloud metadata or external service."""
    import urllib.request
    # Try AWS/GCP/Azure metadata first (fast, no external call)
    endpoints = [
        ("http://169.254.169.254/latest/meta-data/public-ipv4", 2),   # AWS
        ("http://169.254.169.254/metadata/instance/network/interface/0/ipConfig/0/publicIpAddress?api-version=2017-08-01&format=text", 2),  # Azure
    ]
    for url, timeout in endpoints:
        try:
            req = urllib.request.Request(url, headers={"Metadata": "true"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                ip = r.read().decode().strip()
                if ip and ip.count(".") == 3:
                    return ip
        except Exception:
            pass
    # Fallback: local IP
    try:
        import socket
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return ""


def collect_all_metrics(cfg: Config) -> dict:
    """Collect all metrics and return a server payload dict."""
    cpu  = collect_cpu()
    mem  = collect_memory()
    disk = collect_disk()
    net  = collect_network()

    return {
        "id":       cfg.server_id,
        "name":     cfg.server_name,
        "provider": cfg.provider,
        "region":   cfg.region,
        "type":     cfg.resource_type,
        "status":   get_status(cpu, mem, disk),
        "cpu":      cpu,
        "mem":      mem,
        "disk":     disk,
        "net":      net,
        "uptime":   collect_uptime(),
        "public_ip": collect_public_ip(),
    }


# ── Extra Servers (multi-server mode) ─────────────────────────────────────────

def load_extra_servers(path: str) -> list:
    """
    Optionally load additional servers from a JSON file.
    Useful if this agent is a 'hub' collecting from multiple targets.

    Format: [ { "id": "s001", "name": "db-01", "host": "10.0.0.5", ... } ]
    """
    try:
        with open(path) as f:
            data = json.load(f)
        log.info(f"Loaded {len(data)} extra servers from {path}")
        return data
    except Exception as e:
        log.warning(f"Could not load extra servers from {path}: {e}")
        return []


# ── Agent Loop ────────────────────────────────────────────────────────────────

class MCOAgent:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.session = build_session(cfg.api_key)
        self.heartbeat_url = f"{cfg.server_url}/api/agents/heartbeat"
        self.metrics_url   = f"{cfg.server_url}/api/agents/metrics"
        self._stop_event   = threading.Event()
        self._consecutive_errors = 0
        self.MAX_ERRORS = 10  # give up logging after this many

    def _post(self, url: str, payload: dict) -> Optional[dict]:
        try:
            resp = self.session.post(url, json=payload, timeout=10)
            resp.raise_for_status()
            self._consecutive_errors = 0
            return resp.json()
        except requests.exceptions.ConnectionError:
            if self._consecutive_errors == 0:
                log.warning(f"Cannot reach dashboard at {self.cfg.server_url}. Will retry…")
            self._consecutive_errors += 1
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                log.error("Invalid API key — check your --key or MCO_API_KEY.")
                self._stop_event.set()
            else:
                log.warning(f"HTTP {e.response.status_code}: {e}")
            self._consecutive_errors += 1
        except Exception as e:
            if self._consecutive_errors < self.MAX_ERRORS:
                log.warning(f"Request failed: {e}")
            self._consecutive_errors += 1
        return None

    def send_heartbeat(self, servers: list):
        payload = {
            "version": self.cfg.version,
            "servers": servers,
        }
        result = self._post(self.heartbeat_url, payload)
        if result:
            log.debug(f"Heartbeat OK — server time: {result.get('server_time', '?')}")
        return result

    def send_metrics(self, servers: list):
        payload = {"servers": servers}
        result = self._post(self.metrics_url, payload)
        if result:
            log.debug(f"Metrics pushed — {result.get('received', 0)} servers received")
        return result

    def run_once(self) -> list:
        """Collect metrics and push. Returns the server list."""
        log.debug("Collecting metrics…")
        servers = [collect_all_metrics(self.cfg)]

        # Summary line
        s = servers[0]
        log.info(
            f"[{s['name']}] CPU={s['cpu']}%  MEM={s['mem']}%  "
            f"DISK={s['disk']}%  NET={s['net']}  STATUS={s['status'].upper()}"
        )

        # Use heartbeat for normal cadence (lightweight), metrics for full push
        result = self.send_heartbeat(servers)
        return servers

    def run(self):
        log.info("=" * 55)
        log.info(f"  MultiCloudOps Agent v{self.cfg.version}")
        log.info(f"  Server   : {self.cfg.server_url}")
        log.info(f"  Agent    : {self.cfg.agent_name}")
        log.info(f"  Reporting: {self.cfg.server_name} ({self.cfg.provider} / {self.cfg.region})")
        log.info(f"  Interval : {self.cfg.interval}s")
        log.info("=" * 55)

        # Initial connectivity check
        log.info("Verifying connection to dashboard…")
        try:
            resp = self.session.get(f"{self.cfg.server_url}/health", timeout=10)
            resp.raise_for_status()
            log.info(f"Dashboard reachable. Version: {resp.json().get('version', '?')}")
        except Exception as e:
            log.warning(f"Dashboard not reachable yet ({e}). Will keep trying…")

        while not self._stop_event.is_set():
            start = time.time()
            try:
                self.run_once()
            except KeyboardInterrupt:
                break
            except Exception as e:
                log.error(f"Unexpected error in run loop: {e}")

            elapsed = time.time() - start
            sleep_for = max(0, self.cfg.interval - elapsed)
            self._stop_event.wait(sleep_for)

        log.info("Agent stopped.")

    def stop(self):
        self._stop_event.set()


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="MultiCloudOps Monitoring Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python mco_agent.py --server http://192.168.1.10:8000 --key mco-abc123

  # Custom server identity
  python mco_agent.py --server http://dashboard:8000 --key mco-abc123 \\
      --server-id prod-db-01 --server-name "Production DB" \\
      --provider AWS --region us-east-1

  # Via environment variables
  export MCO_SERVER=http://dashboard:8000
  export MCO_API_KEY=mco-abc123
  python mco_agent.py

  # Run every 15 seconds
  python mco_agent.py --server http://dashboard:8000 --key mco-abc123 --interval 15
        """,
    )
    p.add_argument("--server",        help="Dashboard URL  (or MCO_SERVER env var)")
    p.add_argument("--key",           help="Agent API key  (or MCO_API_KEY env var)")
    p.add_argument("--interval",      type=int, default=30, help="Push interval in seconds (default: 30)")
    p.add_argument("--name",          help="Agent name (default: hostname)")
    p.add_argument("--server-id",     dest="server_id",       help="Server ID shown in dashboard")
    p.add_argument("--server-name",   dest="server_name",     help="Server name shown in dashboard")
    p.add_argument("--provider",      help="Cloud provider label (AWS, Azure, GCP, On-Prem…)")
    p.add_argument("--region",        help="Region label (us-east-1, eastus, DC-Mumbai…)")
    p.add_argument("--resource-type", dest="resource_type",   help="Resource type (VM, EC2, Container…)")
    p.add_argument("--debug",         action="store_true",    help="Verbose debug logging")
    return p.parse_args()


def main():
    args = parse_args()
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    cfg = Config(args)
    cfg.validate()

    agent = MCOAgent(cfg)
    try:
        agent.run()
    except KeyboardInterrupt:
        log.info("Interrupted by user.")
        agent.stop()


if __name__ == "__main__":
    main()
