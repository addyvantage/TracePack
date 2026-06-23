import path from "node:path";
import type { Command } from "commander";
import {
  inspectActiveSession,
  quoteCommand,
  type ActiveSessionInspection
} from "../core/session.js";
import type { CommandEvidence } from "../core/manifest.js";
import { commandExitText } from "../core/format.js";
import { normalizeRelativePath, safePathDescriptor } from "../core/paths.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show the active TracePack session or recovery state.")
    .action(async () => {
      console.log(formatStatusInspection(await inspectActiveSession(process.cwd()), process.cwd()));
    });
}

export function formatStatusInspection(inspection: ActiveSessionInspection, cwd: string): string {
  if (inspection.state === "none") {
    return ["No active TracePack session.", "", "Next: run `tracepack start`"].join("\n");
  }

  if (inspection.state === "stale") {
    return [
      "TracePack active-session pointer is stale or unreadable.",
      `Pointer: ${relativePath(cwd, inspection.pointerPath)}`,
      inspection.runId ? `Run ID: ${inspection.runId}` : undefined,
      `Reason: ${inspection.reason}`,
      "",
      "Next: run `tracepack clean --force`"
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
  }

  const session = inspection.session;
  const cwdDescriptor = safePathDescriptor(session.cwd);
  const lines = [
    "TracePack active session",
    `Run ID: ${session.runId}`,
    session.label ? `Label: ${session.label}` : undefined,
    `Started: ${session.startedAt}`,
    `Working folder: ${cwdDescriptor.label} (${cwdDescriptor.representation}, path hash ${cwdDescriptor.pathHash})`,
    `Branch: ${session.initialGit.branch ?? "not observed"}`,
    `HEAD: ${session.initialGit.head ?? "not observed"}`,
    `Baseline fingerprint: ${session.initialState.fingerprint?.short ?? "not available"}`,
    "",
    `Commands captured: ${session.commands.length}`
  ].filter((line): line is string => line !== undefined);

  for (const command of session.commands) {
    lines.push(...formatStatusCommand(command));
  }

  lines.push(
    "",
    "Next: run `tracepack run -- <command>` or `tracepack finish`",
    "Recovery: run `tracepack clean` to clear the active-session pointer."
  );

  return lines.join("\n");
}

function formatStatusCommand(command: CommandEvidence): string[] {
  const lines = [
    `- ${command.id} ${quoteCommand(command.argv)}`,
    `  classification: ${command.classification}`,
    `  evidence: ${command.evidence}`,
    `  exit / signal: ${commandExitText(command)}`,
    `  duration: ${command.durationMs} ms`
  ];

  if (command.error) {
    lines.push(`  error: ${command.error}`);
  }

  return lines;
}

function relativePath(cwd: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(cwd, absolutePath));
}
