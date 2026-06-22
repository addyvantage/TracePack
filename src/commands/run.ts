import type { Command } from "commander";
import { runCommandInSession } from "../core/session.js";

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Run a user-approved command and capture deterministic evidence.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[command...]", "command argv after --")
    .action(async (command: string[]) => {
      if (!command || command.length === 0) {
        throw new Error("Usage: tracepack run -- <command...>");
      }

      const result = await runCommandInSession(process.cwd(), command);
      console.log("");
      console.log(`Tracepack captured command ${result.command.id} (${result.command.evidence}).`);
      if (result.finishedBundleDir) {
        console.log(`Bundle written: ${result.finishedBundleDir}`);
        console.log(`Report: ${result.finishedBundleDir}\\report.html`);
      }

      if (result.command.exitCode !== 0) {
        process.exitCode = result.command.exitCode ?? 1;
      }
    });
}
