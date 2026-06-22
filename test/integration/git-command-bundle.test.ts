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
import { regenerateReport } from "../../src/core/bundle.js";
import { createRedactionReport } from "../../src/core/redaction.js";

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

  it("keeps sensitive files excluded and unread in receipt-producing bundles", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "sensitive");
    await writeFile(path.join(repo, ".env"), "SECRET=do-not-read\n", "utf8");
    const result = await finishSession(repo);
    const envFile = result.manifest.git.after.changedFiles.find((file) => file.path === ".env");

    expect(envFile?.excluded).toBe(true);
    expect(envFile?.sha256).toBeUndefined();
    expect(result.manifest.receipt.final.git.excludedEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ".env" })])
    );
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
    expect(manifest.schemaVersion).toBe("tracepack.manifest.v0.2");
  });

  it("reports validated_final_state when validation runs after the final change", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "validated");
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => Number(a) + Number(b);\n",
      "utf8"
    );
    await runCommandInSession(repo, [npmCommand, "test"]);
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("validated_final_state");
    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.warnings.some((warning) => warning.id === "TP001")).toBe(false);
  });

  it("reports validation_stale when validation runs before the final change", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "missing-validation");
    await runCommandInSession(repo, [npmCommand, "test"]);
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => Number(a) + Number(b);\n",
      "utf8"
    );
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("validation_stale");
    expect(result.manifest.receipt.staleCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.warnings.some((warning) => warning.id === "TP001")).toBe(true);
    expect(result.manifest.commands[0]?.classification).toBe("validation");
  });

  it("reports no_validation_observed when no validation command is captured", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "no-validation");
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => a - b;\n",
      "utf8"
    );
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("no_validation_observed");
    expect(result.manifest.warnings.some((warning) => warning.id === "TP001")).toBe(true);
  });

  it("reports validation_failed when failed validation covers the final state", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "failed-validation");
    await writeFile(
      path.join(repo, "src", "calc.mjs"),
      "export const add = (a, b) => a - b;\n",
      "utf8"
    );
    await runCommandInSession(repo, [npmCommand, "test"]);
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("validation_failed");
    expect(result.manifest.receipt.failedCommandIds).toEqual(["cmd-001"]);
  });

  it("reports stale when a validation command modifies the worktree", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "mutating-validation");
    await writeFile(
      path.join(repo, "test", "calc.test.mjs"),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync('src/generated.mjs', 'export const generated = true;\\n');\n",
      "utf8"
    );
    await runCommandInSession(repo, [npmCommand, "test"]);
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("validation_stale");
    expect(result.manifest.receipt.staleCommandIds).toEqual(["cmd-001"]);
  });

  it("regenerates reports for v0.1 manifests with a legacy receipt note", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-v01-"));
    tempRoots.push(bundleDir);
    const manifest = v01Manifest();
    await writeFile(
      path.join(bundleDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(bundleDir, "redaction-report.json"),
      JSON.stringify(
        createRedactionReport({ runId: manifest.runId, outputs: [], excludedEvidence: [] }),
        null,
        2
      ),
      "utf8"
    );

    const reportPath = await regenerateReport(bundleDir);
    const html = await readFile(reportPath, "utf8");

    expect(html).toContain("Final-State Validation Receipt");
    expect(html).toContain("legacy v0.1 manifest");
  });
});

async function createFixtureRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "TracePack-test-"));
  tempRoots.push(repo);
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), ".tracepack/\nnode_modules/\n", "utf8");
  await writeFile(
    path.join(repo, "package.json"),
    JSON.stringify(
      {
        name: "TracePack-fixture",
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
  await exec("git", ["config", "user.email", "TracePack-test@example.invalid"], repo);
  await exec("git", ["config", "user.name", "TracePack Test"], repo);
  await exec("git", ["add", "."], repo);
  await exec("git", ["commit", "-m", "Initial fixture"], repo);
  return repo;
}

function v01Manifest() {
  const git = {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: false,
    statusSummary: "clean",
    changedFiles: [],
    changedFileCounts: {},
    diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
    excludedEvidence: []
  };

  return {
    schemaVersion: "tracepack.manifest.v0.1",
    TracePackVersion: "0.1.0",
    runId: "legacy",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    environment: {
      node: "v20.0.0",
      platform: "test",
      arch: "x64",
      cwd: { label: "repo", pathHash: "abc", representation: "basename" }
    },
    git: { before: git, after: git },
    commands: [],
    warnings: [],
    redaction: {
      applied: false,
      replacementCount: 0,
      excludedEvidenceCount: 0,
      outputTruncated: false,
      notes: []
    },
    reproduction: { commands: [], notes: [] },
    limitations: ["TracePack observes local evidence only."]
  };
}

async function exec(command: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true
  });
}
