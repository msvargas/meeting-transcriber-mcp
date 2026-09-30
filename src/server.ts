import { McpServer } from "@modelcontextprotocol/server";
import type { AutomationApiClient } from "./client.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerNamingTools } from "./tools/naming.js";
import { registerTranscribeTool } from "./tools/transcribe.js";
import { registerWatchTools } from "./tools/watch.js";

export const SERVER_NAME = "meeting-transcriber";
export const SERVER_VERSION = "0.1.0";

export function buildServer(client: AutomationApiClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  registerTranscribeTool(server, client);
  registerJobTools(server, client);
  registerNamingTools(server, client);
  registerWatchTools(server, client);
  return server;
}
