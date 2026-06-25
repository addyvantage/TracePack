import { describe, expect, it } from "vitest";
import { formatFinishOutput } from "../../src/commands/finish.js";
import { validateManifest, type TracePackManifestV04 } from "../../src/core/manifest.js";
import { createRedactionReport } from "../../src/core/redaction.js";

describe("finish output", () => {
  it("summarizes the finish verdict compactly with one report path", () => {
    const manifest = sampleManifest();
    const output = formatFinishOutput({
      session: {
        schemaVersion: "tracepack.session.v0.1",
        runId: manifest.runId,
        label: manifest.label,
        startedAt: manifest.startedAt,
        cwd: "/tmp/repo",
        initialGit: manifest.git.before,
        initialState: manifest.receipt.baseline,
        commands: manifest.commands
      },
      manifest,
      redactionReport: createRedactionReport({
        runId: manifest.runId,
        outputs: [],
        excludedEvidence: []
      }),
      bundleDir: "/tmp/repo/.tracepack/finish-demo"
    });

    expect(output.split("\n").length).toBeLessThanOrEqual(12);
    expect(output).toMatch(/^✗ Validation command failed/);
    expect(output).toContain(
      "A validation command was observed for the final captured repository state, but it did not complete successfully."
    );
    expect(output).toContain("validation   failed");
    expect(output).toContain("npm test · signal SIGTERM");
    expect(output).toContain("final state  abcdef");
    expect(output).toContain("src/app.ts");
    expect(output).toContain("TP001 Validation was observed for the final repository state");
    expect(output).toContain("report       .tracepack/finish-demo/report.html");
    expect(countOccurrences(output, ".tracepack/finish-demo/report.html")).toBe(1);
    expect(output).toContain("→ review the failed validation output");
    expect(output).not.toContain("TracePack records observed local evidence.");
  });

  it("keeps detailed confidence notes behind verbose output", () => {
    const base = sampleManifest();
    const manifest = validateManifest({
      ...base,
      receipt: {
        ...base.receipt,
        verdict: "inconclusive",
        observationConfidence: "partial",
        confidenceReasons: [
          "Ignored paths were observed but not read.",
          "cmd-001 pre-state: ignored paths were observed but not read."
        ],
        explanation: "Validation matched the final fingerprint, but observation was partial."
      }
    }) as TracePackManifestV04;

    const output = formatFinishOutput(
      {
        session: {
          schemaVersion: "tracepack.session.v0.1",
          runId: manifest.runId,
          label: manifest.label,
          startedAt: manifest.startedAt,
          cwd: "/tmp/repo",
          initialGit: manifest.git.before,
          initialState: manifest.receipt.baseline,
          commands: manifest.commands
        },
        manifest,
        redactionReport: createRedactionReport({
          runId: manifest.runId,
          outputs: [],
          excludedEvidence: []
        }),
        bundleDir: "/tmp/repo/.tracepack/finish-demo"
      },
      { verbose: true }
    );

    expect(output).toContain("Receipt confidence: partial");
    expect(output).toContain("Confidence notes:");
    expect(output).toContain("Ignored paths were observed but not read.");
    expect(output).toContain("Next: review observation limits, then rerun validation");
  });

  it("sanitizes command argv and errors in finish terminal output", () => {
    const githubToken = `${["gh", "p_"].join("")}${"a".repeat(32)}`;
    const manifest = validateManifest({
      ...sampleManifest(),
      commands: [
        {
          ...sampleManifest().commands[0],
          argv: ["npm", "test", "--token", githubToken],
          error: `token=${githubToken}`
        }
      ]
    }) as TracePackManifestV04;
    const output = formatFinishOutput({
      session: {
        schemaVersion: "tracepack.session.v0.1",
        runId: manifest.runId,
        label: manifest.label,
        startedAt: manifest.startedAt,
        cwd: "/tmp/repo",
        initialGit: manifest.git.before,
        initialState: manifest.receipt.baseline,
        commands: manifest.commands
      },
      manifest,
      redactionReport: createRedactionReport({
        runId: manifest.runId,
        outputs: [],
        excludedEvidence: []
      }),
      bundleDir: "/tmp/repo/.tracepack/finish-demo"
    });

    expect(output).not.toContain(githubToken);
    expect(output).toContain("[REDACTED:github_token_like]");
  });
});

function sampleManifest(): TracePackManifestV04 {
  const git = {
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
        sizeBytes: 10,
        sha256: "abc",
        excluded: false,
        looksLikeTest: false
      }
    ],
    changedFileCounts: { M: 1 },
    diffStat: { filesChanged: 1, insertions: 1, deletions: 0 },
    excludedEvidence: []
  };
  const snapshot = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git,
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1" as const,
      value: "abcdef",
      short: "abcdef",
      canonicalFields: []
    },
    contentObservation: "complete" as const,
    overallObservation: "complete" as const,
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles: {
      mode: "not_present" as const,
      reason: "No ignored paths."
    },
    limitations: []
  };

  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId: "finish-demo",
    label: "local-review",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    durationMs: 2000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: { before: git, after: git },
    commands: [
      {
        id: "cmd-001",
        argv: ["npm", "test"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        exitCode: null,
        signal: "SIGTERM",
        error: "Command timed out after 1 seconds.",
        stdout: output(),
        stderr: output(),
        classification: "validation",
        evidence: "failed_validation",
        redaction: redaction(),
        gitBefore: snapshot
      }
    ],
    warnings: [
      {
        id: "TP001",
        title: "Validation was observed for the final repository state, but it failed.",
        trigger: "failed",
        evidenceRefs: ["commands:cmd-001"],
        humanReview: "Review failed validation.",
        label: "needs_human_review"
      }
    ],
    redaction: redaction(),
    reproduction: { commands: ["npm test"], notes: [] },
    limitations: ["TracePack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot,
      final: snapshot,
      verdict: "validation_failed",
      observationConfidence: "complete",
      changedContentObservation: "complete",
      confidenceReasons: [],
      observationLimits: [],
      coveringCommandIds: [],
      staleCommandIds: [],
      failedCommandIds: ["cmd-001"],
      limitedCommandIds: [],
      evidenceRefs: ["commands:cmd-001"],
      explanation: "Validation failed.",
      limitations: []
    }
  }) as TracePackManifestV04;
}

function output(): TracePackManifestV04["commands"][number]["stdout"] {
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

function redaction(): TracePackManifestV04["redaction"] {
  return {
    applied: false,
    replacementCount: 0,
    excludedEvidenceCount: 0,
    outputTruncated: false,
    notes: []
  };
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
