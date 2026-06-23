import { describe, expect, it } from "vitest";
import { runHeuristics } from "../../src/core/heuristics.js";
import type { CommandEvidence, FinalStateReceipt, GitEvidence } from "../../src/core/manifest.js";

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

  it("warns when a test-looking file is renamed to a non-test-looking path", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithFiles([
        changedFile("src/calc-helper.ts", {
          status: "R ",
          previousPath: "test/calc.test.ts",
          looksLikeTest: true
        })
      ]),
      commands: [],
      receipt: receipt("validated_final_state")
    });

    const warning = warnings.find((entry) => entry.id === "TP003");
    expect(warning?.trigger).toContain("renamed away from test-looking names");
    expect(warning?.evidenceRefs).toContain("git.after.changedFiles:src/calc-helper.ts");
  });

  it("does not warn for test-looking renames that remain test-looking", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithFiles([
        changedFile("test/calc.spec.ts", {
          status: "R ",
          previousPath: "test/calc.test.ts",
          looksLikeTest: true
        })
      ]),
      commands: [],
      receipt: receipt("validated_final_state")
    });

    expect(warnings.some((warning) => warning.id === "TP003")).toBe(false);
  });

  it("warns when validation uses suspicious test flags", () => {
    const warnings = runHeuristics({
      gitAfter: gitWithFiles([]),
      commands: [command(["vitest", "-u"])],
      receipt: receipt("validated_final_state")
    });

    const warning = warnings.find((entry) => entry.id === "TP004");
    expect(warning?.trigger).toContain("-u");
    expect(warning?.humanReview).toContain("skipped, filtered, or updated test evidence");
  });
});

function gitWithChangedFile(filePath: string, mtime: string): GitEvidence {
  return gitWithFiles([
    changedFile(filePath, {
      status: " M",
      mtime,
      looksLikeTest: filePath.includes("test")
    })
  ]);
}

function gitWithFiles(changedFiles: GitEvidence["changedFiles"]): GitEvidence {
  return {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: changedFiles.length > 0,
    statusSummary: changedFiles.length > 0 ? "dirty" : "clean",
    changedFiles,
    changedFileCounts: changedFileCounts(changedFiles),
    diffStat: { filesChanged: changedFiles.length, insertions: changedFiles.length, deletions: 0 },
    excludedEvidence: []
  };
}

function changedFileCounts(changedFiles: GitEvidence["changedFiles"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of changedFiles) {
    const key = file.status.trim() || file.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function changedFile(
  filePath: string,
  overrides: Partial<GitEvidence["changedFiles"][number]> = {}
): GitEvidence["changedFiles"][number] {
  return {
    path: filePath,
    status: " M",
    excluded: false,
    looksLikeTest: false,
    ...overrides
  };
}

function command(argv: string[]): CommandEvidence {
  return {
    id: "cmd-001",
    argv,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: output(),
    stderr: output(),
    classification: "validation",
    evidence: "successful_validation",
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    }
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

function output(): CommandEvidence["stdout"] {
  return {
    text: "",
    originalBytes: 0,
    capturedBytes: 0,
    omittedBytes: 0,
    truncated: false,
    redacted: false,
    replacements: []
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
