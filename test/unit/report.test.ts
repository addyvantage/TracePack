import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../src/report/renderHtml.js";
import { renderMarkdownReport } from "../../src/report/renderMarkdown.js";
import { renderSummaryJson, SUMMARY_SCHEMA_VERSION } from "../../src/report/renderSummaryJson.js";
import { createRedactionReport } from "../../src/core/redaction.js";
import { validateManifest, type TracePackManifest } from "../../src/core/manifest.js";

describe("report rendering", () => {
  it("renders required sections from a valid manifest", () => {
    const manifest = validateManifest(sampleManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );
    expect(html).toContain("Run Summary");
    expect(html).toContain("Final Git Evidence");
    expect(html).toContain("Commands Actually Executed");
    expect(html).toContain("Validation Evidence");
    expect(html).toContain("Final-State Validation Receipt");
    expect(html).toContain("legacy v0.1 manifest");
    expect(html).toContain("Explicit Limitations");
  });

  it("does not render missing validation as a good receipt status", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).toContain('<span class="label warn">no validation observed</span>');
    expect(html).not.toContain('<span class="label good">no validation observed</span>');
  });

  it("renders receipt and warning details in the HTML top summary", () => {
    const manifest = validateManifest({
      ...sampleNoValidationReceiptManifest(),
      warnings: [warning()]
    });
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).toContain("Evidence Summary");
    expect(html).toContain("Receipt Verdict");
    expect(html).toContain('<span class="label warn">no validation observed</span>');
    expect(html).toContain("Meaning:");
    expect(html).toContain("No command classified as validation was observed through TracePack.");
    expect(html).toContain("Confidence");
    expect(html).toContain("complete");
    expect(html).toContain("Confidence meaning:");
    expect(html).toContain("Needs human review:");
    expect(html).toContain("Validation did not cover final observed state");
    expect(html).toContain(
      "TracePack records observed local evidence. It does not prove correctness, security, approval, or merge readiness."
    );
  });

  it("renders a concise markdown report with receipt and limitation sections", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const markdown = renderMarkdownReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(markdown).toContain("# TracePack Evidence Report");
    expect(markdown).toContain("## Evidence Summary");
    expect(markdown.indexOf("## Evidence Summary")).toBeLessThan(
      markdown.indexOf("## Run Summary")
    );
    expect(markdown).toContain("## Final-State Validation Receipt");
    expect(markdown).toContain("`no_validation_observed`");
    expect(markdown).toContain("| Meaning |");
    expect(markdown).toContain("## Validation Commands");
    expect(markdown).toContain("## Changed-File Summary");
    expect(markdown).toContain("## Explicit Limitations");
    expect(markdown).toContain(
      "does not prove correctness, security, approval, or merge readiness"
    );
  });

  it("renders legacy manifests in markdown without upgrading receipt certainty", () => {
    const manifest = validateManifest(sampleManifest());
    const markdown = renderMarkdownReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(markdown).toContain("Legacy v0.1 manifest");
    expect(markdown).toContain("`inconclusive`");
  });

  it("renders a deterministic json summary without raw command output", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const summary = renderSummaryJson(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(summary.schemaVersion).toBe(SUMMARY_SCHEMA_VERSION);
    expect(summary.run.id).toBe("no-validation");
    expect(summary.commands).toEqual(
      expect.objectContaining({
        total: 1,
        unknown: 1,
        succeeded: 1
      })
    );
    expect(summary.receipt).toEqual(
      expect.objectContaining({
        present: true,
        verdict: "no_validation_observed",
        observationConfidence: "complete",
        coveringCommandIds: []
      })
    );
    expect(summary.finalState.changedFileCount).toBe(0);
    expect(JSON.stringify(summary)).not.toContain("RAW_OUTPUT_SHOULD_NOT_APPEAR");
  });

  it("counts commands with errors and no exit code as failed in json summaries", () => {
    const manifest = validateManifest({
      ...sampleNoValidationReceiptManifest(),
      commands: [
        {
          ...sampleNoValidationReceiptManifest().commands[0],
          exitCode: null,
          error: "Command timed out after 1 seconds.",
          evidence: "command_failed"
        }
      ]
    });
    const summary = renderSummaryJson(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(summary.commands.succeeded).toBe(0);
    expect(summary.commands.failed).toBe(1);
  });

  it("renders conservative json summary fields for legacy manifests", () => {
    const manifest = validateManifest(sampleManifest());
    const summary = renderSummaryJson(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(summary.receipt).toEqual(
      expect.objectContaining({
        present: false,
        verdict: "inconclusive",
        observationConfidence: "unavailable"
      })
    );
  });
});

function sampleManifest(): TracePackManifest {
  return {
    schemaVersion: "tracepack.manifest.v0.1",
    TracePackVersion: "0.1.0",
    runId: "demo",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: {
      before: git(),
      after: git()
    },
    commands: [],
    warnings: [],
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    },
    reproduction: {
      commands: [],
      notes: []
    },
    limitations: ["TracePack observes local evidence only."]
  };
}

function git(): TracePackManifest["git"]["after"] {
  return {
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
}

function sampleNoValidationReceiptManifest(): TracePackManifest {
  const snapshot = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git: git(),
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1" as const,
      value: "abc",
      short: "abc",
      canonicalFields: []
    },
    contentObservation: "complete" as const,
    overallObservation: "complete" as const,
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles: {
      mode: "not_present" as const,
      reason: "No non-TracePack ignored paths were observed by Git status."
    },
    limitations: []
  };

  return {
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.4.0",
    runId: "no-validation",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: {
      before: git(),
      after: git()
    },
    commands: [
      {
        id: "cmd-001",
        argv: ["node", "-e", "console.log('ok')"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        exitCode: 0,
        signal: null,
        stdout: output("RAW_OUTPUT_SHOULD_NOT_APPEAR"),
        stderr: output(""),
        classification: "unknown",
        evidence: "observed",
        redaction: {
          applied: false,
          replacementCount: 0,
          excludedEvidenceCount: 0,
          outputTruncated: false,
          notes: []
        }
      }
    ],
    warnings: [],
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    },
    reproduction: {
      commands: [],
      notes: []
    },
    limitations: ["TracePack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot,
      final: snapshot,
      verdict: "no_validation_observed",
      observationConfidence: "complete",
      changedContentObservation: "complete",
      confidenceReasons: [],
      observationLimits: [],
      coveringCommandIds: [],
      staleCommandIds: [],
      failedCommandIds: [],
      limitedCommandIds: [],
      evidenceRefs: ["commands"],
      explanation: "No command classified as validation was observed through TracePack.",
      limitations: []
    }
  };
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

function warning(): TracePackManifest["warnings"][number] {
  return {
    id: "TP001",
    title: "Validation did not cover final observed state",
    trigger: "test",
    evidenceRefs: ["receipt"],
    humanReview: "Run validation after the final change.",
    label: "needs_human_review"
  };
}
