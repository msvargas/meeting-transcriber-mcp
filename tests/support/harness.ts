import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  AutomationApiClient,
  type FetchFn,
  type ReadTextFile,
} from "../../src/client.js";
import type { ServerConfig } from "../../src/config.js";
import { buildServer } from "../../src/server.js";

export const TEST_TOKEN = "token-for-tests";

export function testConfig(
  overrides: Partial<ServerConfig> = {}
): ServerConfig {
  return {
    baseUrl: "http://127.0.0.1:9876",
    requestTimeoutMs: 5000,
    staticToken: TEST_TOKEN,
    tokenPath: "/tmp/meeting-transcriber-mcp-test-token",
    ...overrides,
  };
}

export interface RecordedRequest {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

export function recordingFetch(
  responder: (request: RecordedRequest, callIndex: number) => Response
): { calls: RecordedRequest[]; fetchImpl: FetchFn } {
  const calls: RecordedRequest[] = [];
  const fetchImpl: FetchFn = (url, init) => {
    const recorded: RecordedRequest = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: { ...(init.headers as Record<string, string>) },
      method: init.method ?? "GET",
      url,
    };
    calls.push(recorded);
    return Promise.resolve(responder(recorded, calls.length - 1));
  };
  return { calls, fetchImpl };
}

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

/** What the naming endpoints really answer: a bare "ok", not a DTO. */
export function textResponse(status: number, body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain" },
    status,
  });
}

export interface Harness {
  client: Client;
  close: () => Promise<void>;
}

export async function connectHarness(options: {
  config?: ServerConfig;
  fetchImpl: FetchFn;
  readTextFile?: ReadTextFile;
}): Promise<Harness> {
  const apiClient = new AutomationApiClient({
    config: options.config ?? testConfig(),
    fetchImpl: options.fetchImpl,
    readTextFile: options.readTextFile,
  });
  const server = buildServer(apiClient);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "harness", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function textOf(result: unknown): string {
  const content =
    (result as { content?: { text?: string }[] }).content ?? [];
  return content.map((block) => block.text ?? "").join("\n");
}

export function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}
