import type { Command } from "commander";
import path from "node:path";
import { finishSession } from "../core/session.js";
import type { CommandEvidence } from "../core/manifest.js";

export function registerFinish(program: Command): void {
  program
    .command("finish")
    .description("Close the active TracePack session and generate the review bundle.")
    .option("--label <name>", "override or set the run label")
    .action(async (options: { label?: string }) => {
      const result = await finishSession(process.cwd(), options.label);
      console.log(formatFinishOutput(result));
    });
}

type FinishSessionResult = Awaited<ReturnType<typeof finishSession>>;

export function formatFinishOutput(result: FinishSessionResult): string {
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
  const lines = [
    "TracePack session finished",
    `Run ID: ${manifest.runId}`,
    manifest.label ? `Label: ${manifest.label}` : undefined,
    `Duration: ${manifest.durationMs} ms`,
    "",
    "Receipt:",
    `  verdict: ${manifest.receipt.verdict}`,
    `  confidence: ${manifest.receipt.observationConfidence ?? "unavailable"}`,
    `  final fingerprint: ${manifest.receipt.final.fingerprint?.short ?? "not available"}`,
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
      lines.push(`    - ${file.path}`);
    }
  }

  lines.push("", `Warnings: ${manifest.warnings.length}`);
  for (const warning of manifest.warnings.slice(0, 5)) {
    lines.push(`  - ${warning.id} ${warning.title}`);
  }

  const erroredCommands = commands.filter((command) => !!command.error);
  if (erroredCommands.length > 0) {
    lines.push("", "Command errors:");
    for (const command of erroredCommands.slice(0, 5)) {
      lines.push(`  - ${command.id}: ${command.error}`);
    }
  }

  lines.push(
    "",
    `Bundle written: ${result.bundleDir}`,
    `Manifest: ${path.join(result.bundleDir, "manifest.json")}`,
    `Report: ${path.join(result.bundleDir, "report.html")}`,
    "",
    "TracePack records observed local evidence. It does not prove correctness, security, approval, or merge readiness."
  );

  return lines.join("\n");
}

function commandFailed(command: CommandEvidence): boolean {
  return (
    command.exitCode !== 0 &&
    (command.exitCode !== null || !!command.error || command.signal !== null)
  );
}
