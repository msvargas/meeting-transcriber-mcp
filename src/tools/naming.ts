import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AutomationApiClient } from "../client.js";
import { formatNaming } from "../format.js";
import type { NamingStatus } from "../types.js";
import { textResult, withApiErrors } from "./shared.js";

const jobSchema = z.object({
  jobID: z.string().min(1).describe("The job awaiting speaker naming."),
});

const confirmSchema = z.object({
  jobID: z.string().min(1).describe("The job awaiting speaker naming."),
  mapping: z
    .record(z.string(), z.string())
    .describe(
      'Diarization label to real name, for example {"Speaker 1": "Alice"}. Read the labels from get_naming first.'
    ),
});

export function registerNamingTools(
  server: McpServer,
  client: AutomationApiClient
): void {
  server.registerTool(
    "get_naming",
    {
      annotations: {
        openWorldHint: false,
        readOnlyHint: true,
        title: "Read a job's pending speaker-naming choice",
      },
      description:
        "Read the speaker labels a job is waiting to have named, with the app's own suggestion and how long each one spoke. Only meaningful while the job is in speakerNamingPending; any other state answers 404. Voice embeddings and audio are deliberately not exposed.",
      inputSchema: jobSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        const { data } = await client.request<NamingStatus>({
          method: "GET",
          path: `/v1/jobs/${encodeURIComponent(args.jobID)}/naming`,
        });
        return textResult(formatNaming(data));
      })
  );

  server.registerTool(
    "confirm_naming",
    {
      annotations: {
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: "Assign speaker names and let a job finish",
      },
      description:
        "Confirm the real names behind a job's diarization labels so it can finish. A 409 means the job exists but is no longer awaiting naming. This does not enroll new voices in the app's speaker database; no endpoint here does.",
      inputSchema: confirmSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        await client.request<unknown>({
          body: { mapping: args.mapping },
          expectJson: false,
          method: "POST",
          path: `/v1/jobs/${encodeURIComponent(args.jobID)}/naming`,
        });
        const assigned = Object.entries(args.mapping)
          .map(([label, name]) => `  - ${label} -> ${name}`)
          .join("\n");
        return textResult(
          `Speaker names confirmed for job ${args.jobID}:\n${assigned}\n\nThe job continues from here; poll get_job for the result.`
        );
      })
  );

  server.registerTool(
    "skip_naming",
    {
      annotations: {
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
        title: "Accept auto-assigned speaker names",
      },
      description:
        "Let a job finish with the speaker names the app assigned itself. A 409 means the job exists but is no longer awaiting naming.",
      inputSchema: jobSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        await client.request<unknown>({
          expectJson: false,
          method: "POST",
          path: `/v1/jobs/${encodeURIComponent(args.jobID)}/naming/skip`,
        });
        return textResult(
          `Naming skipped for job ${args.jobID}; it keeps the auto-assigned names. Poll get_job for the result.`
        );
      })
  );
}
