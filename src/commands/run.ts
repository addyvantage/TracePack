import type { Command } from "commander";
import path from "node:path";
import { DEFAULT_COMMAND_TIMEOUT_SECONDS, validateTimeoutSeconds } from "../core/commands.js";
import { runCommandInSession } from "../core/session.js";
import { commandExitText, commandFailed } from "../core/format.js";
import { normalizeRelativePath } from "../core/paths.js";
import { safeCommandText, sanitizeCommandString } from "../core/redaction.js";
import { arrow, glyph, shouldUseColor } from "../core/terminal.js";

type RunOptions = {
  timeout?: string;
};

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Run a user-approved command and capture deterministic evidence.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option(
      "--timeout <seconds>",
      `maximum command runtime in seconds before timeout (positive integer; default ${DEFAULT_COMMAND_TIMEOUT_SECONDS})`
    )
    .argument("[command...]", "command argv after --")
    .action(async (command: string[], options: RunOptions) => {
      if (!command || command.length === 0) {
        throw new Error("Usage: TracePack run -- <command...>");
      }

      const timeoutSeconds = parseRunTimeoutSeconds(
        options.timeout ?? String(DEFAULT_COMMAND_TIMEOUT_SECONDS)
      );
      const result = await runCommandInSession(process.cwd(), command, { timeoutSeconds });
      console.log(formatRunOutput(result, { color: shouldUseColor() }));

      if (result.command.exitCode !== 0) {
        process.exitCode = result.command.exitCode ?? 1;
      }
    });
}

export function parseRunTimeoutSeconds(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid --timeout value "${value}". Timeout must be a positive integer number of seconds.`
    );
  }

  const parsed = Number.parseInt(value, 10);
  try {
    return validateTimeoutSeconds(parsed);
  } catch {
    throw new Error(
      `Invalid --timeout value "${value}". Timeout must be a positive integer number of seconds.`
    );
  }
}

type RunCommandResult = Awaited<ReturnType<typeof runCommandInSession>>;

export function formatRunOutput(
  result: RunCommandResult,
  options: { color?: boolean; unicode?: boolean } = {}
): string {
  const failed = commandFailed(result.command);
  const state = failed ? "failed" : "observed";
  const lines = [
    `${glyph(state, options)} Command captured`,
    `  command      ${safeCommandText(result.command.argv)}`,
    `  result       ${commandExitText(result.command)}`,
    `  evidence     ${result.command.classification} · ${result.command.evidence}`,
    outputLine(result),
    result.command.error
      ? `  error        ${sanitizeCommandString(result.command.error)}`
      : undefined,
    result.finishedBundleDir
      ? `  report       ${relativePath(result.session.cwd, path.join(result.finishedBundleDir, "report.html"))}`
      : undefined,
    "",
    result.finishedBundleDir
      ? `  ${arrow(options)} open the report before sharing the receipt`
      : `  ${arrow(options)} tracepack finish`
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function outputLine(result: RunCommandResult): string {
  const output =
    result.command.stdout.truncated || result.command.stderr.truncated ? "truncated" : "captured";
  const redacted = result.command.redaction.applied ? ", redacted" : "";
  return `  output       ${output}${redacted} in report`;
}

function relativePath(cwd: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(cwd, absolutePath));
}
