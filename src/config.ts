import { homedir } from "node:os";
import { join } from "node:path";

/** The app pins its listener to the IPv4 loopback, so it is never reachable off the machine. */
export const DEFAULT_BASE_URL = "http://127.0.0.1:9876";

/** Enough for every endpoint except the blocking transcribe path, which passes its own budget. */
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ServerConfig {
  baseUrl: string;
  requestTimeoutMs: number;
  /** Set only when the token came from the environment, which disables the reload-on-401 path. */
  staticToken: string | undefined;
  tokenPath: string;
}

export function defaultTokenPath(home: string = homedir()): string {
  return join(
    home,
    "Library",
    "Application Support",
    "MeetingTranscriber",
    ".rpc-token"
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const timeout = Number.parseInt(env.MEETING_TRANSCRIBER_TIMEOUT_MS ?? "", 10);
  return {
    baseUrl: stripTrailingSlash(
      env.MEETING_TRANSCRIBER_BASE_URL?.trim() || DEFAULT_BASE_URL
    ),
    requestTimeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    staticToken: env.MEETING_TRANSCRIBER_TOKEN?.trim() || undefined,
    tokenPath: env.MEETING_TRANSCRIBER_TOKEN_PATH?.trim() || defaultTokenPath(),
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
