#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { AutomationApiClient } from "./client.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const client = new AutomationApiClient({ config: loadConfig() });

serveStdio(() => buildServer(client), {
  onerror: (error) => {
    // stdout carries the JSON-RPC stream, so diagnostics only ever go to stderr.
    process.stderr.write(`[meeting-transcriber-mcp] ${error.message}\n`);
  },
});
