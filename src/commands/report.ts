import path from "node:path";
import type { Command } from "commander";
import {
  appendGithubStepSummary,
  findLatestBundleDir,
  githubStepSummaryPath,
  regenerateReport,
  type ReportFormat
} from "../core/bundle.js";

const REPORT_FORMATS = new Set(["html", "markdown", "json", "all"]);

export type ReportCommandOptions = {
  format: string;
  out?: string;
  githubSummary?: boolean;
  artifactName?: string;
  githubSummaryPath?: string;
};

export type ReportCommandResult = {
  resolvedBundleDir: string;
  outputs: string[];
  githubSummaryPath?: string;
};

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Regenerate report exports from an existing TracePack bundle.")
    .argument("[bundle-dir]", "directory containing manifest.json and redaction-report.json")
    .option("--format <format>", "report format: html, markdown, json, or all", "html")
    .option("--out <path>", "output path for a single report format")
    .option("--github-summary", "append a compact receipt summary to $GITHUB_STEP_SUMMARY")
    .option("--artifact-name <name>", "artifact name to mention in --github-summary output")
    .action(async (bundleDir: string | undefined, options: ReportCommandOptions) => {
      const result = await runReportCommand(process.cwd(), bundleDir, options);

      if (!bundleDir) {
        console.log(`Using latest TracePack bundle: ${result.resolvedBundleDir}`);
      }
      if (result.outputs.length === 1) {
        console.log(`Report regenerated: ${result.outputs[0]}`);
      } else {
        console.log(
          `Reports regenerated:\n${result.outputs.map((output) => `- ${output}`).join("\n")}`
        );
      }
      if (result.githubSummaryPath) {
        console.log(`GitHub job summary appended: ${result.githubSummaryPath}`);
      }
    });
}

export async function runReportCommand(
  cwd: string,
  bundleDir: string | undefined,
  options: ReportCommandOptions
): Promise<ReportCommandResult> {
  const format = parseReportFormat(options.format);
  if (format === "all" && options.out) {
    throw new Error("--out is only supported for a single report format.");
  }
  if (options.artifactName && !options.githubSummary) {
    throw new Error("--artifact-name requires --github-summary.");
  }

  const summaryPath = options.githubSummary
    ? githubStepSummaryPath(options.githubSummaryPath)
    : undefined;
  const resolvedBundleDir = bundleDir ? path.resolve(bundleDir) : await findLatestBundleDir(cwd);
  const outputs = await regenerateReport(resolvedBundleDir, {
    format,
    ...(options.out ? { out: path.resolve(options.out) } : {})
  });

  if (summaryPath) {
    await appendGithubStepSummary(resolvedBundleDir, {
      summaryPath,
      artifactName: options.artifactName
    });
  }

  return { resolvedBundleDir, outputs, ...(summaryPath ? { githubSummaryPath: summaryPath } : {}) };
}

function parseReportFormat(format: string): ReportFormat {
  if (REPORT_FORMATS.has(format)) {
    return format as ReportFormat;
  }
  throw new Error(`Unsupported report format: ${format}. Use html, markdown, json, or all.`);
}
