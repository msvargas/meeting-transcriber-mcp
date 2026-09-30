import { readFile } from "node:fs/promises";
import type { ServerConfig } from "./config.js";
import {
  AutomationApiError,
  httpError,
  missingTokenError,
  unreachableError,
} from "./errors.js";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export type ReadTextFile = (path: string) => Promise<string>;

/**
 * The app caps a whole request — request line, headers and body together — at 64 KiB and
 * closes the connection without answering when that is exceeded. Refusing earlier turns a
 * confusing transport failure into a readable reason.
 */
const MAX_BODY_BYTES = 32 * 1024;

export interface RequestOptions {
  body?: unknown;
  /** The naming endpoints answer 200 with a plain "ok" rather than a DTO. */
  expectJson?: boolean;
  idempotencyKey?: string;
  method: "GET" | "POST";
  path: string;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ClientOptions {
  config: ServerConfig;
  fetchImpl?: FetchFn;
  readTextFile?: ReadTextFile;
}

export class AutomationApiClient {
  private cachedToken: string | undefined;
  private readonly config: ServerConfig;
  private readonly fetchImpl: FetchFn;
  private readonly readTextFile: ReadTextFile;

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.readTextFile =
      options.readTextFile ?? ((path) => readFile(path, "utf8"));
  }

  async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
    const token = await this.token(false);
    let response = await this.send(options, token);
    if (response.status === 401 && this.config.staticToken === undefined) {
      const refreshed = await this.token(true);
      if (refreshed !== token) {
        response = await this.send(options, refreshed);
      }
    }
    const body = await response.text();
    if (response.status >= 400) {
      throw httpError(response.status, this.config.tokenPath, body);
    }
    const data =
      options.expectJson === false ? (undefined as T) : parseJson<T>(body);
    return { data, status: response.status };
  }

  /** Only ever called with a path the app itself reported, so no tool reads arbitrary files. */
  async readReportedFile(path: string): Promise<string> {
    return await this.readTextFile(path);
  }

  private async send(
    options: RequestOptions,
    token: string
  ): Promise<Response> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    };
    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }
    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = JSON.stringify(options.body);
      if (Buffer.byteLength(payload, "utf8") > MAX_BODY_BYTES) {
        throw new AutomationApiError({
          code: "REQUEST_TOO_LARGE",
          message: `The request body is ${Buffer.byteLength(payload, "utf8")} bytes, past what the app accepts on one connection. Send fewer paths or a smaller speaker mapping.`,
        });
      }
      headers["content-type"] = "application/json";
    }
    const init: RequestInit = {
      headers,
      method: options.method,
      signal: AbortSignal.timeout(
        options.timeoutMs ?? this.config.requestTimeoutMs
      ),
    };
    if (payload !== undefined) {
      init.body = payload;
    }
    try {
      return await this.fetchImpl(`${this.config.baseUrl}${options.path}`, init);
    } catch (error) {
      throw this.transportError(error);
    }
  }

  private async token(forceReload: boolean): Promise<string> {
    if (this.config.staticToken) {
      return this.config.staticToken;
    }
    if (!forceReload && this.cachedToken) {
      return this.cachedToken;
    }
    let raw: string;
    try {
      raw = await this.readTextFile(this.config.tokenPath);
    } catch {
      throw missingTokenError(this.config.tokenPath);
    }
    const token = raw.trim();
    if (!token) {
      throw missingTokenError(this.config.tokenPath);
    }
    this.cachedToken = token;
    return token;
  }

  private transportError(error: unknown): AutomationApiError {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return new AutomationApiError({
        code: "TIMEOUT",
        message: `The app did not answer within the request budget. A transcription that outlives it keeps running, so poll get_job instead of assuming it failed.`,
        retryable: true,
      });
    }
    return unreachableError(this.config.baseUrl);
  }
}

function parseJson<T>(body: string): T {
  if (!body.trim()) {
    return undefined as T;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new AutomationApiError({
      code: "UNEXPECTED_RESPONSE",
      message: `The app returned a body that is not JSON: ${body.slice(0, 200)}`,
    });
  }
}
