import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { runAndCaptureCommand } from "./commands.js";
import { writeBundle, readJson, writeJson } from "./bundle.js";
import { runGit } from "./git.js";
import { runHeuristics } from "./heuristics.js";
import {
  MANIFEST_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  TRACEPACK_VERSION,
  type CommandEvidence,
  type GitEvidence,
  type GitStateSnapshot,
  type RedactionReport,
  type TracePackManifestV04
} from "./manifest.js";
import { createFinalStateReceipt } from "./receipt.js";
import { createRedactionReport } from "./redaction.js";
import { captureGitStateSnapshot, createGitStateSnapshot } from "./state.js";
import {
  activeSessionPath,
  createRunId,
  runDirectory,
  safePathDescriptor,
  tracepackDir
} from "./paths.js";

export type SessionState = {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  runId: string;
  label?: string;
  startedAt: string;
  cwd: string;
  initialGit: GitEvidence;
  initialState: GitStateSnapshot;
  commands: CommandEvidence[];
  tracepackGitExclude?: TracepackGitExcludeResult;
};

export type TracepackGitExcludeResult =
  | {
      state: "added";
      excludePath: string;
    }
  | {
      state: "already_ignored";
    }
  | {
      state: "not_git";
    }
  | {
      state: "unavailable";
      reason: string;
    };

type ActiveSessionPointer = {
  runId: string;
};

export type ActiveSessionInspection =
  | {
      state: "none";
      pointerPath: string;
    }
  | {
      state: "active";
      pointerPath: string;
      runId: string;
      session: SessionState;
    }
  | {
      state: "stale";
      pointerPath: string;
      runId?: string;
      reason: string;
    };

export type RunCommandInSessionOptions = {
  timeoutSeconds?: number;
};

export async function startSession(cwd: string, label?: string): Promise<SessionState> {
  const existing = await loadActiveSession(cwd);
  if (existing) {
    throw new Error(`An active TracePack session already exists: ${existing.runId}`);
  }

  const tracepackGitExclude = await ensureTracepackGitExcluded(cwd);
  const initialState = await captureGitStateSnapshot(cwd);
  const initialGit = initialState.git;
  if (!initialGit.available) {
    throw new Error(
      "Git is required for TracePack sessions, but the git binary was not available."
    );
  }
  if (!initialGit.isRepository) {
    throw new Error("TracePack sessions must start inside a Git repository.");
  }

  const runId = createRunId();
  const session: SessionState = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    runId,
    label,
    startedAt: new Date().toISOString(),
    cwd,
    initialGit,
    initialState,
    commands: [],
    tracepackGitExclude
  };

  await saveSession(session);
  return session;
}

export async function loadActiveSession(cwd: string): Promise<SessionState | undefined> {
  try {
    const pointer = (await readJson(activeSessionPath(cwd))) as ActiveSessionPointer;
    return (await readJson(
      path.join(runDirectory(cwd, pointer.runId), "session.json")
    )) as SessionState;
  } catch {
    return undefined;
  }
}

export async function inspectActiveSession(cwd: string): Promise<ActiveSessionInspection> {
  const pointerPath = activeSessionPath(cwd);
  let pointerValue: unknown;

  try {
    pointerValue = JSON.parse(await readFile(pointerPath, "utf8")) as unknown;
  } catch (error) {
    if (isFileNotFound(error)) {
      return { state: "none", pointerPath };
    }
    return {
      state: "stale",
      pointerPath,
      reason: `Active-session pointer could not be read or parsed: ${errorMessage(error)}`
    };
  }

  if (!isActiveSessionPointer(pointerValue)) {
    return {
      state: "stale",
      pointerPath,
      reason: "Active-session pointer did not contain a valid runId."
    };
  }

  const sessionPath = path.join(runDirectory(cwd, pointerValue.runId), "session.json");
  let sessionValue: unknown;
  try {
    sessionValue = JSON.parse(await readFile(sessionPath, "utf8")) as unknown;
  } catch (error) {
    return {
      state: "stale",
      pointerPath,
      runId: pointerValue.runId,
      reason: isFileNotFound(error)
        ? `Session file was not found: ${path.relative(cwd, sessionPath)}`
        : `Session file could not be read or parsed: ${errorMessage(error)}`
    };
  }

  if (!isSessionState(sessionValue)) {
    return {
      state: "stale",
      pointerPath,
      runId: pointerValue.runId,
      reason: "Session file did not contain a valid TracePack session."
    };
  }

  if (sessionValue.runId !== pointerValue.runId) {
    return {
      state: "stale",
      pointerPath,
      runId: pointerValue.runId,
      reason: `Active-session pointer runId did not match session runId ${sessionValue.runId}.`
    };
  }

  return { state: "active", pointerPath, runId: pointerValue.runId, session: sessionValue };
}

export async function cleanActiveSessionPointer(cwd: string): Promise<ActiveSessionInspection> {
  const inspection = await inspectActiveSession(cwd);
  if (inspection.state !== "none") {
    await rm(inspection.pointerPath, { force: true });
  }
  return inspection;
}

export async function saveSession(session: SessionState): Promise<void> {
  const dir = runDirectory(session.cwd, session.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, "session.json"), session);
  await writeJson(activeSessionPath(session.cwd), { runId: session.runId });
}

export async function ensureTracepackGitExcluded(cwd: string): Promise<TracepackGitExcludeResult> {
  const inside = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], true);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { state: "not_git" };
  }

  const ignored = await runGit(cwd, ["check-ignore", "-q", ".tracepack/"], true);
  if (ignored.ok) {
    return { state: "already_ignored" };
  }
  if (ignored.exitCode !== 1) {
    return { state: "unavailable", reason: "git check-ignore failed." };
  }

  const exclude = await runGit(cwd, ["rev-parse", "--git-path", "info/exclude"], true);
  const rawExcludePath = exclude.stdout.trim();
  if (!exclude.ok || !rawExcludePath) {
    return { state: "unavailable", reason: "Git exclude path could not be resolved." };
  }

  const excludePath = path.isAbsolute(rawExcludePath)
    ? rawExcludePath
    : path.resolve(cwd, rawExcludePath);
  await mkdir(path.dirname(excludePath), { recursive: true });

  let existing = "";
  try {
    existing = await readFile(excludePath, "utf8");
  } catch (error) {
    if (!isFileNotFound(error)) {
      return {
        state: "unavailable",
        reason: `Git exclude file could not be read: ${errorMessage(error)}`
      };
    }
  }

  if (hasTracepackExclude(existing)) {
    return { state: "already_ignored" };
  }

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(
    excludePath,
    `${prefix}# TracePack local evidence bundles\n.tracepack/\n`,
    "utf8"
  );
  return { state: "added", excludePath };
}

export async function runCommandInSession(
  cwd: string,
  argv: string[],
  options: RunCommandInSessionOptions = {}
): Promise<{
  session: SessionState;
  command: CommandEvidence;
  finishedBundleDir?: string;
}> {
  const existing = await loadActiveSession(cwd);
  const session = existing ?? (await startOneCommandSession(cwd));
  const gitBefore = await captureGitStateSnapshot(cwd);
  const command = await runAndCaptureCommand(
    argv,
    cwd,
    `cmd-${String(session.commands.length + 1).padStart(3, "0")}`,
    { timeoutSeconds: options.timeoutSeconds }
  );
  command.gitBefore = gitBefore;
  command.gitAfter = await captureGitStateSnapshot(cwd);
  session.commands.push(command);
  await saveSession(session);

  if (!existing) {
    const finished = await finishSession(cwd, session.label);
    return { session: finished.session, command, finishedBundleDir: finished.bundleDir };
  }

  return { session, command };
}

export async function finishSession(
  cwd: string,
  label?: string
): Promise<{
  session: SessionState;
  manifest: TracePackManifestV04;
  redactionReport: RedactionReport;
  bundleDir: string;
}> {
  const session = await loadActiveSession(cwd);
  if (!session) {
    throw new Error("No active TracePack session was found.");
  }

  if (label) {
    session.label = label;
  }

  const finishedAt = new Date();
  const finalState = await captureGitStateSnapshot(cwd);
  const finalGit = finalState.git;
  const outputs = session.commands.flatMap((command) => [command.stdout, command.stderr]);
  const baselineState = session.initialState ?? createGitStateSnapshot(session.initialGit);
  const receipt = createFinalStateReceipt({
    baseline: baselineState,
    final: finalState,
    commands: session.commands
  });
  const warnings = runHeuristics({ gitAfter: finalGit, commands: session.commands, receipt });
  const excludedEvidence = [
    ...baselineState.git.excludedEvidence,
    ...finalGit.excludedEvidence,
    ...session.commands.flatMap((command) => [
      ...(command.gitBefore?.git.excludedEvidence ?? []),
      ...(command.gitAfter?.git.excludedEvidence ?? [])
    ])
  ];
  const redactionReport = createRedactionReport({
    runId: session.runId,
    outputs,
    excludedEvidence
  });
  const manifest: TracePackManifestV04 = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    TracePackVersion: TRACEPACK_VERSION,
    runId: session.runId,
    label: session.label,
    startedAt: session.startedAt,
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - Date.parse(session.startedAt)),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      shell: process.env.SHELL ?? process.env.ComSpec,
      cwd: safePathDescriptor(cwd)
    },
    git: {
      before: baselineState.git,
      after: finalGit
    },
    commands: session.commands,
    receipt,
    warnings,
    redaction: redactionReport.summary,
    reproduction: {
      commands: session.commands.map((command) => quoteCommand(command.argv)),
      notes: [
        "Run these commands only after reviewing them yourself.",
        "TracePack records observed local evidence and does not replace CI or human review.",
        "The bundle intentionally omits raw repository contents and full raw diffs by default."
      ]
    },
    limitations: [
      "TracePack observes local Git state and commands executed through the TracePack CLI only.",
      "TracePack does not prove code correctness, security, merge readiness, or policy compliance.",
      "State fingerprints, Git status, content-observation completeness, and command classification are deterministic but limited signals.",
      "Ignored files are outside TracePack's default Git-observed repository-state evidence.",
      "Redaction is best effort and cannot guarantee every sensitive value is removed.",
      "No source code, prompts, transcripts, environment variable values, credentials, or browser sessions are uploaded by TracePack."
    ]
  };

  const bundleDir = runDirectory(cwd, session.runId);
  await writeBundle(bundleDir, manifest, redactionReport);
  await rm(activeSessionPath(cwd), { force: true });
  await saveSessionWithoutActivePointer(session);
  return { session, manifest, redactionReport, bundleDir };
}

async function startOneCommandSession(cwd: string): Promise<SessionState> {
  const session = await startSession(cwd, "one-command");
  return session;
}

async function saveSessionWithoutActivePointer(session: SessionState): Promise<void> {
  await mkdir(runDirectory(session.cwd, session.runId), { recursive: true });
  await writeJson(path.join(runDirectory(session.cwd, session.runId), "session.json"), session);
}

export function quoteCommand(argv: string[]): string {
  return argv.map((arg) => (/[ \t"'`]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
}

export function localBundleDir(cwd: string, runId: string): string {
  return runDirectory(cwd, runId);
}

export function localTracePackDir(cwd: string): string {
  return tracepackDir(cwd);
}

function isActiveSessionPointer(value: unknown): value is ActiveSessionPointer {
  return (
    !!value &&
    typeof value === "object" &&
    "runId" in value &&
    typeof value.runId === "string" &&
    value.runId.length > 0
  );
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SessionState>;
  return (
    candidate.schemaVersion === SESSION_SCHEMA_VERSION &&
    typeof candidate.runId === "string" &&
    typeof candidate.startedAt === "string" &&
    typeof candidate.cwd === "string" &&
    !!candidate.initialGit &&
    typeof candidate.initialGit === "object" &&
    !!candidate.initialState &&
    typeof candidate.initialState === "object" &&
    Array.isArray(candidate.commands)
  );
}

function hasTracepackExclude(value: string): boolean {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .some((line) => line === ".tracepack/" || line === ".tracepack");
}

function isFileNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
