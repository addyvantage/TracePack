import { describe, expect, it } from "vitest";
import { createFinalStateReceipt, receiptVerdict } from "../../src/core/receipt.js";
import { createGitStateSnapshot } from "../../src/core/state.js";
import type { CommandEvidence, GitEvidence, GitStateSnapshot } from "../../src/core/manifest.js";

describe("receipt verdicts", () => {
  it("marks a successful validation whose pre-state matches final as validated", () => {
    expect(
      createFinalStateReceipt({
        baseline: snapshot("base"),
        final: snapshot("final"),
        commands: [command("cmd-001", 0, "validation", snapshot("final"))]
      }).verdict
    ).toBe("validated_final_state");
  });

  it("marks successful validation against a different state as stale", () => {
    expect(
      createFinalStateReceipt({
        baseline: snapshot("base"),
        final: snapshot("final"),
        commands: [command("cmd-001", 0, "validation", snapshot("old"))]
      }).verdict
    ).toBe("validation_stale");
  });

  it("marks failed validation on the final state as failed", () => {
    expect(
      createFinalStateReceipt({
        baseline: snapshot("base"),
        final: snapshot("final"),
        commands: [command("cmd-001", 1, "validation", snapshot("final"))]
      }).verdict
    ).toBe("validation_failed");
  });

  it("marks missing validation separately from unknown commands", () => {
    expect(
      createFinalStateReceipt({
        baseline: snapshot("base"),
        final: snapshot("final"),
        commands: [command("cmd-001", 0, "unknown", snapshot("final"))]
      }).verdict
    ).toBe("no_validation_observed");
  });

  it("does not fully validate a matching fingerprint when observation is partial", () => {
    const final = partialSnapshot("final");
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final,
      commands: [command("cmd-001", 0, "validation", final)]
    });

    expect(receipt.verdict).toBe("inconclusive");
    expect(receipt.observationConfidence).toBe("partial");
    expect(receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(receipt.limitedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.confidenceReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("large.bin")])
    );
  });

  it("does not fully validate a matching fingerprint when ignored-path observation is partial", () => {
    const final = ignoredPartialSnapshot("final");
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final,
      commands: [command("cmd-001", 0, "validation", final)]
    });

    expect(receipt.verdict).toBe("inconclusive");
    expect(receipt.observationConfidence).toBe("partial");
    expect(receipt.changedContentObservation).toBe("complete");
    expect(receipt.limitedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.observationLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ignored_paths_unobserved",
          evidenceRef: "receipt.final.ignoredFiles"
        })
      ])
    );
  });

  it("does not fully validate when the matching command pre-state observation is partial", () => {
    const final = snapshot("final");
    const validationSubject = ignoredPartialSnapshot("final");
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final,
      commands: [command("cmd-001", 0, "validation", validationSubject)]
    });

    expect(receipt.verdict).toBe("inconclusive");
    expect(receipt.observationConfidence).toBe("partial");
    expect(receipt.changedContentObservation).toBe("complete");
    expect(receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(receipt.limitedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.confidenceReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("cmd-001 pre-state")])
    );
    expect(receipt.observationLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "command_prestate_ignored_paths_unobserved",
          evidenceRef: "commands:cmd-001.gitBefore.ignoredFiles"
        })
      ])
    );
  });

  it("uses observation confidence as the strong-verdict gate", () => {
    expect(
      receiptVerdict({
        validationCommandCount: 1,
        hasFinalFingerprint: true,
        observationConfidence: "partial",
        coveringCommandIds: ["cmd-001"],
        failedCommandIds: [],
        staleCommandIds: []
      })
    ).toBe("inconclusive");
  });

  it("marks missing final fingerprints as inconclusive", () => {
    expect(
      receiptVerdict({
        validationCommandCount: 1,
        hasFinalFingerprint: false,
        coveringCommandIds: [],
        failedCommandIds: [],
        staleCommandIds: []
      })
    ).toBe("inconclusive");
  });
});

function snapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(git(label), `2026-01-01T00:00:00.000Z`);
}

function partialSnapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(
    {
      ...git(label),
      changedFiles: [
        {
          path: "large.bin",
          status: " M",
          sizeBytes: 2_000_000,
          contentHashStatus: "not_hashed",
          contentHashReason: "File is larger than the safe hashing limit.",
          excluded: false,
          looksLikeTest: false
        }
      ]
    },
    `2026-01-01T00:00:00.000Z`
  );
}

function ignoredPartialSnapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(git(label), `2026-01-01T00:00:00.000Z`, {
    mode: "partial",
    count: 1,
    samples: [
      {
        path: "node_modules/",
        pathHash: "ignoredhash",
        kind: "directory",
        reason:
          "Ignored path was detected by Git status, but TracePack did not read or hash its contents."
      }
    ],
    reason:
      "One non-TracePack ignored path was observed. TracePack did not read or hash ignored contents."
  });
}

function git(label: string): GitEvidence {
  return {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: true,
    statusSummary: "dirty",
    changedFiles: [
      {
        path: "src/app.ts",
        status: " M",
        sizeBytes: label.length,
        sha256: label,
        excluded: false,
        looksLikeTest: false
      }
    ],
    changedFileCounts: { M: 1 },
    diffStat: { filesChanged: 1, insertions: 1, deletions: 0 },
    excludedEvidence: []
  };
}

function command(
  id: string,
  exitCode: number,
  classification: CommandEvidence["classification"],
  gitBefore: GitStateSnapshot
): CommandEvidence {
  return {
    id,
    argv: ["npm", "test"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1,
    exitCode,
    signal: null,
    stdout: output(),
    stderr: output(),
    classification,
    evidence:
      classification === "validation"
        ? exitCode === 0
          ? "successful_validation"
          : "failed_validation"
        : "observed",
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    },
    gitBefore
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
