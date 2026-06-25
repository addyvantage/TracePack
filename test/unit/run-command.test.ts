import { describe, expect, it } from "vitest";
import { formatRunOutput, parseRunTimeoutSeconds } from "../../src/commands/run.js";
import { validateManifest, type TracePackManifestV04 } from "../../src/core/manifest.js";

describe("run command options", () => {
  it("parses positive integer timeout seconds", () => {
    expect(parseRunTimeoutSeconds("1")).toBe(1);
    expect(parseRunTimeoutSeconds("300")).toBe(300);
  });

  it("rejects invalid timeout values", () => {
    for (const value of ["0", "-1", "1.5", "Infinity", "abc"]) {
      expect(() => parseRunTimeoutSeconds(value)).toThrow(
        "Timeout must be a positive integer number of seconds"
      );
    }
  });

  it("formats captured command output without leaking sensitive argv", () => {
    const githubToken = `${["gh", "p_"].join("")}${"a".repeat(32)}`;
    const command = {
      id: "cmd-001",
      argv: ["npm", "test", "--token", githubToken],
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      stdout: output("secret output is stored only in the report"),
      stderr: output(""),
      classification: "validation" as const,
      evidence: "successful_validation" as const,
      redaction: {
        applied: true,
        replacementCount: 1,
        excludedEvidenceCount: 0,
        outputTruncated: false,
        notes: []
      }
    };
    const manifest = sampleManifest(command);
    const outputText = formatRunOutput({
      session: {
        schemaVersion: "tracepack.session.v0.1",
        runId: manifest.runId,
        startedAt: manifest.startedAt,
        cwd: "/tmp/repo",
        initialGit: manifest.git.before,
        initialState: manifest.receipt.baseline,
        commands: [command]
      },
      command,
      finishedBundleDir: "/tmp/repo/.tracepack/run-demo"
    });

    expect(outputText).toContain("✓ Command captured");
    expect(outputText).toContain("[REDACTED:github_token_like]");
    expect(outputText).not.toContain(githubToken);
    expect(outputText).not.toContain("secret output is stored only in the report");
    expect(outputText).toContain("output       captured, redacted in report");
    expect(outputText).toContain("report       .tracepack/run-demo/report.html");
  });
});

function sampleManifest(command: TracePackManifestV04["commands"][number]): TracePackManifestV04 {
  const git = {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: false,
    statusSummary: "clean",
    changedFiles: [],
    changedFileCounts: {},
    diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
    excludedEvidence: []
  };
  const snapshot = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git,
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1" as const,
      value: "abc",
      short: "abc",
      canonicalFields: []
    },
    limitations: []
  };

  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId: "run-demo",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: { before: git, after: git },
    commands: [command],
    warnings: [],
    redaction: command.redaction,
    reproduction: { commands: ["npm test"], notes: [] },
    limitations: [],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot,
      final: snapshot,
      verdict: "validated_final_state",
      observationConfidence: "complete",
      changedContentObservation: "complete",
      confidenceReasons: [],
      observationLimits: [],
      coveringCommandIds: ["cmd-001"],
      staleCommandIds: [],
      failedCommandIds: [],
      limitedCommandIds: [],
      evidenceRefs: [],
      explanation: "ok",
      limitations: []
    }
  }) as TracePackManifestV04;
}

function output(text: string): TracePackManifestV04["commands"][number]["stdout"] {
  return {
    text,
    originalBytes: text.length,
    capturedBytes: text.length,
    omittedBytes: 0,
    truncated: false,
    redacted: false,
    replacements: []
  };
}
