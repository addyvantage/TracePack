import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const demoDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(demoDir, "../..");
const cliPath = path.join(repoRoot, "dist", "cli.js");
const workDir = path.join(demoDir, ".work");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const missing = await runMissingValidationDemo();
const corrected = await runCorrectedDemo();

console.log("Tracepack demo completed.");
console.log(`Missing-validation report: ${path.join(missing.bundleDir, "report.html")}`);
console.log(`Corrected report: ${path.join(corrected.bundleDir, "report.html")}`);

async function runMissingValidationDemo() {
  const repo = await setupDemoRepo("missing-validation");
  await execNode(["start", "--label", "missing-post-change-validation"], repo);
  await writeFile(
    path.join(repo, "src", "calc.mjs"),
    `export function add(a, b) {\n  return Number(a) + Number(b);\n}\n`,
    "utf8"
  );
  await execNode(["run", "--", npmCommand, "test"], repo);
  await sleep(1100);
  await writeFile(
    path.join(repo, "src", "calc.mjs"),
    `export function add(a, b) {\n  const left = Number(a);\n  const right = Number(b);\n  return left + right;\n}\n`,
    "utf8"
  );
  const finishOutput = await execNode(["finish"], repo);
  const bundleDir = latestBundleDirFromOutput(finishOutput.stdout);
  const manifest = await readManifest(bundleDir);
  if (!manifest.warnings.some((warning) => warning.id === "TP001")) {
    throw new Error("Expected missing-validation demo to trigger TP001.");
  }
  return { repo, bundleDir };
}

async function runCorrectedDemo() {
  const repo = await setupDemoRepo("corrected");
  await execNode(["start", "--label", "corrected-post-change-validation"], repo);
  await writeFile(
    path.join(repo, "src", "calc.mjs"),
    `export function add(a, b) {\n  const left = Number(a);\n  const right = Number(b);\n  return left + right;\n}\n`,
    "utf8"
  );
  await execNode(["run", "--", npmCommand, "test"], repo);
  const finishOutput = await execNode(["finish"], repo);
  const bundleDir = latestBundleDirFromOutput(finishOutput.stdout);
  const manifest = await readManifest(bundleDir);
  if (manifest.warnings.some((warning) => warning.id === "TP001")) {
    throw new Error("Expected corrected demo not to trigger TP001.");
  }
  return { repo, bundleDir };
}

async function setupDemoRepo(name) {
  const repo = path.join(workDir, name);
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), ".tracepack/\nnode_modules/\n", "utf8");
  await writeFile(
    path.join(repo, "package.json"),
    JSON.stringify(
      {
        name: `tracepack-demo-${name}`,
        private: true,
        type: "module",
        scripts: {
          test: "node test/calc.test.mjs"
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await writeFile(
    path.join(repo, "src", "calc.mjs"),
    "export function add(a, b) {\n  return a + b;\n}\n",
    "utf8"
  );
  await writeFile(
    path.join(repo, "test", "calc.test.mjs"),
    `import { add } from "../src/calc.mjs";\n\nif (add(2, 3) !== 5) {\n  throw new Error("add should return the sum");\n}\n`,
    "utf8"
  );

  await exec("git", ["init"], repo);
  await exec("git", ["config", "user.email", "tracepack-demo@example.invalid"], repo);
  await exec("git", ["config", "user.name", "Tracepack Demo"], repo);
  await exec("git", ["add", "."], repo);
  await exec("git", ["commit", "-m", "Initial demo project"], repo);
  return repo;
}

async function execNode(args, cwd) {
  return exec(process.execPath, [cliPath, ...args], cwd);
}

async function exec(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      windowsHide: true
    });
  } catch (error) {
    const failure = error;
    const stdout = failure.stdout ?? "";
    const stderr = failure.stderr ?? "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`);
  }
}

function latestBundleDirFromOutput(stdout) {
  const match = stdout.match(/Bundle written:\s*(.+)$/m);
  if (!match?.[1]) {
    throw new Error(`Could not locate bundle directory in output:\n${stdout}`);
  }
  return match[1].trim();
}

async function readManifest(bundleDir) {
  return JSON.parse(await readFile(path.join(bundleDir, "manifest.json"), "utf8"));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
