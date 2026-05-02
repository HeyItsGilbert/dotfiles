#!/bin/bash
# SessionEnd hook: Kill the PowerServe pwsh process for this session
# Input: JSON on stdin with session_id, reason, etc.
# Note: SessionEnd has a 1.5s default timeout
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
PIPE_NAME="ClaudeScriptAnalyzer-$SESSION_ID"

# Fast path: kill by PID exported during setup (no process discovery needed)
if [ -n "$POWERSERVE_PID" ]; then
  kill -9 "$POWERSERVE_PID" 2>/dev/null
fi

# Fallback: graceful shutdown via client + wmic termination by command line
PowerServeClient.exe -p "$PIPE_NAME" -c "exit" >/dev/null 2>&1 &
# Force kill any lingering pwsh.exe processes with the unique pipe name in their command line to ensure cleanup within the short SessionEnd timeout
wmic process where "name='pwsh.exe' and commandline like '%${PIPE_NAME}%'" call terminate >/dev/null 2>&1

exit 0
