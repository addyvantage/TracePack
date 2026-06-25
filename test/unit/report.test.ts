import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../src/report/renderHtml.js";
import { renderGithubStepSummary } from "../../src/report/renderGithubSummary.js";
import { renderMarkdownReport } from "../../src/report/renderMarkdown.js";
import { renderSummaryJson, SUMMARY_SCHEMA_VERSION } from "../../src/report/renderSummaryJson.js";
import { createRedactionReport } from "../../src/core/redaction.js";
import { CANONICAL_LIMITATION_STATEMENT } from "../../src/core/display.js";
import {
  validateManifest,
  type GitStateSnapshot,
  type TracePackManifest,
  type ValidationReceiptVerdict
} from "../../src/core/manifest.js";

describe("report rendering", () => {
  it("renders required verdict-first sections from a legacy manifest", () => {
    const manifest = validateManifest(sampleManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).toContain("Repository evidence unavailable");
    expect(html).toContain("Evidence timeline");
    expect(html).toContain("Human review focus");
    expect(html).toContain("Evidence matrix");
    expect(html).toContain("Final-state receipt detail");
    expect(html).toContain("legacy manifest");
    expect(html).toContain(CANONICAL_LIMITATION_STATEMENT);
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it("maps actual receipt verdicts to the allowed hero headlines", () => {
    const cases: Array<[ValidationReceiptVerdict, string]> = [
      ["validated_final_state", "Final-state validation observed"],
      ["validation_stale", "Validation evidence incomplete"],
      ["no_validation_observed", "Validation evidence incomplete"],
      ["inconclusive", "Validation evidence incomplete"],
      ["validation_failed", "Validation command failed"],
      ["command_failed", "Validation command failed"],
      ["command_interrupted", "Validation command failed"]
    ];

    for (const [verdict, headline] of cases) {
      const manifest = sampleReceiptManifest({ verdict });
      const html = renderHtmlReport(
        manifest,
        createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
      );
      expect(html).toContain(`<h1 id="tracepack-verdict">${headline}</h1>`);
    }
  });

  it("renders stale validation as incomplete with a not-observed timeline", () => {
    const manifest = sampleReceiptManifest({ verdict: "validation_stale" });
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).toContain("Validation evidence incomplete");
    expect(html).toContain(
      "Successful validation was observed, but the repository changed afterward. The final state was not observed by validation."
    );
    expect(html).toContain('data-connection="not-observed">Not observed');
    expect(html).toContain("Validation pre-state before12 differed from final state final34");
    expect(html).toContain("Needs human review");
    expect(html).toContain("TP001");
  });

  it("renders final-state validation as observed without a warning strip", () => {
    const manifest = sampleReceiptManifest({ verdict: "validated_final_state" });
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).toContain("Final-state validation observed");
    expect(html).toContain(
      "Successful validation was observed against the final captured repository state."
    );
    expect(html).toContain('data-connection="observed">Observed');
    expect(html).toContain("Validation pre-state final34 matched final state final34");
    expect(html).toContain("No deterministic review trigger.");
    expect(html).not.toContain("TP001");
  });

  it("maps failed validation and unavailable repository evidence to distinct headlines", () => {
    const failed = renderHtmlReport(
      sampleReceiptManifest({ verdict: "validation_failed" }),
      createRedactionReport({ runId: "failed", outputs: [], excludedEvidence: [] })
    );
    const unavailable = renderHtmlReport(
      sampleReceiptManifest({ verdict: "validated_final_state", finalFingerprint: undefined }),
      createRedactionReport({ runId: "unavailable", outputs: [], excludedEvidence: [] })
    );

    expect(failed).toContain("Validation command failed");
    expect(failed).toContain('data-connection="failed">Failed');
    expect(unavailable).toContain("Repository evidence unavailable");
  });

  it("uses only allowed categorical labels in the evidence matrix", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );
    const matrix = html.slice(
      html.indexOf('<table class="tp-matrix"'),
      html.indexOf("</table>", html.indexOf('<table class="tp-matrix"'))
    );
    const labels = [
      ...matrix.matchAll(/<span aria-hidden="true">[^<]+<\/span>([^<]+)<\/span>/g)
    ].map((match) => match[1]);

    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set(["Observed", "Not observed"]));
    for (const label of labels) {
      expect(["Observed", "Not observed", "Needs human review", "Failed", "Excluded"]).toContain(
        label
      );
    }
  });

  it("renders human review focus for warnings and neutral focus without warnings", () => {
    const manifest = validateManifest({
      ...sampleNoValidationReceiptManifest(),
      warnings: [warning()]
    });
    const withWarning = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );
    const withoutWarning = renderHtmlReport(
      validateManifest(sampleNoValidationReceiptManifest()),
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(withWarning).toContain("Needs human review:");
    expect(withWarning).toContain("Validation did not cover final observed state");
    expect(withWarning).toContain('href="#warnings"');
    expect(withoutWarning).toContain("No deterministic review trigger.");
  });

  it("renders the canonical limitation exactly once in the footer", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(countOccurrences(html, CANONICAL_LIMITATION_STATEMENT)).toBe(1);
    expect(html).toContain(`<footer class="tp-footer">`);
  });

  it("keeps report markup static, offline, focusable, and print-aware", () => {
    const manifest = validateManifest(sampleNoValidationReceiptManifest());
    const html = renderHtmlReport(
      manifest,
      createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] })
    );

    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/@import|url\(/);
    expect(html).toContain("summary:focus-visible");
    expect(html).toContain("@media print");
    expect(html).toContain("details:not([open])");
  });

  it("renders different hero and timeline semantics for stale and validated reports", () => {
    const stale = renderHtmlReport(
      sampleReceiptManifest({ verdict: "validation_stale" }),
      createRedactionReport({ runId: "stale", outputs: [], excludedEvidence: [] })
    );
    const validated = renderHtmlReport(
      sampleReceiptManifest({ verdict: "validated_final_state" }),
      createRedactionReport({ runId: "validated", outputs: [], excludedEvidence: [] })
    );

    expect(stale).toContain('data-state="incomplete"');
    expect(stale).toContain('data-connection="not-observed"');
    expect(validated).toContain('data-state="observed"');
    expect(validated).toContain('data-connection="observed"');
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

  it("sanitizes raw command arguments while rendering reports", () => {
    const githubToken = fakeGithubToken("a");
    const manifest = validateManifest({
      ...sampleNoValidationReceiptManifest(),
      commands: [
        {
          ...sampleNoValidationReceiptManifest().commands[0],
          argv: ["deploy", "--token", githubToken]
        }
      ],
      reproduction: {
        commands: [`deploy --token ${githubToken}`],
        notes: []
      }
    });
    const redactionReport = createRedactionReport({
      runId: manifest.runId,
      outputs: [],
      excludedEvidence: []
    });
    const html = renderHtmlReport(manifest, redactionReport);
    const markdown = renderMarkdownReport(manifest, redactionReport);
    const githubSummary = renderGithubStepSummary(manifest);

    for (const rendered of [html, markdown, githubSummary]) {
      expect(rendered).not.toContain(githubToken);
      expect(rendered).toContain("[REDACTED:github_token_like]");
    }
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

function sampleReceiptManifest(options: {
  verdict: ValidationReceiptVerdict;
  finalFingerprint?: string;
}): TracePackManifest {
  const hasExplicitFinalFingerprint = Object.hasOwn(options, "finalFingerprint");
  const finalShort = hasExplicitFinalFingerprint ? options.finalFingerprint : "final34";
  const confidence = options.verdict === "inconclusive" ? "partial" : "complete";
  const baseline = snapshotWithFingerprint("base00", confidence);
  const final = snapshotWithFingerprint(finalShort, confidence);
  const validationPreState =
    options.verdict === "validation_stale"
      ? snapshotWithFingerprint("before12", confidence)
      : snapshotWithFingerprint(finalShort, confidence);
  const validationCommand = {
    id: "cmd-001",
    argv: ["npm", "test"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: options.verdict === "validation_failed" ? 1 : 0,
    signal: null,
    stdout: output(""),
    stderr: output(""),
    classification: "validation" as const,
    evidence:
      options.verdict === "validation_failed"
        ? ("failed_validation" as const)
        : ("successful_validation" as const),
    redaction: redactionSummary(),
    gitBefore: validationPreState
  };
  const failedTracedCommand = {
    id: "cmd-001",
    argv: ["node", "script.mjs"],
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: options.verdict === "command_interrupted" ? null : 1,
    signal: options.verdict === "command_interrupted" ? "SIGTERM" : null,
    ...(options.verdict === "command_interrupted"
      ? { error: "Command timed out after 1 seconds." }
      : {}),
    stdout: output(""),
    stderr: output(""),
    classification: "unknown" as const,
    evidence: "command_failed" as const,
    redaction: redactionSummary(),
    gitBefore: validationPreState
  };
  const commands =
    options.verdict === "no_validation_observed"
      ? []
      : options.verdict === "command_failed" || options.verdict === "command_interrupted"
        ? [failedTracedCommand]
        : [validationCommand];
  const coveringCommandIds =
    options.verdict === "validated_final_state" || options.verdict === "inconclusive"
      ? ["cmd-001"]
      : [];
  const staleCommandIds = options.verdict === "validation_stale" ? ["cmd-001"] : [];
  const failedCommandIds = options.verdict === "validation_failed" ? ["cmd-001"] : [];
  const failedTracedCommandIds = options.verdict === "command_failed" ? ["cmd-001"] : [];
  const interruptedCommandIds = options.verdict === "command_interrupted" ? ["cmd-001"] : [];
  const limitedCommandIds = options.verdict === "inconclusive" ? ["cmd-001"] : [];

  return validateManifest({
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId: `sample-${options.verdict}`,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    durationMs: 2000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: {
      before: git(),
      after: {
        ...git(),
        dirty: true,
        statusSummary: "dirty",
        changedFiles: [
          {
            path: "src/calc.mjs",
            status: " M",
            sha256: "abc",
            excluded: false,
            looksLikeTest: false
          }
        ],
        changedFileCounts: { M: 1 },
        diffStat: { filesChanged: 1, insertions: 1, deletions: 0 }
      }
    },
    commands,
    warnings: options.verdict === "validated_final_state" ? [] : [warning()],
    redaction: redactionSummary(),
    reproduction: {
      commands: commands.map((command) => command.argv.join(" ")),
      notes: []
    },
    limitations: ["TracePack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline,
      final,
      verdict: options.verdict,
      observationConfidence: confidence,
      changedContentObservation: confidence,
      confidenceReasons: [],
      observationLimits: [],
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      failedTracedCommandIds,
      interruptedCommandIds,
      limitedCommandIds,
      evidenceRefs: ["receipt.final.fingerprint", "commands:cmd-001.gitBefore.fingerprint"],
      explanation: "Fixture receipt explanation.",
      limitations: []
    }
  });
}

function snapshotWithFingerprint(
  short: string | undefined,
  confidence: "complete" | "partial"
): GitStateSnapshot {
  return {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git: git(),
    ...(short
      ? {
          fingerprint: {
            algorithm: "tracepack.state-fingerprint.v1" as const,
            value: `${short}-value`,
            short,
            canonicalFields: []
          }
        }
      : {}),
    contentObservation: confidence,
    overallObservation: confidence,
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles:
      confidence === "partial"
        ? {
            mode: "partial" as const,
            reason: "One ignored input was not observed.",
            count: 1,
            ambientCount: 0,
            sensitiveLocalCount: 1,
            unknownCount: 0,
            limitsConfidence: true
          }
        : {
            mode: "not_present" as const,
            reason: "No non-TracePack ignored paths were observed by Git status."
          },
    limitations: []
  };
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

function fakeGithubToken(fill: string): string {
  return `${["gh", "p_"].join("")}${fill.repeat(32)}`;
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
