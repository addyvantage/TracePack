import type { Command } from "commander";
import { startSession } from "../core/session.js";

export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Create a baseline TracePack session in the current Git repository.")
    .option("--label <name>", "human-readable run label")
    .action(async (options: { label?: string }) => {
      const session = await startSession(process.cwd(), options.label);
      console.log(`TracePack session started: ${session.runId}`);
      console.log(`Session state: .tracepack/${session.runId}/session.json`);
    });
}
