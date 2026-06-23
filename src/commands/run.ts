import type { Command } from "commander";
import path from "node:path";
import { DEFAULT_COMMAND_TIMEOUT_SECONDS, validateTimeoutSeconds } from "../core/commands.js";
import { runCommandInSession } from "../core/session.js";

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
      console.log("");
      console.log(`TracePack captured command ${result.command.id} (${result.command.evidence}).`);
      if (result.finishedBundleDir) {
        console.log(`Bundle written: ${result.finishedBundleDir}`);
        console.log(`Report: ${path.join(result.finishedBundleDir, "report.html")}`);
      }

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
