import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AutomationApiClient } from "../client.js";
import { formatJob } from "../format.js";
import type { JobStatus } from "../types.js";
import { errorResult, textResult, withApiErrors } from "./shared.js";

const DEFAULT_MAX_WAIT_SECONDS = 600;
/** Leaves the app room to answer after its own wait elapses rather than aborting on top of it. */
const TIMEOUT_SLACK_SECONDS = 30;

const inputSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Reuse the same key when retrying so the repeat returns the original job instead of enqueuing a duplicate. The app dedupes sequential retries within one session of its automation API."
    ),
  includeTranscript: z
    .boolean()
    .optional()
    .describe(
      "Fold the transcript text into the answer instead of returning only a file path. Defaults to true, which is what you want unless the transcript is large and you only need the paths."
    ),
  maxWaitSeconds: z
    .number()
    .int()
    .min(0)
    .max(1800)
    .optional()
    .describe(
      "How long the app blocks before answering. Defaults to 600. Use 0 to enqueue and get the current status back immediately."
    ),
  path: z
    .string()
    .min(1)
    .describe(
      "Absolute path to an audio or video file readable on the Mac running Meeting Transcriber. There is no upload: a path that exists only on another machine is rejected."
    ),
});

export function registerTranscribeTool(
  server: McpServer,
  client: AutomationApiClient
): void {
  server.registerTool(
    "transcribe_file",
    {
      annotations: {
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: "Transcribe an audio file and wait for the result",
      },
      description:
        "Submit one audio or video file to Meeting Transcriber and wait for the diarized transcript. Runs headless, so a multi-speaker recording finishes on its own with auto-assigned speaker names instead of parking on the naming step. Use enqueue_files plus get_job when you do not want to block, or when you want to assign speaker names yourself.",
      inputSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        const maxWaitSeconds = args.maxWaitSeconds ?? DEFAULT_MAX_WAIT_SECONDS;
        const includeTranscript = args.includeTranscript ?? true;
        const { data, status } = await client.request<JobStatus>({
          body: { maxWaitSeconds, path: args.path },
          idempotencyKey: args.idempotencyKey,
          method: "POST",
          path: `/v1/transcribe${includeTranscript ? "?include=transcript" : ""}`,
          timeoutMs: (maxWaitSeconds + TIMEOUT_SLACK_SECONDS) * 1000,
        });
        if (status === 202) {
          return textResult(
            `Still running after ${maxWaitSeconds}s, so this is not a final answer and the transcript is not ready. The job keeps going: poll get_job with jobID ${data.jobID}.\n\n${formatJob(data)}`
          );
        }
        if (data.state === "error") {
          return errorResult(formatJob(data));
        }
        return textResult(formatJob(data));
      })
  );
}
