import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { captureGitEvidence } from "../../src/core/git.js";
import { runAndCaptureCommand } from "../../src/core/commands.js";
import { finishSession, runCommandInSession, startSession } from "../../src/core/session.js";
import { validateManifest } from "../../src/core/manifest.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("integration", () => {
  it("captures sensitive changed paths as excluded evidence", async () => {
    const repo = await createFixtureRepo();
    await writeFile(path.join(repo, ".env"), "SECRET=do-not-read\n", "utf8");
    const git = await captureGitEvidence(repo);
    const envFile = git.changedFiles.find((file) => file.path === ".env");
    expect(envFile?.excluded).toBe(true);
    expect(envFile?.sha256).toBeUndefined();
  });

  it("captures failed command evidence without throwing", async () => {
    const evidence = await runAndCaptureCommand(
      [process.execPath, "-e", "console.error('failed'); process.exit(7)"],
      process.cwd(),
      "cmd-001"
    );
    expect(evidence.exitCode).toBe(7);
    expect(evidence.evidence).toBe("command_failed");
    expect(evidence.stderr.text).toContain("failed");
  });

  it("creates a one-command bundle", async () => {
    const repo = await createFixtureRepo();
    const result = await runCommandInSession(repo, [process.execPath, "-e", "console.log('ok')"]);
    expect(result.finishedBundleDir).toBeTruthy();
    const manifest = validateManifest(
      JSON.parse(
        await readFile(path.join(result.finishedBundleDir as string, "manifest.json"), "utf8")
      )
    );
    expect(manifest.commands).toHaveLength(1);
  });

  it("warns when validation is not observed after the final code change", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "missing-validation");
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => Number(a) + Number(b);\n",
      "utf8"
    );
    await runCommandInSession(repo, [npmCommand, "test"]);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => {\n  return Number(a) + Number(b);\n};\n",
      "utf8"
    );
    const result = await finishSession(repo);
    expect(result.manifest.warnings.some((warning) => warning.id === "TP001")).toBe(true);
    expect(result.manifest.commands[0]?.classification).toBe("validation");
  });
});

async function createFixtureRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "tracepack-test-"));
  tempRoots.push(repo);
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), ".tracepack/\nnode_modules/\n", "utf8");
  await writeFile(
    path.join(repo, "package.json"),
    JSON.stringify(
      {
        name: "tracepack-fixture",
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
    "export const add = (a, b) => a + b;\n",
    "utf8"
  );
  await writeFile(
    path.join(repo, "test", "calc.test.mjs"),
    "import { add } from '../src/calc.mjs';\nif (add(2, 3) !== 5) throw new Error('bad add');\n",
    "utf8"
  );
  await exec("git", ["init"], repo);
  await exec("git", ["config", "user.email", "tracepack-test@example.invalid"], repo);
  await exec("git", ["config", "user.name", "Tracepack Test"], repo);
  await exec("git", ["add", "."], repo);
  await exec("git", ["commit", "-m", "Initial fixture"], repo);
  return repo;
}

async function exec(command: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true
  });
}
