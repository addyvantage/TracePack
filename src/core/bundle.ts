import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateManifest,
  validateRedactionReport,
  type RedactionReport,
  type TracePackManifest
} from "./manifest.js";
import { tracepackDir } from "./paths.js";
import { renderHtmlReport } from "../report/renderHtml.js";
import { renderMarkdownReport } from "../report/renderMarkdown.js";
import { renderSummaryJson } from "../report/renderSummaryJson.js";
import { renderGithubStepSummary } from "../report/renderGithubSummary.js";

export type ReportFormat = "html" | "markdown" | "json" | "all";

export type RegenerateReportOptions = {
  format?: ReportFormat;
  out?: string;
};

export type GithubStepSummaryOptions = {
  summaryPath?: string;
  artifactName?: string;
};

export async function writeBundle(
  bundleDir: string,
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): Promise<void> {
  await mkdir(bundleDir, { recursive: true });
  await writeJson(path.join(bundleDir, "manifest.json"), validateManifest(manifest));
  await writeJson(
    path.join(bundleDir, "redaction-report.json"),
    validateRedactionReport(redactionReport)
  );
  await writeFile(
    path.join(bundleDir, "report.html"),
    renderHtmlReport(manifest, redactionReport),
    "utf8"
  );
}

export async function regenerateReport(bundleDir: string): Promise<string>;
export async function regenerateReport(
  bundleDir: string,
  options: RegenerateReportOptions
): Promise<string[]>;
export async function regenerateReport(
  bundleDir: string,
  options?: RegenerateReportOptions
): Promise<string | string[]> {
  const { manifest, redactionReport } = await readBundle(bundleDir);
  const format = options?.format ?? "html";
  const outputs = await writeReportOutputs(bundleDir, manifest, redactionReport, {
    format,
    out: options?.out
  });
  return options ? outputs : (outputs[0] ?? path.join(bundleDir, "report.html"));
}

export async function appendGithubStepSummary(
  bundleDir: string,
  options: GithubStepSummaryOptions = {}
): Promise<string> {
  const summaryPath = githubStepSummaryPath(options.summaryPath);
  const { manifest } = await readBundle(bundleDir);
  const existing = await readFileIfPresent(summaryPath);
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(
    summaryPath,
    `${prefix}${renderGithubStepSummary(manifest, { artifactName: options.artifactName })}`,
    "utf8"
  );
  return summaryPath;
}

export function githubStepSummaryPath(explicitPath?: string): string {
  const summaryPath = explicitPath ?? process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath?.trim()) {
    throw new Error("--github-summary requires GITHUB_STEP_SUMMARY to be set by GitHub Actions.");
  }
  return summaryPath;
}

export async function readBundle(bundleDir: string): Promise<{
  manifest: TracePackManifest;
  redactionReport: RedactionReport;
}> {
  const manifest = validateManifest(await readJson(path.join(bundleDir, "manifest.json")));
  const redactionReport = validateRedactionReport(
    await readJson(path.join(bundleDir, "redaction-report.json"))
  );
  return { manifest, redactionReport };
}

export async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readFileIfPresent(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function findLatestBundleDir(cwd: string): Promise<string> {
  const root = tracepackDir(cwd);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    throw new Error("No TracePack bundles were found in .tracepack/.");
  }

  const candidates: Array<{ bundleDir: string; finishedAtMs: number; name: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const bundleDir = path.join(root, entry.name);
    try {
      const manifest = validateManifest(await readJson(path.join(bundleDir, "manifest.json")));
      validateRedactionReport(await readJson(path.join(bundleDir, "redaction-report.json")));
      const finishedAtMs = Date.parse(manifest.finishedAt);
      candidates.push({
        bundleDir,
        finishedAtMs: Number.isFinite(finishedAtMs) ? finishedAtMs : 0,
        name: entry.name
      });
    } catch {
      // Active or incomplete session directories are not report bundles.
    }
  }

  candidates.sort(
    (left, right) => right.finishedAtMs - left.finishedAtMs || right.name.localeCompare(left.name)
  );
  const latest = candidates[0];
  if (!latest) {
    throw new Error("No completed TracePack bundles were found in .tracepack/.");
  }
  return latest.bundleDir;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReportOutputs(
  bundleDir: string,
  manifest: TracePackManifest,
  redactionReport: RedactionReport,
  options: { format: ReportFormat; out?: string }
): Promise<string[]> {
  if (options.format === "all") {
    if (options.out) {
      throw new Error("--out is only supported for a single report format.");
    }
    return Promise.all([
      writeSingleReport("html", path.join(bundleDir, "report.html"), manifest, redactionReport),
      writeSingleReport("markdown", path.join(bundleDir, "report.md"), manifest, redactionReport),
      writeSingleReport("json", path.join(bundleDir, "summary.json"), manifest, redactionReport)
    ]);
  }

  const outputPath = options.out ?? defaultReportPath(bundleDir, options.format);
  return [await writeSingleReport(options.format, outputPath, manifest, redactionReport)];
}

async function writeSingleReport(
  format: Exclude<ReportFormat, "all">,
  outputPath: string,
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (format === "html") {
    await writeFile(outputPath, renderHtmlReport(manifest, redactionReport), "utf8");
  } else if (format === "markdown") {
    await writeFile(outputPath, renderMarkdownReport(manifest, redactionReport), "utf8");
  } else {
    await writeJson(outputPath, renderSummaryJson(manifest, redactionReport));
  }

  return outputPath;
}

function defaultReportPath(bundleDir: string, format: Exclude<ReportFormat, "all">): string {
  if (format === "html") {
    return path.join(bundleDir, "report.html");
  }
  if (format === "markdown") {
    return path.join(bundleDir, "report.md");
  }
  return path.join(bundleDir, "summary.json");
}
