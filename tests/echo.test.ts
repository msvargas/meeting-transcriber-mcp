import assert from "node:assert/strict";
import { test } from "node:test";
import { assessEcho, describeEcho } from "../src/echo.js";
import type { EchoVerdict } from "../src/types.js";

function verdict(overrides: Partial<EchoVerdict> = {}): EchoVerdict {
  return {
    affectedWindowShare: 0.62,
    detected: true,
    suppressedSegments: 12,
    windowsAffected: 21,
    windowsScored: 34,
    ...overrides,
  };
}

test("an absent verdict is reported as unmeasured, never as clean", () => {
  assert.equal(assessEcho(undefined), "not-measured");
  const described = describeEcho(undefined);
  assert.match(described, /not measured/);
  assert.match(described, /not a clean verdict/);
  assert.doesNotMatch(described, /analysed and clean/);
});

test("only detected:false counts as analysed and clean", () => {
  const echo = verdict({ detected: false, suppressedSegments: 0 });
  assert.equal(assessEcho(echo), "clean");
  assert.match(describeEcho(echo), /analysed and clean across 34 windows/);
});

test("a missing removed flag means cancellation never ran", () => {
  const described = describeEcho(verdict());
  assert.equal(assessEcho(verdict()), "detected");
  assert.match(described, /detected in 21 of 34 analysed windows \(share 0\.62\)/);
  assert.match(described, /cancellation never ran/);
  assert.match(described, /12 microphone segments were left out/);
});

test("removed:false says the far end is still in the microphone track", () => {
  const described = describeEcho(verdict({ removed: false }));
  assert.match(described, /still in the microphone track/);
  assert.doesNotMatch(described, /never ran/);
});

test("removed:true explains that a zero suppressed count is the dedup standing down", () => {
  const described = describeEcho(
    verdict({ removed: true, suppressedSegments: 0 })
  );
  assert.match(described, /rewritten without the far end/);
  assert.match(described, /dedup stood down/);
});
