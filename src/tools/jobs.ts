import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AutomationApiClient } from "../client.js";
import { formatJob } from "../format.js";
import type { EnqueuedJobs, JobStatus } from "../types.js";
import { errorResult, textResult, withApiErrors } from "./shared.js";

const enqueueSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Reuse the same key when retrying so the repeat returns the original job ids instead of enqueuing duplicates."
    ),
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "Absolute paths to audio or video files readable on the Mac running Meeting Transcriber."
    ),
});

const getJobSchema = z.object({
  includeProtocol: z
    .boolean()
    .optional()
    .describe(
      "Also read the generated Markdown protocol from the path the app reported. Defaults to false."
    ),
  includeTranscript: z
    .boolean()
    .optional()
    .describe(
      "Fold the transcript text into the answer. Defaults to true. A job that is still running has no transcript yet."
    ),
  jobID: z.string().min(1).describe("The job id to read."),
});

export function registerJobTools(
  server: McpServer,
  client: AutomationApiClient
): void {
  server.registerTool(
    "enqueue_files",
    {
      annotations: {
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: "Queue files for transcription without waiting",
      },
      description:
        "Queue one or more audio files and return their job ids immediately. Poll each one with get_job. Unlike transcribe_file these jobs can park on the speaker-naming step, which you resolve with confirm_naming or skip_naming.",
      inputSchema: enqueueSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        const { data } = await client.request<EnqueuedJobs>({
          body: { paths: args.paths },
          idempotencyKey: args.idempotencyKey,
          method: "POST",
          path: "/v1/jobs",
        });
        const ids = data.jobIDs
          .map((id, index) => `  ${index + 1}. ${id}`)
          .join("\n");
        return textResult(
          `Queued ${data.jobIDs.length} job(s):\n${ids}\n\nPoll each one with get_job.`
        );
      })
  );

  server.registerTool(
    "get_job",
    {
      annotations: {
        openWorldHint: false,
        readOnlyHint: true,
        title: "Read a transcription job",
      },
      description:
        "Read a job's state, result paths and transcript. Answers for live jobs and for finished ones the app has already reaped. A 404 means the id was never enqueued, aged out of the app's terminal store, or was cancelled before finishing. A job in error is not always final: a user can retry it from the menu bar, which moves the same id back to waiting.",
      inputSchema: getJobSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        const includeTranscript = args.includeTranscript ?? true;
        const { data } = await client.request<JobStatus>({
          method: "GET",
          path: `/v1/jobs/${encodeURIComponent(args.jobID)}${includeTranscript ? "?include=transcript" : ""}`,
        });
        let rendered = formatJob(data);
        if (args.includeProtocol && data.protocolPath) {
          rendered += `\n\n${await readProtocol(client, data.protocolPath)}`;
        }
        if (data.state === "error") {
          return errorResult(rendered);
        }
        return textResult(rendered);
      })
  );
}

async function readProtocol(
  client: AutomationApiClient,
  protocolPath: string
): Promise<string> {
  try {
    const protocol = await client.readReportedFile(protocolPath);
    return `Protocol:\n${protocol}`;
  } catch {
    return `Protocol could not be read from ${protocolPath}, though the app reported it. The path is on the machine running the app, so a client elsewhere cannot reach it.`;
  }
}
