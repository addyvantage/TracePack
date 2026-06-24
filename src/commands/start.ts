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
      if (session.tracepackGitExclude?.state === "added") {
        console.log(
          "TracePack added `.tracepack/` to `.git/info/exclude` as a local-only Git exclude entry."
        );
      }
      console.log(`Session state: .tracepack/${session.runId}/session.json`);
      console.log("Next: run `tracepack run -- <command>` or `tracepack status`");
    });
}
