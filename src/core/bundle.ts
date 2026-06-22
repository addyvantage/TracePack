import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateManifest,
  validateRedactionReport,
  type RedactionReport,
  type TracepackManifest
} from "./manifest.js";
import { renderHtmlReport } from "../report/renderHtml.js";

export async function writeBundle(
  bundleDir: string,
  manifest: TracepackManifest,
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

export async function regenerateReport(bundleDir: string): Promise<string> {
  const manifest = validateManifest(await readJson(path.join(bundleDir, "manifest.json")));
  const redactionReport = validateRedactionReport(
    await readJson(path.join(bundleDir, "redaction-report.json"))
  );
  const outputPath = path.join(bundleDir, "report.html");
  await writeFile(outputPath, renderHtmlReport(manifest, redactionReport), "utf8");
  return outputPath;
}

export async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
