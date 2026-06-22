import type { Command } from "commander";
import { finishSession } from "../core/session.js";

export function registerFinish(program: Command): void {
  program
    .command("finish")
    .description("Close the active Tracepack session and generate the review bundle.")
    .option("--label <name>", "override or set the run label")
    .action(async (options: { label?: string }) => {
      const result = await finishSession(process.cwd(), options.label);
      console.log(`Tracepack session finished: ${result.session.runId}`);
      console.log(`Bundle written: ${result.bundleDir}`);
      console.log(`Manifest: ${result.bundleDir}\\manifest.json`);
      console.log(`Report: ${result.bundleDir}\\report.html`);
      if (result.manifest.warnings.length > 0) {
        console.log(`Warnings: ${result.manifest.warnings.length} need human review`);
      }
    });
}
