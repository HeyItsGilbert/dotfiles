#!/bin/bash
# PostToolUse hook: Run PSScriptAnalyzer on edited/written PowerShell files
# Returns Claude Code hook JSON to feed lint issues back to Claude
# Ref: https://code.claude.com/docs/en/hooks#posttooluse-decision-control

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only analyze PowerShell files
case "$FILE_PATH" in
  *.ps1|*.psm1|*.psd1) ;;
  *) exit 0 ;;
esac

# Run ScriptAnalyzer via persistent PowerServe instance, inline the PS command
RESULT=$(PowerServeClient.exe \
  -p "ClaudeScriptAnalyzer-$SESSION_ID" \
  -w "$CWD" \
  -c "\$r = @(Invoke-ScriptAnalyzer -Path \"$FILE_PATH\" -Severity Error, Warning); if (\$r.Count -gt 0) { \$r | Select-Object RuleName, Severity, Line, Column, Message | ConvertTo-Json -Compress }" \
  2>/dev/null)

# Graceful degradation: don't block if PowerServe is unavailable or no issues found
if [ $? -ne 0 ] || [ -z "$RESULT" ] || [ "$RESULT" = "null" ] || [ "$RESULT" = "[]" ]; then
  exit 0
fi

# Feed issues back to Claude using PostToolUse decision control
jq -n --arg issues "$RESULT" '{
  decision: "block",
  reason: ("PSScriptAnalyzer found issues that must be fixed:\n" + $issues)
}'
