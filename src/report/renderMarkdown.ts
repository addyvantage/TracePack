import type { RedactionReport, TracePackManifest } from "../core/manifest.js";
import {
  commandFailed,
  formatObservationConfidenceMeaning,
  formatReceiptVerdictMeaning
} from "../core/format.js";

export function renderMarkdownReport(
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): string {
  const sections = [
    "# TracePack Evidence Report",
    `TracePack reports observed local evidence. It does not prove correctness, security, approval, or merge readiness.`,
    evidenceSummary(manifest),
    runSummary(manifest),
    receiptSection(manifest),
    warningSummary(manifest),
    validationCommands(manifest),
    changedFileSummary(manifest),
    redactionSummary(redactionReport),
    reproductionCommands(manifest),
    limitations(manifest)
  ];

  return `${sections.join("\n\n")}\n`;
}

function evidenceSummary(manifest: TracePackManifest): string {
  const receipt = topReceiptSummary(manifest);
  const commands = topCommandSummary(manifest);

  return [
    "## Evidence Summary",
    table([
      ["Verdict", inlineCode(receipt.verdict)],
      ["Meaning", markdownText(receipt.explanation)],
      [
        "Confidence",
        `${inlineCode(receipt.confidence)} - ${markdownText(formatObservationConfidenceMeaning(receipt.confidence))}`
      ],
      [
        "Commands",
        `${commands.total} total / ${commands.validation} validation / ${commands.failed} failed`
      ],
      ["Warnings", `${manifest.warnings.length}`],
      ["Changed files", `${manifest.git.after.changedFiles.length}`],
      ["Final fingerprint", inlineCode(receipt.finalFingerprint)],
      [
        "Limitation",
        "TracePack records observed local evidence; it does not prove correctness, security, approval, or merge readiness."
      ]
    ])
  ].join("\n\n");
}

function topReceiptSummary(manifest: TracePackManifest): {
  verdict: string;
  confidence: string;
  finalFingerprint: string;
  explanation: string;
} {
  if (!("receipt" in manifest)) {
    return {
      verdict: "inconclusive",
      confidence: "unavailable",
      finalFingerprint: "not available",
      explanation: "Legacy manifest without a final-state validation receipt."
    };
  }

  return {
    verdict: manifest.receipt.verdict,
    confidence: manifest.receipt.observationConfidence ?? "unavailable",
    finalFingerprint: manifest.receipt.final.fingerprint?.short ?? "not available",
    explanation:
      manifest.receipt.explanation ?? formatReceiptVerdictMeaning(manifest.receipt.verdict)
  };
}

function topCommandSummary(manifest: TracePackManifest): {
  total: number;
  validation: number;
  failed: number;
} {
  return {
    total: manifest.commands.length,
    validation: manifest.commands.filter((command) => command.classification === "validation")
      .length,
    failed: manifest.commands.filter(commandFailed).length
  };
}

function runSummary(manifest: TracePackManifest): string {
  return [
    "## Run Summary",
    table([
      ["Run ID", inlineCode(manifest.runId)],
      ["Label", manifest.label ? markdownText(manifest.label) : "None"],
      ["Started", inlineCode(manifest.startedAt)],
      ["Finished", inlineCode(manifest.finishedAt)],
      ["Duration", `${manifest.durationMs} ms`],
      ["Commands", `${manifest.commands.length}`],
      ["Warnings", `${manifest.warnings.length}`],
      ["Working folder", inlineCode(manifest.environment.cwd.label)]
    ])
  ].join("\n\n");
}

function receiptSection(manifest: TracePackManifest): string {
  if (!("receipt" in manifest)) {
    return [
      "## Final-State Validation Receipt",
      "**Verdict:** `inconclusive`",
      "Legacy v0.1 manifest: final-state validation receipts were not captured for this bundle.",
      "Regenerating this report preserves old evidence, but TracePack cannot retroactively prove which repository state a validation command covered."
    ].join("\n\n");
  }

  const receipt = manifest.receipt;
  const confidence =
    receipt.observationConfidence ?? receipt.final.contentObservation ?? "unavailable";
  const changedContentObservation =
    receipt.changedContentObservation ?? receipt.final.contentObservation ?? "unavailable";
  const ignoredObservation = receipt.final.ignoredFiles?.mode ?? "unavailable";
  const confidenceReasons = receipt.confidenceReasons ?? [];
  const observationLimits = receipt.observationLimits ?? [];
  const environmentNotes = receipt.environmentNotes ?? [];

  return [
    "## Final-State Validation Receipt",
    table([
      ["Verdict", inlineCode(receipt.verdict)],
      ["Overall confidence", inlineCode(confidence)],
      ["Final state fingerprint", inlineCode(receipt.final.fingerprint?.short ?? "not available")],
      ["Matched command IDs", ids(receipt.coveringCommandIds)],
      ["Limited command IDs", ids(receipt.limitedCommandIds ?? [])],
      ["Stale command IDs", ids(receipt.staleCommandIds)],
      ["Failed command IDs", ids(receipt.failedCommandIds)],
      ["Failed traced command IDs", ids(receipt.failedTracedCommandIds ?? [])],
      ["Interrupted command IDs", ids(receipt.interruptedCommandIds ?? [])],
      ["Changed-file content observation", inlineCode(changedContentObservation)],
      ["Ignored-path observation", inlineCode(ignoredObservation)]
    ]),
    `**Explanation:** ${markdownText(receipt.explanation)}`,
    environmentNotes.length > 0
      ? [
          "**Environment notes:**",
          list(
            environmentNotes.map(
              (note) =>
                `${inlineCode(note.evidenceRef)}${note.path ? `, path ${inlineCode(note.path)}` : ""}: ${markdownText(note.reason)}`
            )
          )
        ].join("\n\n")
      : "",
    confidenceReasons.length > 0
      ? ["**Confidence notes:**", list(confidenceReasons.map(markdownText))].join("\n\n")
      : "",
    observationLimits.length > 0
      ? [
          "**Observation limit evidence:**",
          list(
            observationLimits.map(
              (limit) =>
                `${inlineCode(limit.evidenceRef)}${limit.path ? `, path ${inlineCode(limit.path)}` : ""}: ${markdownText(limit.reason)}`
            )
          )
        ].join("\n\n")
      : "",
    "TracePack does not prove correctness, security, approval, or merge readiness."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function warningSummary(manifest: TracePackManifest): string {
  if (manifest.warnings.length === 0) {
    return ["## Warning Summary", "No deterministic warning was triggered."].join("\n\n");
  }

  return [
    "## Warning Summary",
    table([
      ["Warnings", `${manifest.warnings.length}`],
      ["Warning IDs", ids(manifest.warnings.map((warning) => warning.id))]
    ]),
    list(
      manifest.warnings.map(
        (warning) =>
          `${inlineCode(warning.id)} ${markdownText(warning.title)} (${inlineCode(warning.label)}): ${markdownText(warning.humanReview)}`
      )
    )
  ].join("\n\n");
}

function validationCommands(manifest: TracePackManifest): string {
  const commands = manifest.commands.filter((command) => command.classification === "validation");
  if (commands.length === 0) {
    return [
      "## Validation Commands",
      "No command was deterministically classified as validation."
    ].join("\n\n");
  }

  return [
    "## Validation Commands",
    markdownTable(
      ["ID", "Command", "Exit", "Evidence", "Pre-state"],
      commands.map((command) => [
        inlineCode(command.id),
        inlineCode(command.argv.join(" ")),
        command.exitCode === null ? "not started" : inlineCode(`${command.exitCode}`),
        inlineCode(command.evidence),
        inlineCode(command.gitBefore?.fingerprint?.short ?? "not captured")
      ])
    )
  ].join("\n\n");
}

function changedFileSummary(manifest: TracePackManifest): string {
  const files = manifest.git.after.changedFiles;
  const countRows: Array<[string, string]> = Object.entries(manifest.git.after.changedFileCounts)
    .map(([status, count]): [string, string] => [inlineCode(status), `${count}`])
    .sort((left, right) => left[0].localeCompare(right[0]));
  const fileRows = files.map((file) => [
    inlineCode(file.path),
    inlineCode(file.status),
    file.looksLikeTest ? "yes" : "no",
    file.contentHashStatus
      ? inlineCode(file.contentHashStatus)
      : file.sha256
        ? "`hashed`"
        : "not captured",
    file.excluded ? markdownText(file.exclusionReason ?? "Excluded") : "no"
  ]);

  return [
    "## Changed-File Summary",
    table([
      ["Dirty state", manifest.git.after.dirty ? "dirty" : "clean"],
      ["Changed files", `${files.length}`]
    ]),
    countRows.length > 0
      ? ["**Counts by status:**", markdownTable(["Status", "Count"], countRows)].join("\n\n")
      : "No changed files were observed by Git.",
    fileRows.length > 0
      ? [
          "**Changed files:**",
          markdownTable(["Path", "Status", "Test-like", "Content hash", "Excluded"], fileRows)
        ].join("\n\n")
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function redactionSummary(redactionReport: RedactionReport): string {
  return [
    "## Redaction Summary",
    table([
      ["Applied", redactionReport.summary.applied ? "yes" : "no"],
      ["Replacement count", `${redactionReport.summary.replacementCount}`],
      ["Excluded evidence", `${redactionReport.summary.excludedEvidenceCount}`],
      ["Output truncated", redactionReport.summary.outputTruncated ? "yes" : "no"]
    ]),
    redactionReport.notes.length > 0 ? list(redactionReport.notes.map(markdownText)) : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function reproductionCommands(manifest: TracePackManifest): string {
  return [
    "## Reproduction Commands",
    "These commands were observed by TracePack. Re-run only commands you approve in your own environment.",
    codeBlock(
      manifest.reproduction.commands.length > 0
        ? manifest.reproduction.commands
        : ["No commands were captured."]
    ),
    manifest.reproduction.notes.length > 0
      ? list(manifest.reproduction.notes.map(markdownText))
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function limitations(manifest: TracePackManifest): string {
  return ["## Explicit Limitations", list(manifest.limitations.map(markdownText))].join("\n\n");
}

function table(rows: Array<[string, string]>): string {
  return markdownTable(
    ["Field", "Value"],
    rows.map(([field, value]) => [markdownText(field), value])
  );
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(tableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`)
  ].join("\n");
}

function tableCell(value: string): string {
  return value.replaceAll("\n", "<br>").replaceAll("|", "\\|");
}

function list(values: string[]): string {
  if (values.length === 0) {
    return "None.";
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function ids(values: string[]): string {
  return values.length > 0 ? values.map(inlineCode).join(", ") : "None";
}

function inlineCode(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.includes("`") ? `\`\` ${normalized} \`\`` : `\`${normalized}\``;
}

function codeBlock(values: string[]): string {
  return values.map((value) => `    ${value.replace(/\r?\n/g, "\n    ")}`).join("\n");
}

function markdownText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ");
}
