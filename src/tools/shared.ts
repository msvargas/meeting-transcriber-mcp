import type { CallToolResult } from "@modelcontextprotocol/server";
import { AutomationApiError } from "../errors.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ text, type: "text" }] };
}

export function errorResult(text: string): CallToolResult {
  return { content: [{ text, type: "text" }], isError: true };
}

/**
 * Turns an API failure into a result the model can read and act on, keeping the
 * retryable/not-retryable distinction the app is careful to make.
 */
export async function withApiErrors(
  run: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AutomationApiError) {
      const advice = error.retryable
        ? "This one is worth retrying."
        : "Retrying will not change this answer.";
      return errorResult(`${error.code}: ${error.message} ${advice}`);
    }
    throw error;
  }
}
