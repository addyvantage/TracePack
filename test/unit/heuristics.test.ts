import { describe, expect, it } from "vitest";
import { runHeuristics } from "../../src/core/heuristics.js";
import type { FinalStateReceipt, GitEvidence } from "../../src/core/manifest.js";

describe("heuristics", () => {
  it("warns when the receipt says validation is stale", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("src/app.ts", "2026-01-01T00:00:02.000Z"),
      commands: [],
      receipt: receipt("validation_stale")
    });
    expect(warnings.some((warning) => warning.id === "TP001")).toBe(true);
  });

  it("does not warn when the receipt validates the final state", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("src/app.ts", "2026-01-01T00:00:01.000Z"),
      commands: [],
      receipt: receipt("validated_final_state")
    });
    expect(warnings.some((warning) => warning.id === "TP001")).toBe(false);
  });

  it("warns for test-related changed files", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("test/app.test.ts", "2026-01-01T00:00:01.000Z"),
      commands: [],
      receipt: receipt("validated_final_state")
    });
    expect(warnings.some((warning) => warning.id === "TP002")).toBe(true);
  });
});

function gitWithChangedFile(filePath: string, mtime: string): GitEvidence {
  return {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: true,
    statusSummary: "dirty",
    changedFiles: [
      {
        path: filePath,
        status: " M",
        mtime,
        excluded: false,
        looksLikeTest: filePath.includes("test")
      }
    ],
    changedFileCounts: { M: 1 },
    diffStat: { filesChanged: 1, insertions: 1, deletions: 0 },
    excludedEvidence: []
  };
}

function receipt(verdict: FinalStateReceipt["verdict"]): FinalStateReceipt {
  return {
    schemaVersion: "tracepack.receipt.v0.1",
    baseline: snapshot(),
    final: snapshot(),
    verdict,
    coveringCommandIds: verdict === "validated_final_state" ? ["cmd-001"] : [],
    staleCommandIds: verdict === "validation_stale" ? ["cmd-001"] : [],
    failedCommandIds: verdict === "validation_failed" ? ["cmd-001"] : [],
    evidenceRefs: ["receipt.final.fingerprint"],
    explanation: "receipt explanation",
    limitations: []
  };
}

function snapshot(): FinalStateReceipt["final"] {
  return {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git: gitWithChangedFile("src/app.ts", "2026-01-01T00:00:01.000Z"),
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1",
      value: "abc",
      short: "abc",
      canonicalFields: []
    },
    limitations: []
  };
}
