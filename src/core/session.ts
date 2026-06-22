import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runAndCaptureCommand } from "./commands.js";
import { writeBundle, readJson, writeJson } from "./bundle.js";
import { captureGitEvidence } from "./git.js";
import { runHeuristics } from "./heuristics.js";
import {
  MANIFEST_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  TRACEPACK_VERSION,
  type CommandEvidence,
  type GitEvidence,
  type RedactionReport,
  type TracePackManifest
} from "./manifest.js";
import { createRedactionReport } from "./redaction.js";
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
  commands: CommandEvidence[];
};

type ActiveSessionPointer = {
  runId: string;
};

export async function startSession(cwd: string, label?: string): Promise<SessionState> {
  const existing = await loadActiveSession(cwd);
  if (existing) {
    throw new Error(`An active TracePack session already exists: ${existing.runId}`);
  }

  const initialGit = await captureGitEvidence(cwd);
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
    commands: []
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

export async function saveSession(session: SessionState): Promise<void> {
  const dir = runDirectory(session.cwd, session.runId);
  await mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, "session.json"), session);
  await writeJson(activeSessionPath(session.cwd), { runId: session.runId });
}

export async function runCommandInSession(
  cwd: string,
  argv: string[]
): Promise<{
  session: SessionState;
  command: CommandEvidence;
  finishedBundleDir?: string;
}> {
  const existing = await loadActiveSession(cwd);
  const session = existing ?? (await startOneCommandSession(cwd));
  const command = await runAndCaptureCommand(
    argv,
    cwd,
    `cmd-${String(session.commands.length + 1).padStart(3, "0")}`
  );
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
  manifest: TracePackManifest;
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
  const finalGit = await captureGitEvidence(cwd);
  const warnings = runHeuristics({ gitAfter: finalGit, commands: session.commands });
  const outputs = session.commands.flatMap((command) => [command.stdout, command.stderr]);
  const excludedEvidence = [...session.initialGit.excludedEvidence, ...finalGit.excludedEvidence];
  const redactionReport = createRedactionReport({
    runId: session.runId,
    outputs,
    excludedEvidence
  });
  const manifest: TracePackManifest = {
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
      before: session.initialGit,
      after: finalGit
    },
    commands: session.commands,
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
      "Filesystem timestamps, Git status, and command classification are deterministic but limited signals.",
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

function quoteCommand(argv: string[]): string {
  return argv.map((arg) => (/[ \t"'`]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
}

export function localBundleDir(cwd: string, runId: string): string {
  return runDirectory(cwd, runId);
}

export function localTracePackDir(cwd: string): string {
  return tracepackDir(cwd);
}
