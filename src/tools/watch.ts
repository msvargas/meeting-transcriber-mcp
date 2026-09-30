import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AutomationApiClient } from "../client.js";
import { formatWatch } from "../format.js";
import type { WatchStatus } from "../types.js";
import { textResult, withApiErrors } from "./shared.js";

const setWatchSchema = z.object({
  action: z
    .enum(["start", "stop"])
    .describe(
      "The state you want the app to end up in. Toggle is deliberately not offered: it applies a delta to a state the caller cannot see reliably, so it inverts silently when the meeting ended or someone used the menu bar in between."
    ),
});

export function registerWatchTools(
  server: McpServer,
  client: AutomationApiClient
): void {
  server.registerTool(
    "get_watch_status",
    {
      annotations: {
        openWorldHint: false,
        readOnlyHint: true,
        title: "Read whether the app is watching for meetings",
      },
      description:
        "Read whether Meeting Transcriber is watching for Teams, Zoom and Webex meetings, what the menu bar badge shows, and whether its permissions are healthy. Cheap enough to poll, and it answers even while the app is still starting up, which also makes it the liveness check for the automation API.",
      inputSchema: z.object({}),
    },
    async () =>
      await withApiErrors(async () => {
        const { data } = await client.request<WatchStatus>({
          method: "GET",
          path: "/v1/watch",
        });
        return textResult(formatWatch(data));
      })
  );

  server.registerTool(
    "set_watch",
    {
      annotations: {
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
        title: "Start or stop watching for meetings",
      },
      description:
        "Start or stop automatic meeting detection, the same thing the menu bar's Start Watching item does. A 409 means a manual recording owns the watch loop. The first start on a fresh install can raise a macOS microphone or screen-recording prompt that somebody has to answer, so grant those once interactively before relying on this.",
      inputSchema: setWatchSchema,
    },
    async (args) =>
      await withApiErrors(async () => {
        const { data } = await client.request<WatchStatus>({
          body: { action: args.action },
          method: "POST",
          path: "/v1/watch",
        });
        return textResult(
          `Requested ${args.action}. Resulting state:\n${formatWatch(data)}`
        );
      })
  );
}
