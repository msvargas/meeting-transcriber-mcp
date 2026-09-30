import { describeEcho } from "./echo.js";
import {
  type JobStatus,
  type NamingStatus,
  TERMINAL_JOB_STATES,
  type WatchStatus,
} from "./types.js";

export function formatJob(job: JobStatus): string {
  const terminal = TERMINAL_JOB_STATES.includes(job.state);
  const lines = [
    `Job ${job.jobID}`,
    `State: ${job.state}${terminal ? " (terminal)" : " (still moving)"}`,
  ];
  if (job.meetingTitle) {
    lines.push(`Meeting: ${job.meetingTitle}`);
  }
  lines.push(`Transcript file: ${job.transcriptPath ?? "not written yet"}`);
  lines.push(
    `Protocol file: ${job.protocolPath ?? "none (protocol generation is disabled, was skipped, or was not reached)"}`
  );
  if (job.error) {
    lines.push(
      `Error: ${job.error} — a user can retry this job from the menu bar, which moves the same id back to waiting, so an error is not always final.`
    );
  }
  if (job.warnings?.length) {
    lines.push("Warnings:");
    for (const warning of job.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  lines.push(describeEcho(job.echo));
  if (job.transcript) {
    lines.push("", "Transcript:", job.transcript);
  }
  return lines.join("\n");
}

export function formatNaming(naming: NamingStatus): string {
  const lines = [`Job ${naming.jobID} is awaiting speaker naming.`];
  if (naming.meetingTitle) {
    lines.push(`Meeting: ${naming.meetingTitle}`);
  }
  lines.push("Speakers:");
  for (const speaker of naming.speakers) {
    lines.push(
      `  - ${speaker.label} -> suggested "${speaker.suggested}" (${speaker.speakingSeconds.toFixed(1)}s speaking)`
    );
  }
  if (naming.participants?.length) {
    lines.push(
      `Attendees read via accessibility: ${naming.participants.join(", ")}`
    );
  }
  lines.push(
    "A suggestion that repeats the label means no known voice matched it."
  );
  return lines.join("\n");
}

export function formatWatch(watch: WatchStatus): string {
  const lines = [
    `Watching for meetings: ${yesNo(watch.watching)}`,
    `Pipeline state: ${watch.state ?? "no watch loop exists"}`,
    `Menu bar badge: ${watch.badge}`,
    `Manual recording owns the watch loop: ${yesNo(watch.manualRecording)}`,
    `Permissions healthy: ${yesNo(watch.permissionsHealthy)}`,
  ];
  if (watch.pendingConsentApp) {
    lines.push(
      `Waiting on a browser-meeting consent answer for: ${watch.pendingConsentApp}`
    );
  }
  return lines.join("\n");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
