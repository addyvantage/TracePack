import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASSERTION_DISCLAIMER,
  ASSERTION_SCHEMA_VERSION,
  assertBundle,
  evaluateAssertion,
  writeAssertionResultJson,
  type AssertionPolicy
} from "../../src/core/assertion.js";
import {
  validateManifest,
  type ContentObservation,
  type TracePackManifest,
  type ValidationReceiptVerdict
} from "../../src/core/manifest.js";

const tempRoots: string[] = [];
const defaultPolicy: AssertionPolicy = {
  requiredVerdicts: ["validated_final_state"],
  requiredConfidence: "complete",
  allowWarnings: false
};

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("assertion policy evaluation", () => {
  it("passes for validated final state with complete confidence and no warnings", () => {
    const result = evaluateAssertion(
      sampleManifest({
        verdict: "validated_final_state",
        observationConfidence: "complete"
      }),
      "/tmp/bundle",
      defaultPolicy
    );

    expect(result).toEqual(
      expect.objectContaining({
        schemaVersion: ASSERTION_SCHEMA_VERSION,
        passed: true,
        runId: "assertion-demo",
        label: "local-policy",
        actualVerdict: "validated_final_state",
        actualConfidence: "complete",
        warningCount: 0,
        disclaimer: ASSERTION_DISCLAIMER
      })
    );
    expect(result.failures).toEqual([]);
  });

  it("fails when validation is stale", () => {
    const result = evaluateAssertion(
      sampleManifest({
        verdict: "validation_stale",
        observationConfidence: "complete",
        warnings: [warning()]
      }),
      "/tmp/bundle",
      defaultPolicy
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("validation_stale"),
        expect.stringContaining("warning(s)")
      ])
    );
  });

  it("fails when matching validation is inconclusive with partial confidence", () => {
    const result = evaluateAssertion(
      sampleManifest({
        verdict: "inconclusive",
        observationConfidence: "partial",
        limitedCommandIds: ["cmd-001"]
      }),
      "/tmp/bundle",
      defaultPolicy
    );

    expect(result.passed).toBe(false);
    expect(result.actualConfidence).toBe("partial");
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("inconclusive"),
        expect.stringContaining("partial")
      ])
    );
    expect(result.notes).toEqual(
      expect.arrayContaining([expect.stringContaining("Limited validation command IDs")])
    );
  });

  it("allows warnings only when explicitly configured", () => {
    const manifest = sampleManifest({
      verdict: "validated_final_state",
      observationConfidence: "complete",
      warnings: [warning()]
    });

    expect(evaluateAssertion(manifest, "/tmp/bundle", defaultPolicy).passed).toBe(false);

    const allowed = evaluateAssertion(manifest, "/tmp/bundle", {
      ...defaultPolicy,
      allowWarnings: true
    });
    expect(allowed.passed).toBe(true);
    expect(allowed.notes).toEqual(
      expect.arrayContaining([expect.stringContaining("allowed by policy")])
    );
  });

  it("fails legacy manifests that have no receipt", () => {
    const result = evaluateAssertion(legacyManifest(), "/tmp/legacy", defaultPolicy);

    expect(result.passed).toBe(false);
    expect(result.actualVerdict).toBeNull();
    expect(result.actualConfidence).toBeNull();
    expect(result.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("Legacy manifest")])
    );
  });

  it("returns a structured failure when manifest.json is missing", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-missing-manifest-"));
    tempRoots.push(bundleDir);

    const result = await assertBundle(bundleDir, defaultPolicy);

    expect(result.passed).toBe(false);
    expect(result.runId).toBeNull();
    expect(result.actualVerdict).toBeNull();
    expect(result.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("Could not read or validate manifest.json")])
    );
  });

  it("writes stable assertion json for summary-out artifacts", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-assertion-"));
    tempRoots.push(outputDir);
    const outputPath = path.join(outputDir, "assertion.json");
    const result = evaluateAssertion(
      sampleManifest({
        verdict: "validated_final_state",
        observationConfidence: "complete"
      }),
      outputDir,
      defaultPolicy
    );

    await writeAssertionResultJson(outputPath, result);
    const json = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;

    expect(json).toEqual(
      expect.objectContaining({
        schemaVersion: ASSERTION_SCHEMA_VERSION,
        passed: true,
        bundleDir: outputDir,
        runId: "assertion-demo",
        actualVerdict: "validated_final_state",
        actualConfidence: "complete",
        disclaimer: ASSERTION_DISCLAIMER
      })
    );
  });
});

function sampleManifest(options: {
  verdict: ValidationReceiptVerdict;
  observationConfidence: ContentObservation;
  warnings?: TracePackManifest["warnings"];
  limitedCommandIds?: string[];
}): TracePackManifest {
  const snapshot = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git: git(),
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1" as const,
      value: "abcdef",
      short: "abcdef",
      canonicalFields: []
    },
    contentObservation: options.observationConfidence,
    overallObservation: options.observationConfidence,
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles: {
      mode: "not_present" as const,
      reason: "No non-TracePack ignored paths were observed by Git status."
    },
    limitations: []
  };

  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId: "assertion-demo",
    label: "local-policy",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: environment(),
    git: { before: git(), after: git() },
    commands: [command()],
    warnings: options.warnings ?? [],
    redaction: redaction(),
    reproduction: { commands: ["npm test"], notes: [] },
    limitations: ["TracePack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot,
      final: snapshot,
      verdict: options.verdict,
      observationConfidence: options.observationConfidence,
      changedContentObservation: options.observationConfidence,
      confidenceReasons: [],
      observationLimits: [],
      coveringCommandIds:
        options.verdict === "validated_final_state" || options.verdict === "inconclusive"
          ? ["cmd-001"]
          : [],
      staleCommandIds: options.verdict === "validation_stale" ? ["cmd-001"] : [],
      failedCommandIds: options.verdict === "validation_failed" ? ["cmd-001"] : [],
      limitedCommandIds: options.limitedCommandIds ?? [],
      evidenceRefs: ["receipt.final.fingerprint"],
      explanation: "Sample assertion receipt.",
      limitations: []
    }
  });
}

function legacyManifest(): TracePackManifest {
  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.1",
    TracePackVersion: "0.1.0",
    runId: "legacy",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: environment(),
    git: { before: git(), after: git() },
    commands: [],
    warnings: [],
    redaction: redaction(),
    reproduction: { commands: [], notes: [] },
    limitations: ["TracePack observes local evidence only."]
  });
}

function environment(): TracePackManifest["environment"] {
  return {
    node: "v20.0.0",
    platform: "test",
    arch: "x64",
    cwd: { label: "repo", pathHash: "abc", representation: "basename" }
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

function command(): TracePackManifest["commands"][number] {
  return {
    id: "cmd-001",
    argv: ["npm", "test"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: output("ok"),
    stderr: output(""),
    classification: "validation",
    evidence: "successful_validation",
    redaction: redaction()
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

function redaction(): TracePackManifest["redaction"] {
  return {
    applied: false,
    replacementCount: 0,
    excludedEvidenceCount: 0,
    outputTruncated: false,
    notes: []
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
