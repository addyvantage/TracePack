import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  browserArgs,
  browserCandidates,
  COMPARISON_VIEWPORT,
  REPORT_VIEWPORT,
  SHOWCASE_OUTPUTS,
  SHOWCASE_SOURCES
} from "../../scripts/capture-showcase.mjs";
import {
  dimensionErrors,
  hygieneViolations,
  missingRequiredFiles,
  parseSipsDimensions,
  validateManifestShape
} from "../../scripts/verify-showcase-assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("showcase screenshot helpers", () => {
  it("prioritizes TRACEPACK_BROWSER_BIN before built-in browser candidates", () => {
    const candidates = browserCandidates(
      { TRACEPACK_BROWSER_BIN: "/tmp/synthetic-browser" },
      "/usr/bin"
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        source: "TRACEPACK_BROWSER_BIN",
        executable: "/tmp/synthetic-browser"
      })
    );
  });

  it("builds deterministic browser screenshot arguments", () => {
    const args = browserArgs({
      sourcePath: path.join(repoRoot, SHOWCASE_SOURCES.stale),
      outputPath: path.join(repoRoot, SHOWCASE_OUTPUTS.stale),
      viewport: REPORT_VIEWPORT,
      userDataDir: "/tmp/tracepack-profile"
    });

    expect(args).toContain("--headless=new");
    expect(args).toContain("--disable-gpu");
    expect(args).toContain("--hide-scrollbars");
    expect(args).toContain("--force-color-profile=srgb");
    expect(args).toContain("--allow-file-access-from-files");
    expect(args).toContain("--window-size=1280,720");
    expect(args).toContain(`--screenshot=${path.join(repoRoot, SHOWCASE_OUTPUTS.stale)}`);
    expect(args.at(-1)).toMatch(/^file:\/\//);
  });

  it("reports missing required files as verification failures", () => {
    expect(missingRequiredFiles(["a.html", "b.png"], ["a.html"])).toEqual([
      "missing required file: b.png"
    ]);
  });

  it("detects prohibited private paths and remote URLs in synthetic assets", () => {
    expect(hygieneViolations('<img src="https://cdn.example.test/x.png">', "sample.html")).toEqual(
      expect.arrayContaining(["sample.html: remote URL", "sample.html: CDN reference"])
    );
    expect(hygieneViolations("/Users/example/project", "sample.html")).toEqual([
      "sample.html: macOS user path"
    ]);
  });

  it("parses and validates screenshot dimensions without image dependencies", () => {
    const parsed = parseSipsDimensions("  pixelWidth: 1280\n  pixelHeight: 720\n");
    expect(parsed).toEqual(REPORT_VIEWPORT);
    expect(dimensionErrors(parsed, REPORT_VIEWPORT, "report-stale.png")).toEqual([]);
    expect(dimensionErrors(parsed, COMPARISON_VIEWPORT, "report-compare.png")).toEqual([
      "report-compare.png: expected 1600x900, got 1280x720"
    ]);
  });

  it("requires source and output records in the capture manifest", () => {
    expect(validateManifestShape({ schemaVersion: "tracepack.showcase-capture.v0.1" })).toEqual(
      expect.arrayContaining([
        "manifest missing stale report record",
        "manifest missing validated report record",
        `manifest comparison output must be ${SHOWCASE_OUTPUTS.comparison}`
      ])
    );
  });

  it("keeps README wired to real generated screenshots and sample reports", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toContain(
      "![Tracepack comparison: validation evidence incomplete beside final-state validation observed](.github/assets/tracepack/report-compare.png)"
    );
    expect(readme).toContain("[Stale validation sample](docs/assets/stale-report.html)");
    expect(readme).toContain(
      "[Final-state validation observed sample](docs/assets/validated-report.html)"
    );
  });

  it("preserves synthetic report evidence semantics and privacy hygiene", () => {
    const stale = readFileSync(path.join(repoRoot, SHOWCASE_SOURCES.stale), "utf8");
    const validated = readFileSync(path.join(repoRoot, SHOWCASE_SOURCES.validated), "utf8");

    expect(stale).toContain("Validation evidence incomplete");
    expect(stale).toContain('data-connection="not-observed">Not observed');
    expect(validated).toContain("Final-state validation observed");
    expect(validated).toContain('data-connection="observed">Observed');
    expect(hygieneViolations(stale, SHOWCASE_SOURCES.stale)).toEqual([]);
    expect(hygieneViolations(validated, SHOWCASE_SOURCES.validated)).toEqual([]);
  });
});
