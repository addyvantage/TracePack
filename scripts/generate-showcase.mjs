import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { createRedactionReport } from "../dist/core/redaction.js";
import { validateManifest } from "../dist/core/manifest.js";
import { renderHtmlReport } from "../dist/report/renderHtml.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const assetsDir = path.join(repoRoot, "docs", "assets");
const prettierConfig = (await resolveConfig(path.join(repoRoot, "README.md"))) ?? {};

await mkdir(assetsDir, { recursive: true });

const stale = manifest({
  runId: "showcase-stale",
  label: "synthetic-stale-validation",
  verdict: "validation_stale",
  finalShort: "f9a14c",
  validationShort: "a8312d",
  warnings: [
    {
      id: "TP001",
      title: "Successful validation was observed, but not for the final repository state.",
      trigger:
        "Successful validation command cmd-001 used pre-state a8312d while final state was f9a14c.",
      evidenceRefs: ["commands:cmd-001.gitBefore.fingerprint", "receipt.final.fingerprint"],
      humanReview:
        "Review whether the final repository state was validated by another mechanism before trusting the change.",
      limitation:
        "Tracepack observes local evidence only and does not prove the code was untested elsewhere.",
      label: "needs_human_review"
    }
  ]
});

const validated = manifest({
  runId: "showcase-validated",
  label: "synthetic-final-state-validation",
  verdict: "validated_final_state",
  finalShort: "f9a14c",
  validationShort: "f9a14c",
  warnings: []
});

await writeReport("stale-report.html", stale);
await writeReport("validated-report.html", validated);
await writeAssetsReadme();

console.log("Generated docs/assets/stale-report.html");
console.log("Generated docs/assets/validated-report.html");
console.log("Generated docs/assets/README.md");

async function writeReport(fileName, manifestValue) {
  const redactionReport = createRedactionReport({
    runId: manifestValue.runId,
    outputs: manifestValue.commands.flatMap((command) => [command.stdout, command.stderr]),
    excludedEvidence: []
  });
  await writeFile(
    path.join(assetsDir, fileName),
    await format(renderHtmlReport(validateManifest(manifestValue), redactionReport), {
      ...prettierConfig,
      parser: "html"
    }),
    "utf8"
  );
}

async function writeAssetsReadme() {
  const markdown = `# Tracepack Synthetic Showcase Assets

This folder contains self-contained HTML reports generated from fake fixture data. They are intended for README links, local screenshots, and public-alpha review.

- \`stale-report.html\`: successful validation was observed before the final repository change.
- \`validated-report.html\`: successful validation was observed for the final captured state.

Regenerate the files from the repository root:

\`\`\`bash
npm run showcase:generate
\`\`\`

The generator uses the built local renderer in \`dist/\`, so it runs \`npm run build\` first through the npm script. The sample data uses fixed timestamps, fake run IDs, fake fingerprints, fake paths, and no real local machine paths.

No PNG screenshots are committed by default. To capture screenshots reproducibly, regenerate these files and open them from disk in a browser or browser automation tool at a fixed viewport such as 1280x720.
`;
  await writeFile(
    path.join(assetsDir, "README.md"),
    await format(markdown, { ...prettierConfig, parser: "markdown" }),
    "utf8"
  );
}

function manifest(options) {
  const final = snapshot(options.finalShort, "2026-01-01T00:00:03.000Z");
  const validationPreState = snapshot(options.validationShort, "2026-01-01T00:00:02.000Z");
  const command = commandEvidence(validationPreState);

  return {
    schemaVersion: "tracepack.manifest.v0.4",
    TracePackVersion: "0.6.0",
    runId: options.runId,
    label: options.label,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:04.000Z",
    durationMs: 4000,
    environment: {
      node: "v22.0.0",
      platform: "synthetic",
      arch: "x64",
      cwd: { label: "synthetic-repo", pathHash: "pathhash-demo", representation: "basename" }
    },
    git: {
      before: gitState([]),
      after: gitState([
        {
          path: "src/calc.mjs",
          status: " M",
          additions: 3,
          deletions: 1,
          sha256: "sha256-demo-calc",
          contentHashStatus: "hashed",
          excluded: false,
          looksLikeTest: false
        }
      ])
    },
    commands: [command],
    warnings: options.warnings,
    redaction: redactionSummary(),
    reproduction: {
      commands: ["npm test"],
      reproductionMayRequireLocalValues: false,
      notes: [
        "Run these commands only after reviewing them yourself.",
        "The bundle intentionally omits raw repository contents and full raw diffs by default."
      ]
    },
    limitations: ["Tracepack observes local evidence only."],
    receipt: {
      schemaVersion: "tracepack.receipt.v0.3",
      baseline: snapshot("6b4f20", "2026-01-01T00:00:00.000Z"),
      final,
      verdict: options.verdict,
      observationConfidence: "complete",
      changedContentObservation: "complete",
      confidenceReasons: [
        "All Git-reported changed-file contents were either safely hashed or not applicable."
      ],
      observationLimits: [],
      environmentNotes: [],
      coveringCommandIds: options.verdict === "validated_final_state" ? ["cmd-001"] : [],
      staleCommandIds: options.verdict === "validation_stale" ? ["cmd-001"] : [],
      failedCommandIds: [],
      failedTracedCommandIds: [],
      interruptedCommandIds: [],
      limitedCommandIds: [],
      evidenceRefs: ["receipt.final.fingerprint", "commands:cmd-001.gitBefore.fingerprint"],
      explanation:
        options.verdict === "validated_final_state"
          ? "Successful validation command cmd-001 was observed with a pre-state fingerprint matching final state f9a14c."
          : "Successful validation was observed, but command pre-state fingerprint cmd-001 did not match final state f9a14c.",
      limitations: []
    }
  };
}

function commandEvidence(gitBefore) {
  return {
    id: "cmd-001",
    argv: ["npm", "test"],
    startedAt: "2026-01-01T00:00:02.000Z",
    endedAt: "2026-01-01T00:00:03.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: output("> synthetic test\n2 tests passed\n"),
    stderr: output(""),
    classification: "validation",
    evidence: "successful_validation",
    redaction: redactionSummary(),
    gitBefore,
    gitAfter: gitBefore
  };
}

function snapshot(short, capturedAt) {
  return {
    capturedAt,
    git: gitState([]),
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1",
      value: `${short}-synthetic-value`,
      short,
      canonicalFields: ["git.branch", "git.head", "git.changedFiles"]
    },
    contentObservation: "complete",
    overallObservation: "complete",
    observedChangedFiles: [],
    unobservedChangedFiles: [],
    excludedChangedFiles: [],
    ignoredFiles: {
      mode: "not_present",
      reason: "No non-TracePack ignored paths were observed by Git status."
    },
    limitations: []
  };
}

function gitState(changedFiles) {
  return {
    available: true,
    isRepository: true,
    root: { label: "synthetic-repo", pathHash: "pathhash-demo", representation: "basename" },
    branch: "feature/synthetic-demo",
    head: "0123456789abcdef0123456789abcdef01234567",
    dirty: changedFiles.length > 0,
    statusSummary: changedFiles.length > 0 ? "dirty" : "clean",
    changedFiles,
    changedFileCounts: changedFiles.length > 0 ? { M: changedFiles.length } : {},
    diffStat: { filesChanged: changedFiles.length, insertions: 3, deletions: 1 },
    excludedEvidence: []
  };
}

function output(text) {
  return {
    text,
    originalBytes: Buffer.byteLength(text, "utf8"),
    capturedBytes: Buffer.byteLength(text, "utf8"),
    omittedBytes: 0,
    truncated: false,
    redacted: false,
    replacements: []
  };
}

function redactionSummary() {
  return {
    applied: false,
    replacementCount: 0,
    excludedEvidenceCount: 0,
    outputTruncated: false,
    argumentReplacementCount: 0,
    redactedArgumentCount: 0,
    reproductionMayRequireLocalValues: false,
    notes: []
  };
}
