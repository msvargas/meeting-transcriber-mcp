export type ErrorCode =
  | "APP_UNREACHABLE"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED"
  | "REQUEST_TOO_LARGE"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "TOKEN_MISSING"
  | "TOKEN_REJECTED"
  | "UNAVAILABLE"
  | "UNEXPECTED_RESPONSE";

export class AutomationApiError extends Error {
  readonly code: ErrorCode;
  /** False means a retry cannot change the answer until something on the machine changes. */
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(options: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    status?: number;
  }) {
    super(options.message);
    this.name = "AutomationApiError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export function unreachableError(baseUrl: string): AutomationApiError {
  return new AutomationApiError({
    code: "APP_UNREACHABLE",
    message: `Meeting Transcriber is not answering on ${baseUrl}. The automation API exists only in the Homebrew build and is off by default: turn on Settings > Advanced > "Local Automation API", or launch the app with MEETINGTRANSCRIBER_DEBUG_RPC=1.`,
    retryable: true,
  });
}

export function missingTokenError(tokenPath: string): AutomationApiError {
  return new AutomationApiError({
    code: "TOKEN_MISSING",
    message: `No bearer token at ${tokenPath}. The app writes it on first launch of the automation API, so enable the API once and let the app create it, or point MEETING_TRANSCRIBER_TOKEN_PATH at the right file.`,
  });
}

export function httpError(
  status: number,
  tokenPath: string,
  body: string
): AutomationApiError {
  const detail = body.trim() ? ` Response: ${body.trim()}` : "";
  switch (status) {
    case 400:
      return new AutomationApiError({
        code: "BAD_REQUEST",
        message: `The app rejected the request as malformed, which for the job endpoints also covers a path that does not exist on the machine running the app.${detail}`,
        status,
      });
    case 401:
      return new AutomationApiError({
        code: "TOKEN_REJECTED",
        message: `The app rejected the bearer token. It rotates the token whenever the automation API is toggled off and on, so a stale copy is the usual cause; re-read ${tokenPath}.`,
        status,
      });
    case 403:
      return new AutomationApiError({
        code: "FORBIDDEN",
        message:
          "Blocked by the app's origin and host guard. Requests must carry no browser Origin header and a Host of 127.0.0.1 or localhost.",
        status,
      });
    case 404:
      return new AutomationApiError({
        code: "NOT_FOUND",
        message: `Unknown job id. It was never enqueued, it aged out of the app's terminal store, or it was cancelled before finishing. A naming read also answers 404 when the job is not awaiting naming.${detail}`,
        status,
      });
    case 409:
      return new AutomationApiError({
        code: "CONFLICT",
        message: `Refused because of the current state: a naming call on a job that is not awaiting naming, or watch control while a manual recording owns the watch loop.${detail}`,
        status,
      });
    case 412:
      return new AutomationApiError({
        code: "PRECONDITION_FAILED",
        message: `Refused because nothing would be captured. This answer is stable until a setting or permission changes, so do not retry.${detail}`,
        status,
      });
    case 503:
      return new AutomationApiError({
        code: "UNAVAILABLE",
        message: `The app attempted the action and it did not take. Unlike a 412 this one is worth retrying.${detail}`,
        retryable: true,
        status,
      });
    default:
      break;
  }
  if (status >= 500) {
    return new AutomationApiError({
      code: "SERVER_ERROR",
      message: `The app failed to handle the request (HTTP ${status}).${detail}`,
      retryable: true,
      status,
    });
  }
  return new AutomationApiError({
    code: "UNEXPECTED_RESPONSE",
    message: `Unexpected HTTP ${status} from the app.${detail}`,
    status,
  });
}
