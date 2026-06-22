import { describe, expect, it } from "vitest";
import { runHeuristics } from "../../src/core/heuristics.js";
import type { CommandEvidence, GitEvidence } from "../../src/core/manifest.js";

describe("heuristics", () => {
  it("warns when no successful validation is observed after final change", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("src/app.ts", "2026-01-01T00:00:02.000Z"),
      commands: [command("cmd-001", "2026-01-01T00:00:01.000Z", 0, "validation")]
    });
    expect(warnings.some((warning) => warning.id === "TP001")).toBe(true);
  });

  it("does not warn when successful validation is after final change", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("src/app.ts", "2026-01-01T00:00:01.000Z"),
      commands: [command("cmd-001", "2026-01-01T00:00:02.000Z", 0, "validation")]
    });
    expect(warnings.some((warning) => warning.id === "TP001")).toBe(false);
  });

  it("warns for test-related changed files", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithChangedFile("test/app.test.ts", "2026-01-01T00:00:01.000Z"),
      commands: []
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

function command(
  id: string,
  endedAt: string,
  exitCode: number,
  classification: CommandEvidence["classification"]
): CommandEvidence {
  return {
    id,
    argv: ["npm", "test"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt,
    durationMs: 1,
    exitCode,
    signal: null,
    stdout: {
      text: "",
      originalBytes: 0,
      capturedBytes: 0,
      omittedBytes: 0,
      truncated: false,
      redacted: false,
      replacements: []
    },
    stderr: {
      text: "",
      originalBytes: 0,
      capturedBytes: 0,
      omittedBytes: 0,
      truncated: false,
      redacted: false,
      replacements: []
    },
    classification,
    evidence: exitCode === 0 ? "successful_validation" : "failed_validation",
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    }
  };
}
