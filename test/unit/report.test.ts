import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../src/report/renderHtml.js";
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
