import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { accessSync, constants as fsConstants } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CAPTURE_SCHEMA_VERSION = "tracepack.showcase-capture.v0.1";
export const CAPTURE_COMMAND_VERSION = "1";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const assetDir = path.join(repoRoot, ".github", "assets", "tracepack");

export const SHOWCASE_SOURCES = {
  stale: "docs/assets/stale-report.html",
  validated: "docs/assets/validated-report.html"
};

export const SHOWCASE_OUTPUTS = {
  stale: ".github/assets/tracepack/report-stale.png",
  validated: ".github/assets/tracepack/report-validated.png",
  comparison: ".github/assets/tracepack/report-compare.png",
  manifest: ".github/assets/tracepack/showcase-manifest.json"
};

export const REPORT_VIEWPORT = { width: 1280, height: 720 };
export const COMPARISON_VIEWPORT = { width: 1600, height: 900 };

const MAC_BROWSER_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

const PATH_BROWSER_COMMANDS = ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

export function browserCandidates(env = process.env, pathValue = process.env.PATH ?? "") {
  const candidates = [];

  if (env.TRACEPACK_BROWSER_BIN?.trim()) {
    candidates.push({
      source: "TRACEPACK_BROWSER_BIN",
      display: env.TRACEPACK_BROWSER_BIN.trim(),
      executable: env.TRACEPACK_BROWSER_BIN.trim()
    });
  }

  for (const browserPath of MAC_BROWSER_PATHS) {
    candidates.push({
      source: "macOS application",
      display: browserPath,
      executable: browserPath
    });
  }

  for (const command of PATH_BROWSER_COMMANDS) {
    const executable = findExecutableOnPath(command, pathValue);
    candidates.push({
      source: "PATH",
      display: command,
      executable: executable ?? command
    });
  }

  return candidates;
}

export function findExecutableOnPath(command, pathValue = process.env.PATH ?? "") {
  for (const segment of pathValue.split(path.delimiter)) {
    if (!segment) {
      continue;
    }
    const candidate = path.join(segment, command);
    try {
      fsAccessSync(candidate);
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return undefined;
}

export function browserArgs({ sourcePath, outputPath, viewport, userDataDir, headless = "new" }) {
  const headlessFlag = headless === "new" ? "--headless=new" : "--headless";
  return [
    headlessFlag,
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--allow-file-access-from-files",
    "--no-first-run",
    "--no-default-browser-check",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1000",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    `--screenshot=${outputPath}`,
    pathToFileURL(sourcePath).href
  ];
}

export function comparisonHtml(stalePngPath, validatedPngPath) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tracepack synthetic report comparison</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: #f4f1eb;
      color: #1f2933;
      font: 20px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      align-items: start;
      display: grid;
      gap: 28px;
      grid-template-columns: 1fr 1fr;
      height: 900px;
      padding: 32px;
      width: 1600px;
    }
    figure { margin: 0; }
    img {
      background: #fffdf8;
      border: 1px solid #d8d0c4;
      display: block;
      height: auto;
      width: 100%;
    }
    figcaption {
      color: #3b4652;
      font-weight: 750;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <main>
    <figure>
      <img alt="Tracepack stale synthetic report screenshot" src="${pathToFileURL(stalePngPath).href}">
      <figcaption>Validation evidence incomplete</figcaption>
    </figure>
    <figure>
      <img alt="Tracepack validated synthetic report screenshot" src="${pathToFileURL(validatedPngPath).href}">
      <figcaption>Final-state validation observed</figcaption>
    </figure>
  </main>
</body>
</html>
`;
}

export async function findBrowser(env = process.env, pathValue = process.env.PATH ?? "") {
  const checked = [];
  for (const candidate of browserCandidates(env, pathValue)) {
    checked.push(candidate.display);
    try {
      await access(candidate.executable, fsConstants.X_OK);
      return { executable: candidate.executable, checked };
    } catch {
      // Continue to the next candidate.
    }
  }
  return { checked };
}

async function main() {
  const browser = await findBrowser();
  if (!browser.executable) {
    throw new Error(
      [
        "No supported Chromium-compatible browser was found.",
        "Checked:",
        ...browser.checked.map((candidate) => `- ${candidate}`),
        "Set TRACEPACK_BROWSER_BIN to an installed browser executable and rerun npm run showcase:capture."
      ].join("\n")
    );
  }

  await runProcess(npmCommand(), ["run", "showcase:generate"], repoRoot);
  await mkdir(assetDir, { recursive: true });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tracepack-showcase-capture-"));
  const profileDir = path.join(tempRoot, "profile");
  const compositionPath = path.join(tempRoot, "comparison.html");

  try {
    await mkdir(profileDir, { recursive: true });

    const staleSource = path.join(repoRoot, SHOWCASE_SOURCES.stale);
    const validatedSource = path.join(repoRoot, SHOWCASE_SOURCES.validated);
    const staleOutput = path.join(repoRoot, SHOWCASE_OUTPUTS.stale);
    const validatedOutput = path.join(repoRoot, SHOWCASE_OUTPUTS.validated);
    const comparisonOutput = path.join(repoRoot, SHOWCASE_OUTPUTS.comparison);

    await capturePage(browser.executable, {
      sourcePath: staleSource,
      outputPath: staleOutput,
      viewport: REPORT_VIEWPORT,
      userDataDir: profileDir
    });
    await capturePage(browser.executable, {
      sourcePath: validatedSource,
      outputPath: validatedOutput,
      viewport: REPORT_VIEWPORT,
      userDataDir: profileDir
    });

    await writeFile(compositionPath, comparisonHtml(staleOutput, validatedOutput), "utf8");
    await capturePage(browser.executable, {
      sourcePath: compositionPath,
      outputPath: comparisonOutput,
      viewport: COMPARISON_VIEWPORT,
      userDataDir: profileDir
    });

    const manifest = await createManifest({
      browserExecutable: browser.executable,
      staleSource,
      validatedSource,
      staleOutput,
      validatedOutput,
      comparisonOutput
    });
    await writeFile(
      path.join(repoRoot, SHOWCASE_OUTPUTS.manifest),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    console.log(`Captured ${SHOWCASE_OUTPUTS.stale}`);
    console.log(`Captured ${SHOWCASE_OUTPUTS.validated}`);
    console.log(`Captured ${SHOWCASE_OUTPUTS.comparison}`);
    console.log(`Wrote ${SHOWCASE_OUTPUTS.manifest}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function capturePage(browserExecutable, options) {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await rm(options.outputPath, { force: true });
  const args = browserArgs(options);
  try {
    await runBrowserProcess(browserExecutable, args, repoRoot, options.outputPath);
  } catch (error) {
    if (!args.includes("--headless=new")) {
      throw error;
    }
    console.warn("Headless capture with --headless=new failed; retrying with --headless.");
    await runBrowserProcess(
      browserExecutable,
      browserArgs({ ...options, headless: "old" }),
      repoRoot,
      options.outputPath
    );
  }
}

async function createManifest(paths) {
  const browserVersion = await browserVersionText(paths.browserExecutable);
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureCommandVersion: CAPTURE_COMMAND_VERSION,
    browser: {
      productVersion: browserVersion
    },
    reports: [
      {
        kind: "stale",
        source: SHOWCASE_SOURCES.stale,
        output: SHOWCASE_OUTPUTS.stale,
        viewport: REPORT_VIEWPORT,
        sourceSha256: await sha256File(paths.staleSource),
        outputSha256: await sha256File(paths.staleOutput)
      },
      {
        kind: "validated",
        source: SHOWCASE_SOURCES.validated,
        output: SHOWCASE_OUTPUTS.validated,
        viewport: REPORT_VIEWPORT,
        sourceSha256: await sha256File(paths.validatedSource),
        outputSha256: await sha256File(paths.validatedOutput)
      }
    ],
    comparison: {
      output: SHOWCASE_OUTPUTS.comparison,
      inputs: [SHOWCASE_OUTPUTS.stale, SHOWCASE_OUTPUTS.validated],
      viewport: COMPARISON_VIEWPORT,
      outputSha256: await sha256File(paths.comparisonOutput)
    }
  };
}

async function browserVersionText(browserExecutable) {
  try {
    const result = await execFileAsync(browserExecutable, ["--version"], { cwd: repoRoot });
    return result.stdout.trim() || result.stderr.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function runProcess(command, args, cwd) {
  return execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    timeout: 120_000,
    windowsHide: true
  });
}

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            [`Command failed: ${command} ${args.join(" ")}`, stdout, stderr, error.message]
              .filter(Boolean)
              .join("\n")
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runBrowserProcess(command, args, cwd, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true
    });
    let settled = false;
    let outputReady = false;
    let hardKillTimer;
    const outputPoll = setInterval(async () => {
      if (outputReady) {
        return;
      }
      if (await isNonEmptyFile(outputPath)) {
        outputReady = true;
        signalChild(child, "SIGTERM");
        hardKillTimer = setTimeout(() => signalChild(child, "SIGKILL"), 2_000);
      }
    }, 100);
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(outputPoll);
      signalChild(child, "SIGTERM");
      hardKillTimer = setTimeout(() => signalChild(child, "SIGKILL"), 2_000);
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, 120_000);

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(outputPoll);
      clearTimeout(timeout);
      clearTimeout(hardKillTimer);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(outputPoll);
      clearTimeout(timeout);
      clearTimeout(hardKillTimer);
      if (code === 0 || outputReady) {
        resolve();
        return;
      }
      reject(
        new Error(`Command failed: ${command} ${args.join(" ")} (${signal ?? `exit ${code}`})`)
      );
    });
  });
}

async function isNonEmptyFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.size > 0;
  } catch {
    return false;
  }
}

function signalChild(child, signal) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to signaling the direct child.
    }
  }
  child.kill(signal);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function fsAccessSync(filePath) {
  accessSync(filePath, fsConstants.X_OK);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
