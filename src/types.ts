export type JobState =
  | "diarizing"
  | "done"
  | "error"
  | "generatingProtocol"
  | "speakerNamingPending"
  | "transcribing"
  | "waiting";

export const TERMINAL_JOB_STATES: readonly JobState[] = ["done", "error"];

/**
 * The app's echo-bleed verdict. Absent on the job means no measurement was made,
 * which is deliberately different from a measurement that came back clean.
 */
export interface EchoVerdict {
  affectedWindowShare: number;
  detected: boolean;
  /** Absent when the cancellation stage was never reached at all. */
  removed?: boolean;
  suppressedSegments: number;
  windowsAffected: number;
  windowsScored: number;
}

export interface JobStatus {
  echo?: EchoVerdict;
  error?: string | null;
  jobID: string;
  meetingTitle?: string | null;
  protocolPath?: string | null;
  state: JobState;
  /** Present only when the request opted in with include=transcript. */
  transcript?: string;
  transcriptPath?: string | null;
  warnings?: string[];
}

export interface SpeakerChoice {
  label: string;
  speakingSeconds: number;
  /** Falls back to the label itself when no known voice matched. */
  suggested: string;
}

export interface NamingStatus {
  jobID: string;
  meetingTitle?: string | null;
  participants?: string[];
  speakers: SpeakerChoice[];
}

export type WatchState = "error" | "idle" | "recording" | "watching";

export type Badge =
  | "diarizing"
  | "done"
  | "error"
  | "inactive"
  | "processing"
  | "recording"
  | "transcribing"
  | "updateAvailable"
  | "userAction";

export interface WatchStatus {
  badge: Badge;
  manualRecording: boolean;
  pendingConsentApp?: string;
  permissionsHealthy: boolean;
  state?: WatchState;
  watching: boolean;
}

export interface EnqueuedJobs {
  jobIDs: string[];
}
