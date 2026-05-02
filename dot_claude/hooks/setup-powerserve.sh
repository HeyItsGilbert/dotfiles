#!/bin/bash
# Session State hook: Start PowerServe for persistent PowerShell sessions across tools
# Returns Claude Code hook JSON to feed lint issues back to Claude
# Ref: https://code.claude.com/docs/en/hooks#session-state

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Start a PowerServe instance for this session, using a unique name to avoid
# conflicts in the background. The instance will persist across tools and can be used to run
# multiple PowerShell commands without startup overhead.
PIPE_NAME="ClaudeScriptAnalyzer-$SESSION_ID"

# First call starts the server and returns the pwsh host PID via $PID
POWERSERVE_PID=$(PowerServeClient.exe -p "$PIPE_NAME" -w "$CWD" -c "\$PID" 2>/dev/null)

# Export the PID so cleanup can kill it directly without process discovery
if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$POWERSERVE_PID" ]; then
  echo "POWERSERVE_PID=$POWERSERVE_PID" >> "$CLAUDE_ENV_FILE"
fi

exit 0