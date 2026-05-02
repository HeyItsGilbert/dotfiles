#!/bin/bash
# PostToolUse hook: Run prettier on edited/written files
# Input: JSON on stdin with tool_input.file_path
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

npx prettier --write "$FILE_PATH"
