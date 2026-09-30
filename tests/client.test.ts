import assert from "node:assert/strict";
import { test } from "node:test";
import { AutomationApiClient } from "../src/client.js";
import { AutomationApiError } from "../src/errors.js";
import { jsonResponse, recordingFetch, testConfig } from "./support/harness.js";

test("rereads the token and retries once after a 401, because the app rotates it", async () => {
  const tokens = ["stale-token", "fresh-token"];
  let reads = 0;
  const { calls, fetchImpl } = recordingFetch((request) =>
    request.headers.authorization === "Bearer fresh-token"
      ? jsonResponse(200, { jobID: "job-1", state: "done" })
      : jsonResponse(401)
  );
  const client = new AutomationApiClient({
    config: testConfig({ staticToken: undefined }),
    fetchImpl,
    readTextFile: () => {
      const token = tokens[Math.min(reads, tokens.length - 1)] ?? "";
      reads += 1;
      return Promise.resolve(`${token}\n`);
    },
  });

  const { data } = await client.request<{ jobID: string }>({
    method: "GET",
    path: "/v1/jobs/job-1",
  });

  assert.equal(data.jobID, "job-1");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.headers.authorization, "Bearer stale-token");
  assert.equal(calls[1]?.headers.authorization, "Bearer fresh-token");
});

test("does not retry a 401 when the token was pinned by the environment", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(401));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/watch" }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationApiError);
      assert.equal(error.code, "TOKEN_REJECTED");
      assert.equal(error.retryable, false);
      return true;
    }
  );
  assert.equal(calls.length, 1);
});

test("keeps the bearer token out of error messages", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(401, "denied"));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/watch" }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationApiError);
      assert.doesNotMatch(error.message, /token-for-tests/);
      return true;
    }
  );
});

test("marks 503 retryable and 412 not, which is why the app separates them", async () => {
  for (const [status, code, retryable] of [
    [412, "PRECONDITION_FAILED", false],
    [503, "UNAVAILABLE", true],
  ] as const) {
    const { fetchImpl } = recordingFetch(() => jsonResponse(status));
    const client = new AutomationApiClient({ config: testConfig(), fetchImpl });
    await assert.rejects(
      client.request({ body: { action: "start" }, method: "POST", path: "/v1/watch" }),
      (error: unknown) => {
        assert.ok(error instanceof AutomationApiError);
        assert.equal(error.code, code);
        assert.equal(error.retryable, retryable);
        return true;
      }
    );
  }
});

test("refuses an oversized body instead of letting the app drop the connection", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  await assert.rejects(
    client.request({
      body: { mapping: { "Speaker 1": "x".repeat(40_000) } },
      method: "POST",
      path: "/v1/jobs/job-1/naming",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationApiError);
      assert.equal(error.code, "REQUEST_TOO_LARGE");
      return true;
    }
  );
  assert.equal(calls.length, 0);
});

test("accepts an empty 200 body, which the naming endpoints return", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(200));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  const { status } = await client.request({
    method: "POST",
    path: "/v1/jobs/job-1/naming/skip",
  });

  assert.equal(status, 200);
});

test("turns a refused connection into the instructions for enabling the API", async () => {
  const fetchImpl = () => Promise.reject(new TypeError("fetch failed"));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/watch" }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationApiError);
      assert.equal(error.code, "APP_UNREACHABLE");
      assert.match(error.message, /Local Automation API/);
      assert.match(error.message, /MEETINGTRANSCRIBER_DEBUG_RPC=1/);
      return true;
    }
  );
});

test("reports a missing token file with the path it looked at", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
  const client = new AutomationApiClient({
    config: testConfig({ staticToken: undefined, tokenPath: "/tmp/absent" }),
    fetchImpl,
    readTextFile: () => Promise.reject(new Error("ENOENT")),
  });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/watch" }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationApiError);
      assert.equal(error.code, "TOKEN_MISSING");
      assert.match(error.message, /\/tmp\/absent/);
      return true;
    }
  );
});

test("never sends a browser Origin header, which the app's guard rejects", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
  const client = new AutomationApiClient({ config: testConfig(), fetchImpl });

  await client.request({ method: "GET", path: "/v1/watch" });

  const headers = Object.keys(calls[0]?.headers ?? {}).map((key) =>
    key.toLowerCase()
  );
  assert.ok(!headers.includes("origin"));
});
