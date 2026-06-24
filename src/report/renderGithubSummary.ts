import {
  commandExitText,
  commandFailed,
  formatObservationConfidenceMeaning,
  formatReceiptVerdictMeaning
} from "../core/format.js";
import type { FinalStateReceipt, TracePackManifest } from "../core/manifest.js";
import { classifyIgnoredPath } from "../core/paths.js";

export const GITHUB_SUMMARY_DISCLAIMER =
  "TracePack records local validation evidence. It does not prove correctness, security, approval, or merge readiness.";

export type GithubSummaryOptions = {
  artifactName?: string;
};

type ReceiptSummary = {
  verdict: string;
  confidence: string;
  explanation: string;
  finalFingerprint: string;
  observationLimits: NonNullable<FinalStateReceipt["observationLimits"]>;
  environmentNotes: NonNullable<FinalStateReceipt["environmentNotes"]>;
};

type CommandSummary = {
  total: number;
  passed: number;
  failed: number;
  interrupted: number;
};

export function renderGithubStepSummary(
  manifest: TracePackManifest,
  options: GithubSummaryOptions = {}
): string {
  const receipt = receiptSummary(manifest);
  const commands = commandSummary(manifest);
  const artifactName = options.artifactName?.trim() || "tracepack-receipt-*";

  return [
    "## TracePack Validation Receipt",
    table([
      ["Receipt verdict", inlineCode(receipt.verdict)],
      ["Confidence", inlineCode(receipt.confidence)],
      ["Final observed state", markdownText(manifest.git.after.statusSummary)],
      ["Final fingerprint", inlineCode(receipt.finalFingerprint)],
      ["Session ID", inlineCode(manifest.runId)],
      ["Git branch", inlineCode(manifest.git.after.branch ?? "not observed")],
      ["Git SHA", inlineCode(manifest.git.after.head ?? "not observed")],
      ["Commands recorded", `${commands.total}`],
      ["Passed", `${commands.passed}`],
      ["Failed", `${commands.failed}`],
      ["Interrupted", `${commands.interrupted}`]
    ]),
    `**Evidence note:** ${markdownText(evidenceNote(receipt.verdict, receipt.explanation))}`,
    `**Confidence note:** ${markdownText(formatObservationConfidenceMeaning(receipt.confidence))}`,
    commandSection(manifest),
    limitationsSection(receipt),
    environmentSection(receipt),
    `Download the ${inlineCode(artifactName)} artifact from this workflow run for the full static receipt: ${inlineCode("report.html")}, ${inlineCode("report.md")}, ${inlineCode("summary.json")}, ${inlineCode("manifest.json")}, and ${inlineCode("redaction-report.json")}.`,
    `> ${GITHUB_SUMMARY_DISCLAIMER}`
  ]
    .filter(Boolean)
    .join("\n\n")
    .trimEnd()
    .concat("\n");
}

function receiptSummary(manifest: TracePackManifest): ReceiptSummary {
  if (!("receipt" in manifest)) {
    return {
      verdict: "inconclusive",
      confidence: "unavailable",
      explanation: "Legacy manifest without a final-state validation receipt.",
      finalFingerprint: "not available",
      observationLimits: [
        {
          kind: "legacy_receipt_unavailable",
          evidenceRef: "manifest.schemaVersion",
          reason: "Legacy manifest did not include a final-state validation receipt."
        }
      ],
      environmentNotes: []
    };
  }

  return {
    verdict: manifest.receipt.verdict,
    confidence: manifest.receipt.observationConfidence ?? "unavailable",
    explanation:
      manifest.receipt.explanation ?? formatReceiptVerdictMeaning(manifest.receipt.verdict),
    finalFingerprint: manifest.receipt.final.fingerprint?.short ?? "not available",
    observationLimits: manifest.receipt.observationLimits ?? [],
    environmentNotes: manifest.receipt.environmentNotes ?? []
  };
}

function commandSummary(manifest: TracePackManifest): CommandSummary {
  let passed = 0;
  let failed = 0;
  let interrupted = 0;

  for (const command of manifest.commands) {
    if (commandInterrupted(command)) {
      interrupted += 1;
    } else if (commandFailed(command)) {
      failed += 1;
    } else if (command.exitCode === 0) {
      passed += 1;
    }
  }

  return {
    total: manifest.commands.length,
    passed,
    failed,
    interrupted
  };
}

function commandSection(manifest: TracePackManifest): string {
  if (manifest.commands.length === 0) {
    return "### Commands recorded\n\nNo commands were recorded by TracePack.";
  }

  return [
    "### Commands recorded",
    markdownTable(
      ["ID", "Command", "Classification", "Result", "Exit / signal"],
      manifest.commands.map((command) => [
        inlineCode(command.id),
        inlineCode(safeCommandText(command.argv)),
        inlineCode(command.classification),
        inlineCode(commandResult(command)),
        inlineCode(commandExitText(command))
      ])
    )
  ].join("\n\n");
}

function limitationsSection(receipt: ReceiptSummary): string {
  if (receipt.observationLimits.length === 0) {
    return "### Evidence limitations\n\nNo confidence-limiting evidence limits were recorded in the receipt.";
  }

  return [
    "### Evidence limitations",
    list(
      receipt.observationLimits
        .slice(0, 6)
        .map((limit) =>
          [
            inlineCode(limit.kind),
            `(${inlineCode(limit.evidenceRef)})`,
            markdownText(limit.reason)
          ].join(" ")
        )
    ),
    receipt.observationLimits.length > 6
      ? `${receipt.observationLimits.length - 6} more evidence limit(s) are listed in the full receipt.`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function environmentSection(receipt: ReceiptSummary): string {
  if (receipt.environmentNotes.length === 0) {
    return "";
  }

  return [
    "### Environment notes",
    list(
      receipt.environmentNotes
        .slice(0, 4)
        .map((note) =>
          [
            inlineCode(note.kind),
            `(${inlineCode(note.evidenceRef)})`,
            markdownText(note.reason)
          ].join(" ")
        )
    ),
    receipt.environmentNotes.length > 4
      ? `${receipt.environmentNotes.length - 4} more environment note(s) are listed in the full receipt.`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function evidenceNote(verdict: string, explanation: string): string {
  if (verdict === "validated_final_state") {
    return "Validation evidence was observed against the final observed repository state.";
  }
  if (verdict === "validation_stale") {
    return "Stale validation evidence: successful validation was observed for an earlier state, not the final observed repository state.";
  }
  if (verdict === "validation_failed") {
    return "Validation failure observed: a validation command was observed against the final repository state, but it failed.";
  }
  if (verdict === "command_interrupted") {
    return "Command interruption observed: a traced command was interrupted or timed out before successful validation was observed.";
  }
  if (verdict === "command_failed") {
    return "Command failure observed: a traced command failed before successful validation was observed.";
  }
  if (verdict === "no_validation_observed") {
    return "No command classified as validation was observed through TracePack.";
  }
  return `Receipt is inconclusive. ${explanation}`;
}

function commandResult(command: TracePackManifest["commands"][number]): string {
  if (commandInterrupted(command)) {
    return "interrupted";
  }
  if (commandFailed(command)) {
    return "failed";
  }
  if (command.exitCode === 0) {
    return "passed";
  }
  return "not_available";
}

function commandInterrupted(command: TracePackManifest["commands"][number]): boolean {
  return command.signal !== null || /timed out|interrupted/i.test(command.error ?? "");
}

function safeCommandText(argv: string[]): string {
  return argv.map(safeCommandArg).map(quoteArg).join(" ");
}

function safeCommandArg(arg: string): string {
  if (looksLikeSensitivePathArg(arg)) {
    return "[sensitive-arg-hidden]";
  }
  return arg;
}

function looksLikeSensitivePathArg(arg: string): boolean {
  const candidates = arg
    .split(/[\s="'`(),;]+/)
    .flatMap((part) => part.split("="))
    .map((part) => part.trim())
    .filter(Boolean);

  return candidates.some((candidate) => classifyIgnoredPath(candidate) === "sensitive_local_input");
}

function quoteArg(arg: string): string {
  return /[ \t"'`|]/.test(arg) ? JSON.stringify(arg) : arg;
}

function table(rows: Array<[string, string]>): string {
  return markdownTable(
    ["Field", "Evidence"],
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

function inlineCode(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.includes("`") ? `\`\` ${normalized} \`\`` : `\`${normalized}\``;
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
