import path from "node:path";
import type { Command } from "commander";
import { regenerateReport, type ReportFormat } from "../core/bundle.js";

const REPORT_FORMATS = new Set(["html", "markdown", "json", "all"]);

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Regenerate report exports from an existing TracePack bundle.")
    .argument("<bundle-dir>", "directory containing manifest.json and redaction-report.json")
    .option("--format <format>", "report format: html, markdown, json, or all", "html")
    .option("--out <path>", "output path for a single report format")
    .action(async (bundleDir: string, options: { format: string; out?: string }) => {
      const format = parseReportFormat(options.format);
      if (format === "all" && options.out) {
        throw new Error("--out is only supported for a single report format.");
      }

      const outputs = await regenerateReport(path.resolve(bundleDir), {
        format,
        ...(options.out ? { out: path.resolve(options.out) } : {})
      });

      if (outputs.length === 1) {
        console.log(`Report regenerated: ${outputs[0]}`);
      } else {
        console.log(`Reports regenerated:\n${outputs.map((output) => `- ${output}`).join("\n")}`);
      }
    });
}

function parseReportFormat(format: string): ReportFormat {
  if (REPORT_FORMATS.has(format)) {
    return format as ReportFormat;
  }
  throw new Error(`Unsupported report format: ${format}. Use html, markdown, json, or all.`);
}
