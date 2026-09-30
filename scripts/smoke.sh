#!/usr/bin/env bash
set -euo pipefail

# Drives the built server over stdio the way an MCP client does: handshake, list the tools,
# then read the watch status. With Meeting Transcriber running and its Local Automation API on,
# the last call returns real state; with the app closed it returns the instructions for
# enabling the API, which is also a useful thing to confirm.

cd "$(dirname "$0")/.."

if [ ! -f dist/index.js ]; then
  echo "dist/index.js is missing. Run: npm run build" >&2
  exit 1
fi

{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_watch_status","arguments":{}}}'
  # Give the server room to answer before stdin closes and it shuts down.
  sleep 3
} | node dist/index.js
