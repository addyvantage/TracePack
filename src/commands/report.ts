import path from "node:path";
import type { Command } from "commander";
import {
  appendGithubStepSummary,
  findLatestBundleDir,
  githubStepSummaryPath,
  regenerateReport,
  type ReportFormat
} from "../core/bundle.js";
import { normalizeRelativePath } from "../core/paths.js";
import { arrow, glyph, shouldUseColor } from "../core/terminal.js";

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
      console.log(formatReportCommandOutput(result, process.cwd(), { color: shouldUseColor() }));
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

export function formatReportCommandOutput(
  result: ReportCommandResult,
  cwd: string,
  options: { color?: boolean; unicode?: boolean } = {}
): string {
  const lines = [
    `${glyph("observed", options)} Report regenerated`,
    `  bundle       ${relativePath(cwd, result.resolvedBundleDir)}`,
    result.outputs.length === 1
      ? `  output       ${relativePath(cwd, result.outputs[0] as string)}`
      : `  outputs      ${result.outputs.map((output) => relativePath(cwd, output)).join(", ")}`,
    result.githubSummaryPath
      ? `  github      ${relativePath(cwd, result.githubSummaryPath)}`
      : undefined,
    "",
    `  ${arrow(options)} open report.html from disk`
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function relativePath(cwd: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(cwd, absolutePath));
}
