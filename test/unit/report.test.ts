import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../src/report/renderHtml.js";
import { createRedactionReport } from "../../src/core/redaction.js";
import { validateManifest, type TracepackManifest } from "../../src/core/manifest.js";

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
    expect(html).toContain("Explicit Limitations");
  });
});

function sampleManifest(): TracepackManifest {
  return {
    schemaVersion: "tracepack.manifest.v0.1",
    tracepackVersion: "0.1.0",
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
    limitations: ["Tracepack observes local evidence only."]
  };
}

function git(): TracepackManifest["git"]["after"] {
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
