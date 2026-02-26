#!/usr/bin/env bash
INPUT=$(cat)
curl -sf -X POST http://localhost:7823/event \
  -H "Content-Type: application/json" \
  -d "{\"hook\":\"PostToolUse\",\"session_id\":\"${CLAUDE_SESSION_ID:-unknown}\",\"agent_id\":\"${CLAUDE_AGENT_ID:-agent-0}\",$(echo "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["tool_name","tool_response","duration_ms"] if k in d})[1:-1])')}" \
  > /dev/null 2>&1 || true
