import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateManifest,
  validateRedactionReport,
  type RedactionReport,
  type TracePackManifest
} from "./manifest.js";
import { renderHtmlReport } from "../report/renderHtml.js";
import { renderMarkdownReport } from "../report/renderMarkdown.js";
import { renderSummaryJson } from "../report/renderSummaryJson.js";

export type ReportFormat = "html" | "markdown" | "json" | "all";

export type RegenerateReportOptions = {
  format?: ReportFormat;
  out?: string;
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
  const manifest = validateManifest(await readJson(path.join(bundleDir, "manifest.json")));
  const redactionReport = validateRedactionReport(
    await readJson(path.join(bundleDir, "redaction-report.json"))
  );
  const format = options?.format ?? "html";
  const outputs = await writeReportOutputs(bundleDir, manifest, redactionReport, {
    format,
    out: options?.out
  });
  return options ? outputs : (outputs[0] ?? path.join(bundleDir, "report.html"));
}

export async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
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
