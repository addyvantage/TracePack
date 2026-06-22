import path from "node:path";
import type { Command } from "commander";
import { regenerateReport } from "../core/bundle.js";

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Regenerate report.html from an existing Tracepack bundle.")
    .argument("<bundle-dir>", "directory containing manifest.json and redaction-report.json")
    .action(async (bundleDir: string) => {
      const output = await regenerateReport(path.resolve(bundleDir));
      console.log(`Report regenerated: ${output}`);
    });
}
