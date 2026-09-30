import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectHarness,
  isError,
  jsonResponse,
  recordingFetch,
  textOf,
  textResponse,
} from "./support/harness.js";

const DONE_JOB = {
  jobID: "job-1",
  meetingTitle: "Daily Standup",
  protocolPath: "/recordings/standup-protocol.md",
  state: "done",
  transcript: "[00:00:04] Alice: morning",
  transcriptPath: "/recordings/standup.md",
  warnings: [],
};

test("exposes the read and write tools without any microphone recording control", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
  const harness = await connectHarness({ fetchImpl });
  try {
    const { tools } = await harness.client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "confirm_naming",
      "enqueue_files",
      "get_job",
      "get_naming",
      "get_watch_status",
      "set_watch",
      "skip_naming",
      "transcribe_file",
    ]);
  } finally {
    await harness.close();
  }
});

test("set_watch offers start and stop but not the blind toggle", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(200, {}));
  const harness = await connectHarness({ fetchImpl });
  try {
    const { tools } = await harness.client.listTools();
    const schema = tools.find((tool) => tool.name === "set_watch")?.inputSchema;
    const action = (
      schema as { properties?: { action?: { enum?: string[] } } }
    ).properties?.action;
    assert.deepEqual(action?.enum, ["start", "stop"]);
  } finally {
    await harness.close();
  }
});

test("transcribe_file asks for the inline transcript and honours an idempotency key", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, DONE_JOB));
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { idempotencyKey: "standup-2026-09-30", path: "/recordings/standup.wav" },
      name: "transcribe_file",
    });

    assert.equal(isError(result), false);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "http://127.0.0.1:9876/v1/transcribe?include=transcript"
    );
    assert.deepEqual(calls[0]?.body, {
      maxWaitSeconds: 600,
      path: "/recordings/standup.wav",
    });
    assert.equal(calls[0]?.headers["idempotency-key"], "standup-2026-09-30");
    assert.match(textOf(result), /\[00:00:04\] Alice: morning/);
  } finally {
    await harness.close();
  }
});

test("a 202 is reported as unfinished rather than as a failure", async () => {
  const { fetchImpl } = recordingFetch(() =>
    jsonResponse(202, { jobID: "job-1", state: "transcribing" })
  );
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { maxWaitSeconds: 5, path: "/recordings/long.wav" },
      name: "transcribe_file",
    });

    assert.equal(isError(result), false);
    const text = textOf(result);
    assert.match(text, /Still running after 5s/);
    assert.match(text, /poll get_job with jobID job-1/);
  } finally {
    await harness.close();
  }
});

test("a job in error comes back as an error result the model can read", async () => {
  const { fetchImpl } = recordingFetch(() =>
    jsonResponse(200, {
      error: "transcription engine failed",
      jobID: "job-2",
      state: "error",
    })
  );
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { path: "/recordings/broken.wav" },
      name: "transcribe_file",
    });

    assert.equal(isError(result), true);
    assert.match(textOf(result), /transcription engine failed/);
    assert.match(textOf(result), /retry this job from the menu bar/);
  } finally {
    await harness.close();
  }
});

test("get_job reads the protocol only from the path the app reported", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(200, DONE_JOB));
  const requested: string[] = [];
  const harness = await connectHarness({
    fetchImpl,
    readTextFile: (path) => {
      requested.push(path);
      return Promise.resolve("# Summary\n- shipped it");
    },
  });
  try {
    const result = await harness.client.callTool({
      arguments: { includeProtocol: true, jobID: "job-1" },
      name: "get_job",
    });

    assert.deepEqual(requested, ["/recordings/standup-protocol.md"]);
    assert.match(textOf(result), /# Summary/);
  } finally {
    await harness.close();
  }
});

test("get_job surfaces an unknown id with the reasons it can happen", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(404));
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { jobID: "missing" },
      name: "get_job",
    });

    assert.equal(isError(result), true);
    const text = textOf(result);
    assert.match(text, /NOT_FOUND/);
    assert.match(text, /aged out/);
    assert.match(text, /Retrying will not change this answer/);
  } finally {
    await harness.close();
  }
});

test("naming can be read, confirmed and skipped", async () => {
  const { calls, fetchImpl } = recordingFetch((request) => {
    if (request.method === "GET") {
      return jsonResponse(200, {
        jobID: "job-1",
        participants: ["Alice", "Bob"],
        speakers: [
          { label: "Speaker 1", speakingSeconds: 412.5, suggested: "Alice" },
          { label: "Speaker 2", speakingSeconds: 88, suggested: "Speaker 2" },
        ],
      });
    }
    return textResponse(200, "ok");
  });
  const harness = await connectHarness({ fetchImpl });
  try {
    const read = await harness.client.callTool({
      arguments: { jobID: "job-1" },
      name: "get_naming",
    });
    assert.match(textOf(read), /Speaker 1 -> suggested "Alice" \(412\.5s speaking\)/);
    assert.match(textOf(read), /no known voice matched/);

    const confirmed = await harness.client.callTool({
      arguments: { jobID: "job-1", mapping: { "Speaker 2": "Bob" } },
      name: "confirm_naming",
    });
    assert.equal(isError(confirmed), false);
    assert.equal(calls[1]?.url, "http://127.0.0.1:9876/v1/jobs/job-1/naming");
    assert.deepEqual(calls[1]?.body, { mapping: { "Speaker 2": "Bob" } });

    const skipped = await harness.client.callTool({
      arguments: { jobID: "job-1" },
      name: "skip_naming",
    });
    assert.equal(isError(skipped), false);
    assert.equal(
      calls[2]?.url,
      "http://127.0.0.1:9876/v1/jobs/job-1/naming/skip"
    );
    assert.match(textOf(skipped), /auto-assigned names/);
  } finally {
    await harness.close();
  }
});

test("naming on a job that moved on is reported as a state conflict", async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse(409));
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { jobID: "job-1" },
      name: "skip_naming",
    });

    assert.equal(isError(result), true);
    assert.match(textOf(result), /CONFLICT/);
  } finally {
    await harness.close();
  }
});

test("watch status is rendered, and set_watch sends the desired end state", async () => {
  const watchStatus = {
    badge: "recording",
    manualRecording: false,
    permissionsHealthy: true,
    state: "recording",
    watching: true,
  };
  const { calls, fetchImpl } = recordingFetch(() =>
    jsonResponse(200, watchStatus)
  );
  const harness = await connectHarness({ fetchImpl });
  try {
    const status = await harness.client.callTool({
      arguments: {},
      name: "get_watch_status",
    });
    assert.match(textOf(status), /Watching for meetings: yes/);
    assert.match(textOf(status), /Menu bar badge: recording/);

    await harness.client.callTool({
      arguments: { action: "stop" },
      name: "set_watch",
    });
    assert.deepEqual(calls[1]?.body, { action: "stop" });
  } finally {
    await harness.close();
  }
});

test("enqueue_files returns the ids to poll", async () => {
  const { calls, fetchImpl } = recordingFetch(() =>
    jsonResponse(200, { jobIDs: ["job-a", "job-b"] })
  );
  const harness = await connectHarness({ fetchImpl });
  try {
    const result = await harness.client.callTool({
      arguments: { paths: ["/recordings/a.wav", "/recordings/b.wav"] },
      name: "enqueue_files",
    });

    assert.deepEqual(calls[0]?.body, {
      paths: ["/recordings/a.wav", "/recordings/b.wav"],
    });
    assert.match(textOf(result), /Queued 2 job\(s\)/);
    assert.match(textOf(result), /job-b/);
  } finally {
    await harness.close();
  }
});

test("an unreachable app tells the caller how to turn the API on", async () => {
  const harness = await connectHarness({
    fetchImpl: () => Promise.reject(new TypeError("fetch failed")),
  });
  try {
    const result = await harness.client.callTool({
      arguments: {},
      name: "get_watch_status",
    });

    assert.equal(isError(result), true);
    assert.match(textOf(result), /Settings > Advanced/);
  } finally {
    await harness.close();
  }
});
