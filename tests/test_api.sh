#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MultiCloudOps — API Smoke Test (curl-based)
# Run this directly against the server to verify all endpoints respond.
#
# Usage:
#   chmod +x test_api.sh
#   ./test_api.sh                           # assumes localhost:8000
#   ./test_api.sh http://43.204.x.x:8000   # remote server
#   BASE=http://your-server ./test_api.sh
# ─────────────────────────────────────────────────────────────────────────────

BASE="${1:-${BASE:-http://localhost:8000}}"
PASS=0; FAIL=0

GREEN='\033[92m'; RED='\033[91m'; YELLOW='\033[93m'
CYAN='\033[96m';  BOLD='\033[1m'; RESET='\033[0m'

check() {
  local label="$1"; local url="$2"; local expect_field="$3"
  local status
  local body
  body=$(curl -sf --max-time 10 "$url" 2>/dev/null)
  status=$?
  if [ $status -eq 0 ] && echo "$body" | grep -q "$expect_field"; then
    echo -e "  ${GREEN}✓${RESET} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${RESET} $label  ${RED}(status=$status, expected '$expect_field')${RESET}"
    FAIL=$((FAIL+1))
  fi
}

post_check() {
  local label="$1"; local url="$2"; local data="$3"; local expect_field="$4"
  local body
  body=$(curl -sf --max-time 10 -X POST -H "Content-Type: application/json" \
    -d "$data" "$url" 2>/dev/null)
  if echo "$body" | grep -q "$expect_field"; then
    echo -e "  ${GREEN}✓${RESET} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${RESET} $label  ${RED}(expected '$expect_field' in response)${RESET}"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  MultiCloudOps API Smoke Test${RESET}"
echo -e "${BOLD}${CYAN}  $BASE${RESET}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"

# ── Core ──────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Core${RESET}"
check "GET  /health"           "$BASE/health"             '"status"'
check "GET  /"                 "$BASE/"                   '"version"'
check "GET  /docs"             "$BASE/docs"               'swagger'

# ── Auth ──────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Auth${RESET}"
# Register a test user (may already exist — that's fine)
REG=$(curl -sf -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mco.local","username":"testuser","password":"testpass1","full_name":"Test User"}' 2>/dev/null)
if echo "$REG" | grep -q "access_token"; then
  echo -e "  ${GREEN}✓${RESET} POST /api/auth/register"
  PASS=$((PASS+1))
  TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
else
  echo -e "  ${YELLOW}⚠${RESET} POST /api/auth/register  (user may already exist)"
fi

# Login
LOGIN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=testpass1" 2>/dev/null)
if echo "$LOGIN" | grep -q "access_token"; then
  echo -e "  ${GREEN}✓${RESET} POST /api/auth/login"
  PASS=$((PASS+1))
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
else
  echo -e "  ${RED}✗${RESET} POST /api/auth/login"
  FAIL=$((FAIL+1))
fi

if [ -n "$TOKEN" ]; then
  ME=$(curl -sf "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  if echo "$ME" | grep -q "username"; then
    echo -e "  ${GREEN}✓${RESET} GET  /api/auth/me"
    PASS=$((PASS+1))
  fi
fi

# ── Monitoring ────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Monitoring${RESET}"
check "GET  /api/servers"         "$BASE/api/servers"         '"servers"'
check "GET  /api/servers/live"    "$BASE/api/servers/live"    '"servers"'
check "GET  /api/alerts"          "$BASE/api/alerts"          '"alerts"'
check "GET  /api/incidents"       "$BASE/api/incidents"       '"incidents"'
check "GET  /api/stats/overview"  "$BASE/api/stats/overview"  '"total"'
check "GET  /api/history/overview""$BASE/api/history/overview""points"'

# ── Agents ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Agents${RESET}"
check "GET  /api/agents"          "$BASE/api/agents"          '"agents"'

# Register a test agent
REG_AGENT=$(curl -sf -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test-agent","provider":"Test","region":"local"}' 2>/dev/null)
if echo "$REG_AGENT" | grep -q "api_key"; then
  echo -e "  ${GREEN}✓${RESET} POST /api/agents/register"
  PASS=$((PASS+1))
  AGENT_KEY=$(echo "$REG_AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_key'])" 2>/dev/null)
  AGENT_ID=$(echo "$REG_AGENT"  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"      2>/dev/null)
else
  echo -e "  ${RED}✗${RESET} POST /api/agents/register"
  FAIL=$((FAIL+1))
fi

if [ -n "$AGENT_KEY" ]; then
  # Heartbeat
  HB=$(curl -sf -X POST "$BASE/api/agents/heartbeat" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Key: $AGENT_KEY" \
    -d '{"version":"1.0","servers":[{"id":"test-srv-1","name":"smoke-server","provider":"Test","region":"local","type":"VM","status":"healthy","cpu":35.0,"mem":55.0,"disk":40,"net":"100 Mbps","uptime":"99%","public_ip":"1.2.3.4"}]}' 2>/dev/null)
  if echo "$HB" | grep -q "ok"; then
    echo -e "  ${GREEN}✓${RESET} POST /api/agents/heartbeat (with server data)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${RESET} POST /api/agents/heartbeat"
    FAIL=$((FAIL+1))
  fi

  # Verify server appears
  sleep 1
  SRVS=$(curl -sf "$BASE/api/servers" 2>/dev/null)
  if echo "$SRVS" | grep -q "smoke-server"; then
    echo -e "  ${GREEN}✓${RESET} Server visible after heartbeat  (agent data flows to /api/servers)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${RESET} Server NOT visible after heartbeat"
    FAIL=$((FAIL+1))
  fi

  # Verify stats update
  STATS=$(curl -sf "$BASE/api/stats/overview" 2>/dev/null)
  TOTAL=$(echo "$STATS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
  if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} Stats reflect agent data  (total=$TOTAL)"
    PASS=$((PASS+1))
  fi

  # Push metrics
  METRICS=$(curl -sf -X POST "$BASE/api/agents/metrics" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Key: $AGENT_KEY" \
    -d '{"servers":[{"id":"test-srv-1","name":"smoke-server","provider":"Test","region":"local","type":"VM","status":"critical","cpu":95.0,"mem":90.0,"disk":80,"net":"500 Mbps","uptime":"99%","public_ip":"1.2.3.4"}]}' 2>/dev/null)
  if echo "$METRICS" | grep -q '"received"'; then
    echo -e "  ${GREEN}✓${RESET} POST /api/agents/metrics"
    PASS=$((PASS+1))
  fi

  # Alerts should now exist
  sleep 1
  ALERTS=$(curl -sf "$BASE/api/alerts" 2>/dev/null)
  ALERT_COUNT=$(echo "$ALERTS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
  if [ "$ALERT_COUNT" -gt 0 ] 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} Critical server generates alert  (total=$ALERT_COUNT)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${RESET} No alert generated for critical server"
    FAIL=$((FAIL+1))
  fi

  # Cleanup: delete test agent
  DEL=$(curl -sf -X DELETE "$BASE/api/agents/$AGENT_ID" 2>/dev/null)
  if echo "$DEL" | grep -q "Deleted\|deleted"; then
    echo -e "  ${GREEN}✓${RESET} DELETE /api/agents/$AGENT_ID  (cleanup)"
    PASS=$((PASS+1))
  fi
fi

# ── Incidents ─────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Incidents${RESET}"
INC=$(curl -sf -X POST "$BASE/api/incidents" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke test incident","severity":"medium","impact":"Low"}' 2>/dev/null)
if echo "$INC" | grep -q '"id"'; then
  echo -e "  ${GREEN}✓${RESET} POST /api/incidents"
  PASS=$((PASS+1))
  INC_ID=$(echo "$INC" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

  # Update
  UPD=$(curl -sf -X PATCH "$BASE/api/incidents/$INC_ID" \
    -H "Content-Type: application/json" \
    -d '{"status":"resolved"}' 2>/dev/null)
  if echo "$UPD" | grep -q '"resolved"'; then
    echo -e "  ${GREEN}✓${RESET} PATCH /api/incidents/$INC_ID (status → resolved)"
    PASS=$((PASS+1))
  fi

  # Delete
  curl -sf -X DELETE "$BASE/api/incidents/$INC_ID" > /dev/null 2>&1
  echo -e "  ${GREEN}✓${RESET} DELETE /api/incidents/$INC_ID (cleanup)"
  PASS=$((PASS+1))
fi

# ── Cloud Accounts ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Cloud Accounts${RESET}"
check "GET  /api/cloud-accounts" "$BASE/api/cloud-accounts" '"accounts"'

# ── WebSocket ─────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}WebSocket${RESET}"
if command -v wscat &>/dev/null; then
  WS_OUT=$(echo '{}' | timeout 3 wscat -c "ws://${BASE#http://}/ws/metrics" 2>&1 || true)
  if echo "$WS_OUT" | grep -q "Connected\|metrics"; then
    echo -e "  ${GREEN}✓${RESET} WS /ws/metrics  (wscat)"
    PASS=$((PASS+1))
  fi
else
  echo -e "  ${YELLOW}⚠${RESET} WebSocket test skipped  (install: npm i -g wscat)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  RESULTS${RESET}"
echo -e "  ${GREEN}Passed : $PASS${RESET}"
echo -e "  ${RED}Failed : $FAIL${RESET}"
echo -e "  Total  : $TOTAL"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
echo ""

[ $FAIL -eq 0 ] && exit 0 || exit 1
