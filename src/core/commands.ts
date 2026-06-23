import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { classifyCommand, evidenceForCommand } from "./classify.js";
import type { CommandEvidence } from "./manifest.js";
import { combineRedactionSummaries, summarizeOutput } from "./redaction.js";

const STORED_OUTPUT_BYTES = 48_000;
const COMMAND_TIMEOUT_GRACE_MS = 1_000;

export const DEFAULT_COMMAND_TIMEOUT_SECONDS = 300;

type CaptureState = {
  chunks: Buffer[];
  storedBytes: number;
  totalBytes: number;
};

export type RunAndCaptureOptions = {
  timeoutSeconds?: number;
};

export async function runAndCaptureCommand(
  argv: string[],
  cwd: string,
  id: string,
  options: RunAndCaptureOptions = {}
): Promise<CommandEvidence> {
  if (argv.length === 0) {
    throw new Error("tracepack run requires a command after --.");
  }

  const timeoutSeconds = validateTimeoutSeconds(
    options.timeoutSeconds ?? DEFAULT_COMMAND_TIMEOUT_SECONDS
  );
  const started = new Date();
  const stdout = createCaptureState();
  const stderr = createCaptureState();
  const command = argv[0] as string;
  const needsWindowsCommandShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  const spawnedCommand = needsWindowsCommandShell ? (process.env.ComSpec ?? "cmd.exe") : command;
  const spawnedArgs = needsWindowsCommandShell
    ? ["/d", "/c", command, ...argv.slice(1)]
    : argv.slice(1);

  const result = await new Promise<{
    exitCode: number | null;
    signal: string | null;
    error?: string;
  }>((resolve) => {
    let settled = false;
    let timedOut = false;
    const timers: { timeout?: NodeJS.Timeout; forceKill?: NodeJS.Timeout } = {};

    const finish = (result: { exitCode: number | null; signal: string | null; error?: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timers.timeout) {
        clearTimeout(timers.timeout);
      }
      if (timers.forceKill) {
        clearTimeout(timers.forceKill);
      }
      resolve(result);
    };

    const child = spawn(spawnedCommand, spawnedArgs, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true
    });

    timers.timeout = setTimeout(() => {
      timedOut = true;
      killChild(child, "SIGTERM");
      timers.forceKill = setTimeout(() => {
        if (!settled) {
          killChild(child, "SIGKILL");
        }
      }, COMMAND_TIMEOUT_GRACE_MS);
      timers.forceKill.unref();
    }, timeoutSeconds * 1000);
    timers.timeout.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      appendCapture(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      appendCapture(stderr, chunk);
    });

    child.on("error", (error) => {
      finish({ exitCode: null, signal: null, error: error.message });
    });

    child.on("close", (exitCode, signal) => {
      finish({
        exitCode,
        signal,
        ...(timedOut ? { error: `Command timed out after ${timeoutSeconds} seconds.` } : {})
      });
    });
  });

  const ended = new Date();
  const stdoutSummary = summarizeOutput(captureText(stdout), undefined, stdout.totalBytes);
  const stderrSummary = summarizeOutput(captureText(stderr), undefined, stderr.totalBytes);
  const classification = classifyCommand(argv);

  return {
    id,
    argv,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    durationMs: Math.max(0, ended.getTime() - started.getTime()),
    exitCode: result.exitCode,
    signal: result.signal,
    error: result.error,
    stdout: stdoutSummary,
    stderr: stderrSummary,
    classification,
    evidence: evidenceForCommand(
      classification,
      result.exitCode,
      !!result.error || result.signal !== null
    ),
    redaction: combineRedactionSummaries([stdoutSummary, stderrSummary])
  };
}

export function validateTimeoutSeconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("TracePack command timeout must be a positive integer number of seconds.");
  }
  return value;
}

function killChild(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    child.kill(signal);
  } catch {
    // The process may have already exited, or the platform may reject the signal name.
  }
}

function createCaptureState(): CaptureState {
  return { chunks: [], storedBytes: 0, totalBytes: 0 };
}

function appendCapture(state: CaptureState, chunk: Buffer): void {
  state.totalBytes += chunk.byteLength;
  if (state.storedBytes >= STORED_OUTPUT_BYTES) {
    return;
  }

  const remaining = STORED_OUTPUT_BYTES - state.storedBytes;
  const stored = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
  state.chunks.push(stored);
  state.storedBytes += stored.byteLength;
}

function captureText(state: CaptureState): string {
  return Buffer.concat(state.chunks).toString("utf8");
}
