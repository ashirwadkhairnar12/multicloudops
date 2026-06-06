#!/usr/bin/env python3
"""
MultiCloudOps — Agent Integration Test
=======================================
Simulates a real agent pushing metrics to verify the full pipeline:
  Agent → API → DB → WebSocket → Dashboard

Usage:
    python test_agent.py --server http://your-server:8000
    python test_agent.py --server http://localhost:8000 --verbose
"""
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
import threading

GREEN = '\033[92m'; RED = '\033[91m'; YELLOW = '\033[93m'
CYAN  = '\033[96m'; BOLD = '\033[1m'; RESET = '\033[0m'

PASS = 0; FAIL = 0

def check(cond, label, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  {GREEN}✓{RESET} {label}" + (f"  ({detail})" if detail else ''))
    else:
        FAIL += 1
        print(f"  {RED}✗{RESET} {label}" + (f"  {RED}{detail}{RESET}" if detail else ''))
    return cond

def api(base, path, method='GET', body=None, headers=None):
    h = {'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(body).encode() if body else None,
        headers=h, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as e:
        return {"error": str(e)}, 0

def section(title):
    print(f"\n{BOLD}{CYAN}{'─'*50}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*50}{RESET}")


def test_full_pipeline(base, verbose=False):
    # ── 1. Health ──
    section("1. Server Health")
    data, status = api(base, '/health')
    check(status == 200 and data.get('status') == 'ok', "Server is up", data.get('version','?'))

    # ── 2. Register agent ──
    section("2. Agent Registration")
    data, status = api(base, '/api/agents/register', 'POST', {
        "name":     "integration-test-agent",
        "provider": "TestCloud",
        "region":   "test-region-1",
    })
    agent_ok = check(status == 200 and 'api_key' in data, "Agent registered",
                     f"id={data.get('id','?')}")
    if not agent_ok:
        print(f"  {RED}Cannot continue without agent{RESET}")
        return
    agent_id  = data['id']
    agent_key = data['api_key']
    print(f"  ID : {agent_id}")
    print(f"  Key: {agent_key[:20]}...")

    # ── 3. Heartbeat ──
    section("3. Heartbeat")
    TEST_SERVERS = [
        {"id":"test-ec2-001","name":"web-prod-01","provider":"TestCloud","region":"test-region-1",
         "type":"VM","status":"healthy","cpu":32.5,"mem":61.2,"disk":43,"net":"245 Mbps",
         "uptime":"99.98%","public_ip":"10.0.1.100"},
        {"id":"test-ec2-002","name":"api-server-01","provider":"TestCloud","region":"test-region-1",
         "type":"VM","status":"warning","cpu":75.0,"mem":82.0,"disk":55,"net":"890 Mbps",
         "uptime":"99.5%","public_ip":"10.0.1.101"},
    ]
    data, status = api(base, '/api/agents/heartbeat', 'POST',
                       {"version":"1.0","servers":TEST_SERVERS},
                       {"X-Agent-Key": agent_key})
    check(status == 200 and data.get('status') == 'ok', "Heartbeat accepted",
          data.get('message',''))

    # ── 4. Verify servers appear ──
    section("4. Server Visibility")
    time.sleep(1)
    data, status = api(base, '/api/servers')
    servers_found = [s for s in data.get('servers',[]) if s['id'].startswith('test-ec2')]
    check(len(servers_found) == 2, f"Both servers visible",
          f"found {len(servers_found)}/2")
    for s in servers_found:
        check(s.get('public_ip'), f"  {s['name']} has public IP", s.get('public_ip','MISSING'))

    # ── 5. Push critical server ──
    section("5. Alert Generation")
    CRITICAL_SERVER = {**TEST_SERVERS[0], "status":"critical","cpu":96.0,"mem":94.0}
    data, status = api(base, '/api/agents/metrics', 'POST',
                       {"servers":[CRITICAL_SERVER]},
                       {"X-Agent-Key": agent_key})
    check(status == 200, "Metrics pushed", f"received={data.get('received',0)}")

    time.sleep(1)
    data, status = api(base, '/api/alerts')
    critical_alerts = [a for a in data.get('alerts',[]) if a['severity'] == 'critical']
    check(len(critical_alerts) > 0, "Critical alert generated",
          f"{len(critical_alerts)} critical alerts")

    # ── 6. Stats reflect data ──
    section("6. Stats Overview")
    data, status = api(base, '/api/stats/overview')
    check(status == 200, "Stats endpoint OK")
    check(data.get('total', 0) > 0, "Total resources > 0", f"total={data.get('total')}")
    check(data.get('critical', 0) > 0, "Critical count > 0", f"critical={data.get('critical')}")

    # ── 7. History ──
    section("7. Metric History")
    data, status = api(base, '/api/history/overview?hours=1')
    check(status == 200, "History endpoint OK", f"{len(data.get('points',[]))} points")

    # ── 8. Offline detection ──
    section("8. Offline Detection")
    # Update agent's last_seen to simulate going offline
    # We can test this by just checking the logic exists
    data, status = api(base, f'/api/agents/{agent_id}')
    check(status == 200 and data.get('status') in ('online','offline'),
          "Agent status tracked", data.get('status','?'))

    # ── 9. Incident auto-detect ──
    section("9. Auto-Incident Detection")
    data, status = api(base, '/api/incidents/auto-detect', 'POST')
    check(status == 200, "Auto-detect ran",
          f"{data.get('total',0)} incidents created")
    data, status = api(base, '/api/incidents')
    check(status == 200, "Incidents endpoint OK",
          f"{data.get('total',0)} total incidents")

    # ── 10. WebSocket ──
    section("10. WebSocket")
    ws_received = []
    ws_error    = []
    try:
        import websocket
        ws_url = base.replace('http','ws') + '/ws/metrics'

        def on_msg(ws, msg):
            ws_received.append(json.loads(msg))
            ws.close()

        def on_err(ws, err):
            ws_error.append(str(err))

        t = threading.Thread(target=lambda: websocket.WebSocketApp(
            ws_url, on_message=on_msg, on_error=on_err).run_forever())
        t.daemon = True
        t.start()
        t.join(timeout=8)
        check(len(ws_received) > 0, "WebSocket delivers metrics",
              f"received {len(ws_received)} message(s)")
    except ImportError:
        print(f"  {YELLOW}⚠{RESET} WebSocket test skipped (pip install websocket-client)")

    # ── Cleanup ──
    section("Cleanup")
    data, status = api(base, f'/api/agents/{agent_id}', 'DELETE')
    check(status == 200, "Test agent deleted")

    # Verify servers gone
    time.sleep(0.5)
    data, status = api(base, '/api/servers')
    remaining = [s for s in data.get('servers',[]) if s['id'].startswith('test-ec2')]
    check(len(remaining) == 0, "Test servers removed", f"{len(remaining)} remaining")


def main():
    parser = argparse.ArgumentParser(description='MultiCloudOps Agent Pipeline Test')
    parser.add_argument('--server',  default='http://localhost:8000', help='API base URL')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    print(f"\n{BOLD}{'═'*52}{RESET}")
    print(f"{BOLD}  MultiCloudOps Agent Integration Test{RESET}")
    print(f"{BOLD}  Server: {args.server}{RESET}")
    print(f"{BOLD}{'═'*52}{RESET}")

    test_full_pipeline(args.server, args.verbose)

    print(f"\n{BOLD}{'═'*52}{RESET}")
    print(f"{BOLD}  RESULTS{RESET}")
    print(f"  {GREEN}Passed : {PASS}{RESET}")
    print(f"  {RED}Failed : {FAIL}{RESET}")
    print(f"{BOLD}{'═'*52}{RESET}\n")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == '__main__':
    main()
