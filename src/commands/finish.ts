import type { Command } from "commander";
import path from "node:path";
import { finishSession } from "../core/session.js";
import { displayVerdictForManifest, type DisplayVerdict } from "../core/display.js";
import {
  commandExitText,
  commandFailed,
  formatObservationConfidenceMeaning
} from "../core/format.js";
import { normalizeRelativePath } from "../core/paths.js";
import { safeCommandText, sanitizeCommandString } from "../core/redaction.js";
import { arrow, glyph, shouldUseColor, type TerminalState } from "../core/terminal.js";

export function registerFinish(program: Command): void {
  program
    .command("finish")
    .description("Close the active TracePack session and generate the review bundle.")
    .option("--label <name>", "override or set the run label")
    .option("--verbose", "include full receipt, confidence, and bundle details")
    .action(async (options: { label?: string; verbose?: boolean }) => {
      const result = await finishSession(process.cwd(), options.label);
      console.log(
        formatFinishOutput(result, { verbose: options.verbose, color: shouldUseColor() })
      );
    });
}

type FinishSessionResult = Awaited<ReturnType<typeof finishSession>>;

export function formatFinishOutput(
  result: FinishSessionResult,
  options: { verbose?: boolean; color?: boolean; unicode?: boolean } = {}
): string {
  return options.verbose
    ? formatVerboseFinishOutput(result)
    : formatCompactFinishOutput(result, options);
}

function formatCompactFinishOutput(
  result: FinishSessionResult,
  options: { color?: boolean; unicode?: boolean } = {}
): string {
  const manifest = result.manifest;
  const verdict = displayVerdictForManifest(manifest);
  const terminalState = terminalStateForVerdict(verdict);
  const validation = relevantValidationCommand(manifest);
  const changedFiles = manifest.git.after.changedFiles;
  const reportPath = relativePath(result.session.cwd, path.join(result.bundleDir, "report.html"));
  const lines = [
    `${glyph(terminalState, options)} ${verdict.headline}`,
    ...verdict.explanation.split(/(?<=\.)\s+/).map((line) => `  ${line}`),
    "",
    validationLine(validation),
    finalStateLine(manifest, verdict, validation),
    changedFiles.length > 0 ? changedFilesLine(changedFiles) : undefined,
    needsReviewLine(manifest),
    "",
    `  report       ${reportPath}`,
    `  ${arrow(options)} ${verdict.nextAction}`
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function formatVerboseFinishOutput(result: FinishSessionResult): string {
  const manifest = result.manifest;
  const commands = manifest.commands;
  const validationCount = commands.filter(
    (command) => command.classification === "validation"
  ).length;
  const failedCount = commands.filter(commandFailed).length;
  const erroredCount = commands.filter(
    (command) => !!command.error || command.signal !== null
  ).length;
  const changedFiles = manifest.git.after.changedFiles;
  const examples = changedFiles.slice(0, 5);
  const confidence = manifest.receipt.observationConfidence ?? "unavailable";
  const displayVerdict = displayVerdictForManifest(manifest);
  const lines = [
    `${displayVerdict.headline}`,
    `Run ID: ${manifest.runId}`,
    manifest.label ? `Label: ${manifest.label}` : undefined,
    `Receipt verdict: ${manifest.receipt.verdict}`,
    `Receipt meaning: ${displayVerdict.explanation}`,
    `Receipt confidence: ${confidence}`,
    `Confidence meaning: ${formatObservationConfidenceMeaning(confidence)}`,
    `Final fingerprint: ${manifest.receipt.final.fingerprint?.short ?? "not available"}`,
    `Duration: ${manifest.durationMs} ms`,
    "",
    "Commands:",
    `  total: ${commands.length}`,
    `  validation: ${validationCount}`,
    `  failed: ${failedCount}`,
    `  timed out / errored: ${erroredCount}`,
    "",
    "Final Git state:",
    `  branch: ${manifest.git.after.branch ?? "not observed"}`,
    `  changed files: ${changedFiles.length}`
  ].filter((line): line is string => line !== undefined);

  if (examples.length > 0) {
    lines.push("  examples:");
    for (const file of examples) {
      lines.push(`    - ${sanitizeCommandString(file.path)}`);
    }
  }

  lines.push("", `Warnings: ${manifest.warnings.length}`);
  for (const warning of manifest.warnings.slice(0, 5)) {
    lines.push(`  - ${warning.id} ${warning.title}`);
  }

  if (confidence !== "complete") {
    const confidenceReasons = manifest.receipt.confidenceReasons ?? [];
    if (confidenceReasons.length > 0) {
      lines.push("", "Confidence notes:");
      for (const reason of confidenceReasons.slice(0, 3)) {
        lines.push(`  - ${reason}`);
      }
      if (confidenceReasons.length > 3) {
        lines.push(`  - ${confidenceReasons.length - 3} more note(s) in the HTML report.`);
      }
    }
  }

  const erroredCommands = commands.filter((command) => !!command.error);
  if (erroredCommands.length > 0) {
    lines.push("", "Command errors:");
    for (const command of erroredCommands.slice(0, 5)) {
      lines.push(`  - ${command.id}: ${sanitizeCommandString(command.error ?? "")}`);
    }
  }

  lines.push(
    "",
    `Bundle: ${relativePath(result.session.cwd, result.bundleDir)}`,
    `Manifest: ${relativePath(result.session.cwd, path.join(result.bundleDir, "manifest.json"))}`,
    `Report: ${relativePath(result.session.cwd, path.join(result.bundleDir, "report.html"))}`,
    "",
    `Next: ${displayVerdict.nextAction}`
  );

  return lines.join("\n");
}

function relevantValidationCommand(manifest: FinishSessionResult["manifest"]) {
  const receipt = manifest.receipt;
  const ids = [
    ...receipt.coveringCommandIds,
    ...receipt.staleCommandIds,
    ...receipt.failedCommandIds
  ];
  for (const command of [...manifest.commands].reverse()) {
    if (ids.includes(command.id)) {
      return command;
    }
  }
  return [...manifest.commands]
    .reverse()
    .find((command) => command.classification === "validation");
}

function validationLine(command: ReturnType<typeof relevantValidationCommand>): string {
  if (!command) {
    return "  validation   not observed   no validation command captured";
  }
  const state = commandFailed(command) ? "failed" : "observed";
  return `  validation   ${state.padEnd(11)} ${safeCommandText(command.argv)} · ${commandExitText(command)}`;
}

function finalStateLine(
  manifest: FinishSessionResult["manifest"],
  verdict: DisplayVerdict,
  validation: ReturnType<typeof relevantValidationCommand>
): string {
  const final = manifest.receipt.final.fingerprint?.short ?? "not available";
  const validationShort = validation?.gitBefore?.fingerprint?.short;
  const detail =
    verdict.key === "final_state_validation_observed"
      ? "matched last validation"
      : verdict.key === "validation_evidence_incomplete" && validationShort
        ? "changed after last validation"
        : verdict.key === "validation_command_failed"
          ? "validation did not complete"
          : "fingerprint unavailable";
  return `  final state  ${final.padEnd(11)} ${detail}`;
}

function changedFilesLine(
  files: FinishSessionResult["manifest"]["git"]["after"]["changedFiles"]
): string {
  const examples = files
    .slice(0, 2)
    .map((file) => sanitizeCommandString(file.path))
    .join(", ");
  const suffix = files.length > 2 ? `, +${files.length - 2} more` : "";
  return `  changed files ${String(files.length).padEnd(10)} ${examples}${suffix}`;
}

function needsReviewLine(manifest: FinishSessionResult["manifest"]): string {
  const first = manifest.warnings[0];
  if (!first) {
    return "  needs review 0          No deterministic review trigger.";
  }
  return `  needs review ${String(manifest.warnings.length).padEnd(10)} ${first.id} ${first.title}`;
}

function terminalStateForVerdict(verdict: DisplayVerdict): TerminalState {
  if (verdict.key === "final_state_validation_observed") {
    return "observed";
  }
  if (verdict.key === "validation_command_failed") {
    return "failed";
  }
  if (verdict.key === "repository_evidence_unavailable") {
    return "neutral";
  }
  return "warn";
}

function relativePath(cwd: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(cwd, absolutePath));
}
