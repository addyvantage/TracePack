import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { checkTracepackIgnoredByGit } from "../../src/commands/doctor.js";
import { formatStatusInspection } from "../../src/commands/status.js";
import { captureGitEvidence, captureIgnoredFilesObservation } from "../../src/core/git.js";
import { runAndCaptureCommand } from "../../src/core/commands.js";
import {
  cleanActiveSessionPointer,
  finishSession,
  inspectActiveSession,
  runCommandInSession,
  startSession
} from "../../src/core/session.js";
import { validateManifest } from "../../src/core/manifest.js";
import { regenerateReport } from "../../src/core/bundle.js";
import { createRedactionReport } from "../../src/core/redaction.js";
import { activeSessionPath, runDirectory } from "../../src/core/paths.js";

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

  it("hides sensitive ignored path labels while preserving ignored-path evidence", async () => {
    const repo = await createFixtureRepo();
    await writeFile(path.join(repo, ".gitignore"), ".tracepack/\nnode_modules/\n.env\n", "utf8");
    await exec("git", ["add", ".gitignore"], repo);
    await exec("git", ["commit", "-m", "Ignore env files"], repo);
    await writeFile(path.join(repo, ".env"), "SECRET=do-not-read\n", "utf8");

    const ignored = await captureIgnoredFilesObservation(repo);
    expect(ignored.mode).toBe("partial");
    expect(ignored.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: undefined,
          pathHash: expect.any(String),
          reason: expect.stringContaining("sensitive path")
        })
      ])
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

  it("times out commands without losing captured output", async () => {
    const evidence = await runAndCaptureCommand(
      [
        process.execPath,
        "-e",
        "console.log('stdout-before-timeout'); console.error('stderr-before-timeout'); setTimeout(() => {}, 5000);"
      ],
      process.cwd(),
      "cmd-timeout",
      { timeoutSeconds: 1 }
    );

    expect(evidence.exitCode).not.toBe(0);
    expect(evidence.error).toContain("Command timed out after 1 seconds.");
    expect(evidence.evidence).toBe("command_failed");
    expect(evidence.evidence).not.toBe("successful_validation");
    expect(evidence.stdout.text).toContain("stdout-before-timeout");
    expect(evidence.stderr.text).toContain("stderr-before-timeout");
    expect(evidence.durationMs).toBeLessThan(4_000);
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
    expect(manifest.schemaVersion).toBe("tracepack.manifest.v0.4");
  });

  it("reports no active session through session inspection and status output", async () => {
    const repo = await createFixtureRepo();
    const inspection = await inspectActiveSession(repo);

    expect(inspection.state).toBe("none");
    expect(formatStatusInspection(inspection, repo)).toContain("No active TracePack session.");
    expect(formatStatusInspection(inspection, repo)).toContain("Next: run `tracepack start`");
  });

  it("reports an active session with captured commands in status output", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "status-demo");
    await runCommandInSession(repo, [process.execPath, "-e", "console.log('status-ok')"]);

    const inspection = await inspectActiveSession(repo);
    expect(inspection.state).toBe("active");
    if (inspection.state !== "active") {
      throw new Error("Expected active session");
    }
    expect(inspection.session.commands).toHaveLength(1);

    const output = formatStatusInspection(inspection, repo);
    expect(output).toContain("TracePack active session");
    expect(output).toContain("Label: status-demo");
    expect(output).toContain("Commands captured: 1");
    expect(output).toContain("cmd-001");
    expect(output).toContain("classification: unknown");
    expect(output).toContain("evidence: observed");
    expect(output).toContain("exit / signal: exit 0");
    expect(output).toContain("Next: run `tracepack run -- <command>` or `tracepack finish`");
  });

  it("explains a stale active-session pointer", async () => {
    const repo = await createFixtureRepo();
    await mkdir(path.dirname(activeSessionPath(repo)), { recursive: true });
    await writeFile(activeSessionPath(repo), JSON.stringify({ runId: "missing-run" }), "utf8");

    const inspection = await inspectActiveSession(repo);
    expect(inspection.state).toBe("stale");
    expect(formatStatusInspection(inspection, repo)).toContain(
      "TracePack active-session pointer is stale or unreadable."
    );
    expect(formatStatusInspection(inspection, repo)).toContain(
      "Next: run `tracepack clean --force`"
    );
  });

  it("cleaning with no active session is a no-op", async () => {
    const repo = await createFixtureRepo();
    const cleaned = await cleanActiveSessionPointer(repo);

    expect(cleaned.state).toBe("none");
    await expect(readFile(activeSessionPath(repo), "utf8")).rejects.toBeTruthy();
  });

  it("cleaning removes only the active-session pointer and keeps session data", async () => {
    const repo = await createFixtureRepo();
    const session = await startSession(repo, "clean-demo");
    const sessionPath = path.join(runDirectory(repo, session.runId), "session.json");

    const cleaned = await cleanActiveSessionPointer(repo);

    expect(cleaned.state).toBe("active");
    await expect(readFile(activeSessionPath(repo), "utf8")).rejects.toBeTruthy();
    await expect(readFile(sessionPath, "utf8")).resolves.toContain(session.runId);
  });

  it("cleaning removes a stale active-session pointer", async () => {
    const repo = await createFixtureRepo();
    await mkdir(path.dirname(activeSessionPath(repo)), { recursive: true });
    await writeFile(activeSessionPath(repo), JSON.stringify({ runId: "missing-run" }), "utf8");

    const cleaned = await cleanActiveSessionPointer(repo);

    expect(cleaned.state).toBe("stale");
    await expect(readFile(activeSessionPath(repo), "utf8")).rejects.toBeTruthy();
  });

  it("checks whether .tracepack is ignored by Git", async () => {
    const ignoredRepo = await createFixtureRepo();
    await expect(checkTracepackIgnoredByGit(ignoredRepo)).resolves.toEqual({ state: "yes" });

    const unignoredRepo = await createFixtureRepo({ gitignore: "node_modules/\n" });
    await expect(checkTracepackIgnoredByGit(unignoredRepo)).resolves.toEqual({ state: "no" });
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
    expect(result.manifest.receipt.observationConfidence).toBe("complete");
    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.warnings.some((warning) => warning.id === "TP001")).toBe(false);
  });

  it("does not fully validate matching fingerprints when a tracked changed file is too large to hash", async () => {
    const repo = await createFixtureRepo();
    const largePath = path.join(repo, "src", "large.txt");
    await writeFile(largePath, `${"0".repeat(1_100_000)}\n`, "utf8");
    await exec("git", ["add", "src/large.txt"], repo);
    await exec("git", ["commit", "-m", "Add large tracked file"], repo);

    await startSession(repo, "large-partial");
    await writeFile(largePath, `${"1".repeat(1_100_000)}\n`, "utf8");
    await runCommandInSession(repo, [npmCommand, "test"]);
    await writeFile(largePath, `${"2".repeat(1_100_000)}\n`, "utf8");
    const result = await finishSession(repo);

    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.verdict).toBe("inconclusive");
    expect(result.manifest.receipt.observationConfidence).toBe("partial");
    expect(result.manifest.receipt.final.unobservedChangedFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "src/large.txt" })])
    );
  });

  it("does not fully validate when matching state contains a sensitive excluded changed file", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "sensitive-matching");
    await writeFile(path.join(repo, ".env"), "SECRET=do-not-read\n", "utf8");
    await runCommandInSession(repo, [npmCommand, "test"]);
    const result = await finishSession(repo);

    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.verdict).toBe("inconclusive");
    expect(result.manifest.receipt.observationConfidence).toBe("partial");
    expect(result.manifest.receipt.final.excludedChangedFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ".env" })])
    );
  });

  it("does not fully validate when validation reads an ignored file that later changes", async () => {
    const repo = await createFixtureRepo();
    await mkdir(path.join(repo, "node_modules"), { recursive: true });
    await writeFile(path.join(repo, "node_modules", "runtime-config.txt"), "ok\n", "utf8");
    await writeFile(
      path.join(repo, "test", "calc.test.mjs"),
      "import { readFileSync } from 'node:fs';\nimport { add } from '../src/calc.mjs';\nif (readFileSync('node_modules/runtime-config.txt', 'utf8').trim() !== 'ok') throw new Error('bad config');\nif (add(2, 3) !== 5) throw new Error('bad add');\n",
      "utf8"
    );
    await startSession(repo, "ignored-blind-spot");
    await runCommandInSession(repo, [npmCommand, "test"]);
    await writeFile(path.join(repo, "node_modules", "runtime-config.txt"), "changed\n", "utf8");
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("inconclusive");
    expect(result.manifest.receipt.observationConfidence).toBe("partial");
    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.limitedCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.confidenceReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("ignored path")])
    );
    expect(result.manifest.receipt.final.ignoredFiles?.mode).toBe("partial");
    expect(result.manifest.receipt.final.ignoredFiles?.samples).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "node_modules/" })])
    );
  });

  it("does not fully validate when ignored validation input is removed before finish", async () => {
    const repo = await createFixtureRepo();
    await mkdir(path.join(repo, "node_modules"), { recursive: true });
    await writeFile(path.join(repo, "node_modules", "runtime-config.txt"), "ok\n", "utf8");
    await writeFile(
      path.join(repo, "test", "calc.test.mjs"),
      "import { readFileSync } from 'node:fs';\nimport { add } from '../src/calc.mjs';\nif (readFileSync('node_modules/runtime-config.txt', 'utf8').trim() !== 'ok') throw new Error('bad config');\nif (add(2, 3) !== 5) throw new Error('bad add');\n",
      "utf8"
    );
    await startSession(repo, "ignored-prestate-only");
    await runCommandInSession(repo, [npmCommand, "test"]);
    await rm(path.join(repo, "node_modules"), { recursive: true, force: true });
    const result = await finishSession(repo);

    expect(result.manifest.receipt.final.ignoredFiles?.mode).toBe("not_present");
    expect(result.manifest.receipt.verdict).toBe("inconclusive");
    expect(result.manifest.receipt.observationConfidence).toBe("partial");
    expect(result.manifest.receipt.coveringCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.limitedCommandIds).toEqual(["cmd-001"]);
    expect(result.manifest.receipt.evidenceRefs).toEqual(
      expect.arrayContaining(["commands:cmd-001.gitBefore.ignoredFiles"])
    );
    expect(result.manifest.receipt.observationLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "command_prestate_ignored_paths_unobserved",
          evidenceRef: "commands:cmd-001.gitBefore.ignoredFiles"
        })
      ])
    );

    const html = await readFile(path.join(result.bundleDir, "report.html"), "utf8");
    expect(html).toContain("commands:cmd-001.gitBefore.ignoredFiles");
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

  it("reports validation_stale when an untracked safe file changes after validation", async () => {
    const repo = await createFixtureRepo();
    await startSession(repo, "untracked-stale");
    await runCommandInSession(repo, [npmCommand, "test"]);
    await writeFile(path.join(repo, "src", "new-feature.mjs"), "export const value = 1;\n", "utf8");
    const result = await finishSession(repo);

    expect(result.manifest.receipt.verdict).toBe("validation_stale");
    expect(result.manifest.receipt.staleCommandIds).toEqual(["cmd-001"]);
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

  it("regenerates reports for v0.2 manifests with a legacy confidence note", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-v02-"));
    tempRoots.push(bundleDir);
    const manifest = v02Manifest();
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
    expect(html).toContain("Legacy v0.2 receipt did not capture observation-confidence details.");
  });

  it("regenerates reports for v0.3 manifests without upgrading their stored certainty", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-v03-"));
    tempRoots.push(bundleDir);
    const manifest = v03Manifest();
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
    expect(html).toContain("validated final state");
    expect(html).toContain("Ignored-Path Observation");
  });

  it("regenerates markdown and json report exports", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "TracePack-reports-"));
    tempRoots.push(bundleDir);
    const manifest = v02Manifest();
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

    const outputs = await regenerateReport(bundleDir, { format: "all" });
    expect(outputs.map((output) => path.basename(output)).sort()).toEqual([
      "report.html",
      "report.md",
      "summary.json"
    ]);

    const markdown = await readFile(path.join(bundleDir, "report.md"), "utf8");
    const summary = JSON.parse(await readFile(path.join(bundleDir, "summary.json"), "utf8")) as {
      schemaVersion?: string;
      receipt?: { verdict?: string };
    };

    expect(markdown).toContain("Final-State Validation Receipt");
    expect(markdown).toContain("TracePack does not prove correctness");
    expect(summary.schemaVersion).toBe("tracepack.summary.v0.1");
    expect(summary.receipt?.verdict).toBe("validated_final_state");

    const customPath = path.join(bundleDir, "custom-report.md");
    await expect(
      regenerateReport(bundleDir, { format: "markdown", out: customPath })
    ).resolves.toEqual([customPath]);
    await expect(readFile(customPath, "utf8")).resolves.toContain("# TracePack Evidence Report");
  });
});

async function createFixtureRepo(options: { gitignore?: string } = {}): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "TracePack-test-"));
  tempRoots.push(repo);
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(
    path.join(repo, ".gitignore"),
    options.gitignore ?? ".tracepack/\nnode_modules/\n",
    "utf8"
  );
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

function v02Manifest() {
  const manifest = v01Manifest();
  const snapshot = {
    capturedAt: "2026-01-01T00:00:00.000Z",
    git: manifest.git.after,
    fingerprint: {
      algorithm: "tracepack.state-fingerprint.v1",
      value: "abc",
      short: "abc",
      canonicalFields: []
    },
    limitations: []
  };

  return {
    ...manifest,
    schemaVersion: "tracepack.manifest.v0.2",
    receipt: {
      schemaVersion: "tracepack.receipt.v0.1",
      baseline: snapshot,
      final: snapshot,
      verdict: "validated_final_state",
      coveringCommandIds: ["cmd-001"],
      staleCommandIds: [],
      failedCommandIds: [],
      evidenceRefs: ["receipt.final.fingerprint"],
      explanation: "Legacy v0.2 receipt.",
      limitations: []
    }
  };
}

function v03Manifest() {
  const manifest = v02Manifest();
  return {
    ...manifest,
    schemaVersion: "tracepack.manifest.v0.3",
    receipt: {
      ...manifest.receipt,
      schemaVersion: "tracepack.receipt.v0.2",
      observationConfidence: "complete",
      confidenceReasons: [
        "Git ignored paths are outside TracePack's default repository-state evidence and are not listed or hashed."
      ],
      limitedCommandIds: []
    }
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
