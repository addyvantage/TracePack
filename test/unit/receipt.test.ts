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
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [command("cmd-001", 1, "validation", snapshot("final"))]
    });

    expect(receipt.verdict).toBe("validation_failed");
    expect(receipt.failedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual([]);
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

  it("promotes failed unknown traced commands when no validation succeeded", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [command("cmd-001", 7, "unknown", snapshot("final"))]
    });

    expect(receipt.verdict).toBe("command_failed");
    expect(receipt.failedTracedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.explanation).toContain("failed");
  });

  it("promotes interrupted traced commands when no validation succeeded", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [interruptedCommand("cmd-001", "unknown", snapshot("final"))]
    });

    expect(receipt.verdict).toBe("command_interrupted");
    expect(receipt.interruptedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual([]);
    expect(receipt.explanation).toContain("interrupted or timed out");
  });

  it("promotes interrupted validation commands instead of ordinary validation failure", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [interruptedCommand("cmd-001", "validation", snapshot("final"))]
    });

    expect(receipt.verdict).toBe("command_interrupted");
    expect(receipt.failedCommandIds).toEqual([]);
    expect(receipt.interruptedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual([]);
  });

  it("keeps successful final-state validation strong when a later unknown command fails", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [
        command("cmd-001", 0, "validation", snapshot("final")),
        command("cmd-002", 7, "unknown", snapshot("final"))
      ]
    });

    expect(receipt.verdict).toBe("validated_final_state");
    expect(receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual(["cmd-002"]);
  });

  it("keeps validation failure primary while preserving unrelated failed traced command IDs", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [
        command("cmd-001", 1, "validation", snapshot("final")),
        command("cmd-002", 7, "unknown", snapshot("final"))
      ]
    });

    expect(receipt.verdict).toBe("validation_failed");
    expect(receipt.failedCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual(["cmd-002"]);
  });

  it("keeps stale successful validation primary while preserving failed traced command IDs", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: snapshot("final"),
      commands: [
        command("cmd-001", 0, "validation", snapshot("old")),
        command("cmd-002", 7, "unknown", snapshot("final"))
      ]
    });

    expect(receipt.verdict).toBe("validation_stale");
    expect(receipt.staleCommandIds).toEqual(["cmd-001"]);
    expect(receipt.failedTracedCommandIds).toEqual(["cmd-002"]);
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

  it("fully validates a matching fingerprint when only ambient ignored environment paths are present", () => {
    const final = ambientIgnoredSnapshot("final");
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final,
      commands: [command("cmd-001", 0, "validation", final)]
    });

    expect(receipt.verdict).toBe("validated_final_state");
    expect(receipt.observationConfidence).toBe("complete");
    expect(receipt.changedContentObservation).toBe("complete");
    expect(receipt.environmentNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ambient_ignored_environment",
          evidenceRef: "receipt.final.ignoredFiles"
        })
      ])
    );
    expect(receipt.observationLimits).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: expect.stringContaining("ignored")
        })
      ])
    );
  });

  it("does not fully validate a matching fingerprint when sensitive ignored inputs are present", () => {
    const final = sensitiveIgnoredSnapshot("final");
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
          kind: "ignored_sensitive_local_inputs_unobserved",
          evidenceRef: "receipt.final.ignoredFiles"
        })
      ])
    );
  });

  it("does not fully validate a matching fingerprint when unknown ignored paths are present", () => {
    const final = unknownIgnoredSnapshot("final");
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final,
      commands: [command("cmd-001", 0, "validation", final)]
    });

    expect(receipt.verdict).toBe("inconclusive");
    expect(receipt.observationConfidence).toBe("partial");
    expect(receipt.observationLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ignored_unknown_paths_unobserved",
          evidenceRef: "receipt.final.ignoredFiles"
        })
      ])
    );
  });

  it("does not fully validate when the matching command pre-state observation is partial", () => {
    const final = snapshot("final");
    const validationSubject = sensitiveIgnoredSnapshot("final");
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
          kind: "command_prestate_ignored_sensitive_local_inputs_unobserved",
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

  it("promotes traced failure when final fingerprint is unavailable and no validation succeeded", () => {
    const receipt = createFinalStateReceipt({
      baseline: snapshot("base"),
      final: unavailableSnapshot(),
      commands: [command("cmd-001", 7, "unknown", snapshot("old"))]
    });

    expect(receipt.verdict).toBe("command_failed");
    expect(receipt.failedTracedCommandIds).toEqual(["cmd-001"]);
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

function unavailableSnapshot(): GitStateSnapshot {
  return createGitStateSnapshot(
    {
      ...git("unavailable"),
      available: false,
      isRepository: false,
      statusSummary: "Git unavailable."
    },
    `2026-01-01T00:00:00.000Z`
  );
}

function ambientIgnoredSnapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(git(label), `2026-01-01T00:00:00.000Z`, {
    mode: "metadata_observed",
    count: 1,
    ambientCount: 1,
    sensitiveLocalCount: 0,
    unknownCount: 0,
    limitsConfidence: false,
    samples: [
      {
        path: "node_modules/",
        pathHash: "ignoredhash",
        kind: "directory",
        relevance: "ambient_environment",
        reason:
          "Ambient ignored environment path was present, but TracePack did not read or hash its contents."
      }
    ],
    reason:
      "One non-TracePack ignored path was observed: one ambient ignored environment path present but not read or hashed. Ambient ignored environment paths do not by themselves limit receipt confidence. TracePack did not read ignored file contents."
  });
}

function sensitiveIgnoredSnapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(git(label), `2026-01-01T00:00:00.000Z`, {
    mode: "partial",
    count: 1,
    ambientCount: 0,
    sensitiveLocalCount: 1,
    unknownCount: 0,
    limitsConfidence: true,
    samples: [
      {
        path: undefined,
        pathHash: "ignoredhash",
        kind: "file",
        relevance: "sensitive_local_input",
        reason:
          "Ignored path matched sensitive or local input rules; path label is hidden and content was not read."
      }
    ],
    reason:
      "One non-TracePack ignored path was observed: one sensitive or local ignored input path present and not observed. Sensitive/local or unknown ignored paths may affect validation, so receipt confidence is limited. TracePack did not read ignored file contents."
  });
}

function unknownIgnoredSnapshot(label: string): GitStateSnapshot {
  return createGitStateSnapshot(git(label), `2026-01-01T00:00:00.000Z`, {
    mode: "partial",
    count: 1,
    ambientCount: 0,
    sensitiveLocalCount: 0,
    unknownCount: 1,
    limitsConfidence: true,
    samples: [
      {
        path: "custom-fixture-data/",
        pathHash: "ignoredhash",
        kind: "directory",
        relevance: "unknown",
        reason:
          "Ignored path did not match a known ambient environment category; content was not read and confidence is limited."
      }
    ],
    reason:
      "One non-TracePack ignored path was observed: one unknown ignored path present and not observed. Sensitive/local or unknown ignored paths may affect validation, so receipt confidence is limited. TracePack did not read ignored file contents."
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

function interruptedCommand(
  id: string,
  classification: CommandEvidence["classification"],
  gitBefore: GitStateSnapshot
): CommandEvidence {
  return {
    ...command(id, 1, classification, gitBefore),
    exitCode: null,
    signal: "SIGTERM",
    error: "Command timed out after 1 seconds.",
    evidence: classification === "validation" ? "failed_validation" : "command_failed"
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
