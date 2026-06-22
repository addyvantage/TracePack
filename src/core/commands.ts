import { spawn } from "node:child_process";
import { classifyCommand, evidenceForCommand } from "./classify.js";
import type { CommandEvidence } from "./manifest.js";
import { combineRedactionSummaries, summarizeOutput } from "./redaction.js";

const STORED_OUTPUT_BYTES = 48_000;

type CaptureState = {
  chunks: Buffer[];
  storedBytes: number;
  totalBytes: number;
};

export async function runAndCaptureCommand(
  argv: string[],
  cwd: string,
  id: string
): Promise<CommandEvidence> {
  if (argv.length === 0) {
    throw new Error("tracepack run requires a command after --.");
  }

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
    const child = spawn(spawnedCommand, spawnedArgs, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      appendCapture(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      appendCapture(stderr, chunk);
    });

    child.on("error", (error) => {
      resolve({ exitCode: null, signal: null, error: error.message });
    });

    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal });
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
    evidence: evidenceForCommand(classification, result.exitCode),
    redaction: combineRedactionSummaries([stdoutSummary, stderrSummary])
  };
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
