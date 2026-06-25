import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReportCommand } from "../../src/commands/report.js";
import { appendGithubStepSummary, writeBundle } from "../../src/core/bundle.js";
import {
  validateManifest,
  type ContentObservation,
  type TracePackManifest,
  type ValidationReceiptVerdict
} from "../../src/core/manifest.js";
import { createRedactionReport } from "../../src/core/redaction.js";
import {
  GITHUB_SUMMARY_DISCLAIMER,
  renderGithubStepSummary
} from "../../src/report/renderGithubSummary.js";

const tempRoots: string[] = [];
const originalGithubStepSummary = process.env.GITHUB_STEP_SUMMARY;

afterEach(async () => {
  if (originalGithubStepSummary === undefined) {
    delete process.env.GITHUB_STEP_SUMMARY;
  } else {
    process.env.GITHUB_STEP_SUMMARY = originalGithubStepSummary;
  }

  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("GitHub job summary rendering", () => {
  it("summarizes a complete successful receipt without dangerous product claims", () => {
    const summary = renderGithubStepSummary(
      sampleManifest({ verdict: "validated_final_state", confidence: "complete" }),
      { artifactName: "tracepack-receipt-demo" }
    );

    expect(summary).toContain("## TracePack Validation Receipt");
    expect(summary).toContain("| Receipt verdict | `validated_final_state` |");
    expect(summary).toContain("| Confidence | `complete` |");
    expect(summary).toContain(
      "Validation evidence was observed against the final observed repository state."
    );
    expect(summary).toContain("Download the `tracepack-receipt-demo` artifact");
    expect(summary).toContain(GITHUB_SUMMARY_DISCLAIMER);
    expectNoDangerousClaims(summary);
  });

  it("summarizes stale validation clearly without success-like wording", () => {
    const summary = renderGithubStepSummary(
      sampleManifest({ verdict: "validation_stale", confidence: "complete" })
    );

    expect(summary).toContain("| Receipt verdict | `validation_stale` |");
    expect(summary).toContain("Stale validation evidence");
    expect(summary).toContain("not the final observed repository state");
    expect(summary).not.toContain(
      "Validation evidence was observed against the final observed repository state."
    );
    expectNoDangerousClaims(summary);
  });

  it("summarizes partial inconclusive receipts without leaking ignored sensitive inputs", () => {
    const summary = renderGithubStepSummary(
      sampleManifest({
        verdict: "inconclusive",
        confidence: "partial",
        commandArgv: ["test", "-s", ".env.local"],
        commandStdout: "TRACEPACK_FAKE_CONFIG=secret\n",
        observationLimits: [
          {
            kind: "ignored_sensitive_local_inputs_unobserved",
            evidenceRef: "receipt.final.ignoredFiles",
            reason:
              "One sensitive or local ignored input path was present and not observed. Contents were not read."
          }
        ]
      })
    );

    expect(summary).toContain("| Receipt verdict | `inconclusive` |");
    expect(summary).toContain("| Confidence | `partial` |");
    expect(summary).toContain("### Evidence limitations");
    expect(summary).toContain("ignored_sensitive_local_inputs_unobserved");
    expect(summary).toContain("sensitive or local ignored input path");
    expect(summary).toContain("[REDACTED:sensitive_path_argument]");
    expect(summary).not.toContain(".env.local");
    expect(summary).not.toContain("TRACEPACK_FAKE_CONFIG");
    expect(summary).not.toContain("secret");
    expectNoDangerousClaims(summary);
  });

  it("summarizes failed validation prominently", () => {
    const summary = renderGithubStepSummary(
      sampleManifest({
        verdict: "validation_failed",
        confidence: "complete",
        commandExitCode: 1,
        commandEvidence: "failed_validation"
      })
    );

    expect(summary).toContain("| Receipt verdict | `validation_failed` |");
    expect(summary).toContain("| Failed | 1 |");
    expect(summary).toContain("Validation failure observed");
    expect(summary).toContain("| `cmd-001` | `npm test` | `validation` | `failed` | `exit 1` |");
    expectNoDangerousClaims(summary);
  });

  it("summarizes interrupted commands prominently", () => {
    const summary = renderGithubStepSummary(
      sampleManifest({
        verdict: "command_interrupted",
        confidence: "complete",
        commandExitCode: null,
        commandSignal: "SIGTERM",
        commandError: "Command timed out after 1 seconds.",
        commandEvidence: "command_failed",
        commandClassification: "unknown",
        interruptedCommandIds: ["cmd-001"]
      })
    );

    expect(summary).toContain("| Receipt verdict | `command_interrupted` |");
    expect(summary).toContain("| Interrupted | 1 |");
    expect(summary).toContain("Command interruption observed");
    expect(summary).toContain(
      "| `cmd-001` | `npm test` | `unknown` | `interrupted` | `signal SIGTERM` |"
    );
    expectNoDangerousClaims(summary);
  });
});

describe("GitHub step summary file behavior", () => {
  it("writes Markdown to GITHUB_STEP_SUMMARY and appends existing content", async () => {
    const { bundleDir } = await writeTempBundle(
      sampleManifest({ verdict: "validated_final_state", confidence: "complete" })
    );
    const summaryPath = await tempFile("TracePack-summary-");
    await writeFile(summaryPath, "existing content\n", "utf8");
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    await appendGithubStepSummary(bundleDir, { artifactName: "tracepack-receipt-demo" });
    const summary = await readFile(summaryPath, "utf8");

    expect(summary).toMatch(/^existing content\n## TracePack Validation Receipt/m);
    expect(summary).toContain("`validated_final_state`");
    expect(summary).toContain("`complete`");
    expect(summary).toContain(GITHUB_SUMMARY_DISCLAIMER);
  });

  it("fails clearly when GITHUB_STEP_SUMMARY is absent and summary mode is requested", async () => {
    const { bundleDir } = await writeTempBundle(
      sampleManifest({ verdict: "validated_final_state", confidence: "complete" })
    );
    delete process.env.GITHUB_STEP_SUMMARY;

    await expect(appendGithubStepSummary(bundleDir)).rejects.toThrow(
      "--github-summary requires GITHUB_STEP_SUMMARY"
    );
  });

  it("uses the latest completed bundle for no-argument report GitHub summary mode", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "TracePack-latest-summary-"));
    tempRoots.push(repo);
    const oldBundle = path.join(repo, ".tracepack", "20260101T000000Z-old");
    const latestBundle = path.join(repo, ".tracepack", "20260101T000001Z-new");
    await writeBundle(
      oldBundle,
      sampleManifest({
        runId: "old-run",
        finishedAt: "2026-01-01T00:00:00.000Z",
        verdict: "validation_stale",
        confidence: "complete"
      }),
      redaction("old-run")
    );
    await writeBundle(
      latestBundle,
      sampleManifest({
        runId: "new-run",
        finishedAt: "2026-01-01T00:00:01.000Z",
        verdict: "validated_final_state",
        confidence: "complete"
      }),
      redaction("new-run")
    );
    const summaryPath = await tempFile("TracePack-latest-summary-file-");

    const result = await runReportCommand(repo, undefined, {
      format: "all",
      githubSummary: true,
      githubSummaryPath: summaryPath,
      artifactName: "tracepack-receipt-latest"
    });
    const summary = await readFile(summaryPath, "utf8");

    expect(result.resolvedBundleDir).toBe(latestBundle);
    expect(result.outputs.map((output) => path.basename(output)).sort()).toEqual([
      "report.html",
      "report.md",
      "summary.json"
    ]);
    expect(summary).toContain("`new-run`");
    expect(summary).not.toContain("old-run");
    expect(summary).toContain("tracepack-receipt-latest");
  });
});

async function writeTempBundle(manifest: TracePackManifest): Promise<{ bundleDir: string }> {
  const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-summary-bundle-"));
  tempRoots.push(bundleDir);
  await writeBundle(bundleDir, manifest, redaction(manifest.runId));
  return { bundleDir };
}

async function tempFile(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return path.join(dir, "summary.md");
}

function sampleManifest(options: {
  runId?: string;
  finishedAt?: string;
  verdict: ValidationReceiptVerdict;
  confidence: ContentObservation;
  commandArgv?: string[];
  commandStdout?: string;
  commandExitCode?: number | null;
  commandSignal?: string | null;
  commandError?: string;
  commandEvidence?: TracePackManifest["commands"][number]["evidence"];
  commandClassification?: TracePackManifest["commands"][number]["classification"];
  observationLimits?: NonNullable<TracePackManifest["receipt"]["observationLimits"]>;
  interruptedCommandIds?: string[];
}): TracePackManifest {
  const git = {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abcdef1234567890",
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
      value: "abcdef1234567890",
      short: "abcdef",
      canonicalFields: []
    },
    contentObservation: options.confidence,
    overallObservation: options.confidence,
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles:
      options.confidence === "partial"
        ? {
            mode: "partial" as const,
            reason:
              "One non-TracePack ignored path was observed: one sensitive or local ignored input path present and not observed.",
            count: 1,
            ambientCount: 0,
            sensitiveLocalCount: 1,
            unknownCount: 0,
            limitsConfidence: true,
            samples: [
              {
                pathHash: "ignoredhash",
                kind: "file" as const,
                relevance: "sensitive_local_input" as const,
                reason:
                  "Ignored path matched sensitive or local input rules; path label is hidden and content was not read."
              }
            ]
          }
        : {
            mode: "not_present" as const,
            reason: "No non-TracePack ignored paths were observed by Git status."
          },
    limitations: []
  };
  const runId = options.runId ?? "summary-demo";
  const command = {
    id: "cmd-001",
    argv: options.commandArgv ?? ["npm", "test"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: options.commandExitCode === undefined ? 0 : options.commandExitCode,
    signal: options.commandSignal ?? null,
    ...(options.commandError ? { error: options.commandError } : {}),
    stdout: output(options.commandStdout ?? ""),
    stderr: output(""),
    classification: options.commandClassification ?? "validation",
    evidence: options.commandEvidence ?? "successful_validation",
    redaction: redactionSummary(),
    gitBefore: snapshot
  };

  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId,
    label: "github-summary",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: options.finishedAt ?? "2026-01-01T00:00:01.000Z",
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
    redaction: redactionSummary(),
    reproduction: { commands: [options.commandArgv?.join(" ") ?? "npm test"], notes: [] },
    limitations: ["TracePack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot,
      final: snapshot,
      verdict: options.verdict,
      observationConfidence: options.confidence,
      changedContentObservation: options.confidence,
      confidenceReasons: [],
      observationLimits: options.observationLimits ?? [],
      environmentNotes: [],
      coveringCommandIds:
        options.verdict === "validated_final_state" || options.verdict === "inconclusive"
          ? ["cmd-001"]
          : [],
      staleCommandIds: options.verdict === "validation_stale" ? ["cmd-001"] : [],
      failedCommandIds: options.verdict === "validation_failed" ? ["cmd-001"] : [],
      failedTracedCommandIds: [],
      interruptedCommandIds: options.interruptedCommandIds ?? [],
      limitedCommandIds: options.verdict === "inconclusive" ? ["cmd-001"] : [],
      evidenceRefs: ["receipt.final.fingerprint"],
      explanation: `${options.verdict} sample receipt.`,
      limitations: []
    }
  });
}

function output(text: string): TracePackManifest["commands"][number]["stdout"] {
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

function redaction(runId: string) {
  return createRedactionReport({ runId, outputs: [], excludedEvidence: [] });
}

function redactionSummary(): TracePackManifest["redaction"] {
  return {
    applied: false,
    replacementCount: 0,
    excludedEvidenceCount: 0,
    outputTruncated: false,
    notes: []
  };
}

function expectNoDangerousClaims(summary: string): void {
  expect(summary).not.toMatch(/\bcorrect\b/i);
  expect(summary).not.toMatch(/\bsafe\b/i);
  expect(summary).not.toMatch(/\bapproved\b/i);
  expect(summary).not.toMatch(/safe to merge/i);
  expect(summary).not.toMatch(/merge ready/i);
  expect(summary).not.toMatch(/this pr is validated/i);
}
