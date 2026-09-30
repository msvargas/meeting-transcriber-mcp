import type { EchoVerdict } from "./types.js";

/**
 * Three outcomes, and the absent one carries weight: a job with no echo verdict was
 * never analysed, so reporting it as clean would claim something nobody measured.
 */
export type EchoAssessment = "clean" | "detected" | "not-measured";

export function assessEcho(echo: EchoVerdict | undefined): EchoAssessment {
  if (!echo) {
    return "not-measured";
  }
  return echo.detected ? "detected" : "clean";
}

export function describeEcho(echo: EchoVerdict | undefined): string {
  const assessment = assessEcho(echo);
  if (assessment === "not-measured" || !echo) {
    return "Echo bleed: not measured. The job was single-source, one track was silent, or the tracks overlapped for less than one analysis window. This is not a clean verdict.";
  }
  if (assessment === "clean") {
    return `Echo bleed: analysed and clean across ${echo.windowsScored} windows.`;
  }
  const share = echo.affectedWindowShare.toFixed(2);
  const lines = [
    `Echo bleed: detected in ${echo.windowsAffected} of ${echo.windowsScored} analysed windows (share ${share}). Analysis covers the opening minutes, so bleed that starts later is not seen.`,
    describeRemoval(echo.removed),
    describeSuppression(echo),
  ];
  return lines.join(" ");
}

function describeRemoval(removed: boolean | undefined): string {
  if (removed === undefined) {
    return "Echo cancellation never ran: the feature is off, or the recording was not judged affected when the stage was reached.";
  }
  if (removed) {
    return "The microphone track was rewritten without the far end.";
  }
  return "Echo cancellation ran but the far end is still in the microphone track; the job warnings say which of the four failure paths it took.";
}

function describeSuppression(echo: EchoVerdict): string {
  if (echo.removed === true) {
    return "The transcript dedup stood down because cancellation already handled the far end, so a suppressed-segment count of 0 is by design.";
  }
  if (echo.suppressedSegments === 0) {
    return "No microphone segments were left out of the written transcript.";
  }
  return `${echo.suppressedSegments} microphone segments were left out of the written transcript; a quiet local remark over the far end can be misread as echo, and the words stay in the job's stored data either way.`;
}
