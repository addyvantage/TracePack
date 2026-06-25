import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPTURE_SCHEMA_VERSION,
  COMPARISON_VIEWPORT,
  REPORT_VIEWPORT,
  SHOWCASE_OUTPUTS,
  SHOWCASE_SOURCES
} from "./capture-showcase.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const REQUIRED_FILES = [
  SHOWCASE_SOURCES.stale,
  SHOWCASE_SOURCES.validated,
  SHOWCASE_OUTPUTS.stale,
  SHOWCASE_OUTPUTS.validated,
  SHOWCASE_OUTPUTS.comparison,
  SHOWCASE_OUTPUTS.manifest
];

const HYGIENE_FILES = [
  SHOWCASE_SOURCES.stale,
  SHOWCASE_SOURCES.validated,
  "docs/assets/README.md",
  "scripts/generate-showcase.mjs",
  "scripts/capture-showcase.mjs"
];

const EXPECTED_DIMENSIONS = {
  [SHOWCASE_OUTPUTS.stale]: REPORT_VIEWPORT,
  [SHOWCASE_OUTPUTS.validated]: REPORT_VIEWPORT,
  [SHOWCASE_OUTPUTS.comparison]: COMPARISON_VIEWPORT
};

const PROHIBITED_PATTERNS = [
  { name: "remote URL", pattern: /https?:\/\//i },
  { name: "CDN reference", pattern: /\bcdn\./i },
  { name: "remote script", pattern: /<script\b/i },
  { name: "remote image", pattern: /<img\b[^>]*\bsrc=["']https?:\/\//i },
  { name: "remote font URL", pattern: /@font-face[\s\S]*url\(\s*["']?https?:\/\//i },
  { name: "macOS user path", pattern: /\/Users\// },
  { name: "home directory path", pattern: /\/home\// },
  { name: "OpenAI key-like value", pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/ },
  { name: "GitHub token-like value", pattern: /\bghp_[A-Za-z0-9_]{12,}\b/ },
  { name: "AWS access key-like value", pattern: /\bAKIA[0-9A-Z]{12,}\b/ },
  { name: "private key block", pattern: /BEGIN [A-Z ]*PRIVATE KEY/ },
  {
    name: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  }
];

export function hygieneViolations(text, filePath = "input") {
  return PROHIBITED_PATTERNS.flatMap((entry) =>
    entry.pattern.test(text) ? [`${filePath}: ${entry.name}`] : []
  );
}

export function missingRequiredFiles(requiredFiles, existingFiles) {
  const existing = new Set(existingFiles);
  return requiredFiles
    .filter((filePath) => !existing.has(filePath))
    .map((filePath) => `missing required file: ${filePath}`);
}

export function parseSipsDimensions(output) {
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error(`Could not parse image dimensions from sips output:\n${output}`);
  }
  return { width, height };
}

export function dimensionErrors(actual, expected, filePath) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return [
      `${filePath}: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`
    ];
  }
  return [];
}

export function validateManifestShape(manifest) {
  const errors = [];
  if (manifest.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    errors.push(`manifest schemaVersion must be ${CAPTURE_SCHEMA_VERSION}`);
  }

  for (const kind of ["stale", "validated"]) {
    const record = manifest.reports?.find((entry) => entry.kind === kind);
    if (!record) {
      errors.push(`manifest missing ${kind} report record`);
      continue;
    }
    if (record.source !== SHOWCASE_SOURCES[kind]) {
      errors.push(`manifest ${kind} source must be ${SHOWCASE_SOURCES[kind]}`);
    }
    if (record.output !== SHOWCASE_OUTPUTS[kind]) {
      errors.push(`manifest ${kind} output must be ${SHOWCASE_OUTPUTS[kind]}`);
    }
  }

  if (manifest.comparison?.output !== SHOWCASE_OUTPUTS.comparison) {
    errors.push(`manifest comparison output must be ${SHOWCASE_OUTPUTS.comparison}`);
  }
  return errors;
}

async function main() {
  const errors = [
    ...(await verifyRequiredFiles()),
    ...(await verifyStaticHygiene()),
    ...(await verifyDimensions()),
    ...(await verifyManifestProvenance()),
    ...(await verifyGitHygiene()),
    ...(await verifyPackageHygiene())
  ];

  if (errors.length > 0) {
    throw new Error(
      ["Showcase asset verification failed:", ...errors.map((error) => `- ${error}`)].join("\n")
    );
  }

  console.log("Showcase assets verified.");
}

async function verifyRequiredFiles() {
  const errors = [];
  for (const relative of REQUIRED_FILES) {
    try {
      await access(path.join(repoRoot, relative));
    } catch {
      errors.push(`missing required file: ${relative}`);
    }
  }
  return errors;
}

async function verifyStaticHygiene() {
  const errors = [];
  for (const relative of HYGIENE_FILES) {
    const text = await readTextIfPresent(path.join(repoRoot, relative));
    if (text === undefined) {
      errors.push(`missing hygiene scan file: ${relative}`);
      continue;
    }
    errors.push(...hygieneViolations(text, relative));
  }
  return errors;
}

async function verifyDimensions() {
  await ensureSipsAvailable();
  const errors = [];
  for (const [relative, expected] of Object.entries(EXPECTED_DIMENSIONS)) {
    const actual = await imageDimensions(path.join(repoRoot, relative));
    errors.push(...dimensionErrors(actual, expected, relative));
  }
  return errors;
}

async function verifyManifestProvenance() {
  const manifestPath = path.join(repoRoot, SHOWCASE_OUTPUTS.manifest);
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const errors = validateManifestShape(manifest);

  errors.push(...hygieneViolations(manifestText, SHOWCASE_OUTPUTS.manifest));

  for (const record of manifest.reports ?? []) {
    const sourceHash = await sha256File(path.join(repoRoot, record.source));
    const outputHash = await sha256File(path.join(repoRoot, record.output));
    if (sourceHash !== record.sourceSha256) {
      errors.push(`${record.source}: SHA-256 does not match manifest`);
    }
    if (outputHash !== record.outputSha256) {
      errors.push(`${record.output}: SHA-256 does not match manifest`);
    }
  }

  if (manifest.comparison) {
    const outputHash = await sha256File(path.join(repoRoot, manifest.comparison.output));
    if (outputHash !== manifest.comparison.outputSha256) {
      errors.push(`${manifest.comparison.output}: SHA-256 does not match manifest`);
    }
  }

  return errors;
}

async function verifyGitHygiene() {
  const status = await execFileText("git", ["status", "--porcelain", "--untracked-files=all"]);
  const tracked = new Set((await execFileText("git", ["ls-files"])).split(/\r?\n/).filter(Boolean));
  const statusPaths = new Set(
    status
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.slice(3))
  );
  const errors = [];

  for (const relative of [
    SHOWCASE_OUTPUTS.stale,
    SHOWCASE_OUTPUTS.validated,
    SHOWCASE_OUTPUTS.comparison,
    SHOWCASE_OUTPUTS.manifest
  ]) {
    if (!tracked.has(relative) && !statusPaths.has(relative)) {
      errors.push(`${relative}: screenshot asset is neither tracked nor a git status candidate`);
    }
  }

  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const staged = line[0] !== " " && line[0] !== "?";
    const relative = line.slice(3);
    if (
      staged &&
      /(^|\/)(\.work|\.tracepack|node_modules|dist|coverage|\.cache|tmp|temp)(\/|$)|\.tgz$/i.test(
        relative
      )
    ) {
      errors.push(`${relative}: temporary or package artifact is staged`);
    }
  }

  return errors;
}

async function verifyPackageHygiene() {
  const output = await execFileText(npmCommand(), ["pack", "--dry-run", "--json"]);
  let files = [];
  try {
    const parsed = JSON.parse(output);
    files = parsed[0]?.files?.map((entry) => entry.path) ?? [];
  } catch {
    files = output.split(/\r?\n/);
  }

  return files
    .filter(
      (filePath) =>
        filePath.startsWith(".github/assets/tracepack/") ||
        filePath === SHOWCASE_OUTPUTS.stale ||
        filePath === SHOWCASE_OUTPUTS.validated ||
        filePath === SHOWCASE_OUTPUTS.comparison
    )
    .map((filePath) => `${filePath}: README PNG asset must not be included in npm pack output`);
}

async function ensureSipsAvailable() {
  try {
    await execFileText("sips", ["--version"]);
  } catch {
    throw new Error(
      "sips is required to verify PNG dimensions on macOS. Install/use a macOS environment with sips available."
    );
  }
}

async function imageDimensions(filePath) {
  const output = await execFileText("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  return parseSipsDimensions(output);
}

async function readTextIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

function execFileText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20,
        timeout: 120_000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error([stdout, stderr, error.message].filter(Boolean).join("\n")));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
