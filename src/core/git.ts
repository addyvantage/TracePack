import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile, GitEvidence } from "./manifest.js";
import {
  ensurePathInside,
  fileMetadata,
  isSensitivePath,
  normalizeRelativePath,
  safePathDescriptor
} from "./paths.js";

const execFileAsync = promisify(execFile);

export async function captureGitEvidence(cwd: string): Promise<GitEvidence> {
  const available = await gitAvailable(cwd);
  if (!available) {
    return emptyGitEvidence(false, "Git binary was not available.");
  }

  const inside = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], true);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return emptyGitEvidence(true, "Current folder is not inside a Git work tree.");
  }

  const rootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"], true);
  const root = rootResult.stdout.trim();
  if (!root) {
    return emptyGitEvidence(true, "Git root could not be resolved.");
  }

  const branch = await nullableGit(cwd, ["branch", "--show-current"]);
  const head = await nullableGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  const statusResult = await runGit(cwd, ["status", "--porcelain=v1", "-z"], true);
  const changedFiles = await collectChangedFiles(root, statusResult.stdout, head !== null);
  const excludedEvidence = changedFiles.flatMap((file) =>
    file.excluded
      ? [
          {
            kind: "file_metadata",
            path: file.path,
            reason: file.exclusionReason ?? "Excluded by sensitive path rules."
          }
        ]
      : []
  );

  return {
    available: true,
    isRepository: true,
    root: safePathDescriptor(root),
    branch,
    head,
    dirty: changedFiles.length > 0,
    statusSummary: changedFiles.length === 0 ? "clean" : "dirty",
    changedFiles,
    changedFileCounts: countChangedStatuses(changedFiles),
    diffStat: await collectDiffStat(cwd, head !== null),
    excludedEvidence
  };
}

export function looksLikeTestPath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  return (
    /(^|\/)(__tests__|tests?|specs?|fixtures?|snapshots?)(\/|$)/.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /\.snap$/.test(normalized)
  );
}

async function gitAvailable(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["--version"], true);
  return result.ok;
}

async function nullableGit(cwd: string, args: string[]): Promise<string | null> {
  const result = await runGit(cwd, args, true);
  if (!result.ok) {
    return null;
  }
  const trimmed = result.stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function collectChangedFiles(
  root: string,
  statusOutput: string,
  hasHead: boolean
): Promise<ChangedFile[]> {
  const entries = statusOutput.split("\0").filter(Boolean);
  const numstat = hasHead
    ? await collectNumstat(root)
    : new Map<string, { additions?: number; deletions?: number }>();
  const files: ChangedFile[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) {
      continue;
    }

    const status = entry.slice(0, 2);
    const relPath = normalizeRelativePath(entry.slice(3));
    const isRenameOrCopy = status.includes("R") || status.includes("C");
    const previousPath = isRenameOrCopy
      ? normalizeRelativePath(entries[index + 1] ?? "")
      : undefined;
    if (isRenameOrCopy) {
      index += 1;
    }

    const internalTracePackPath = relPath === ".tracepack" || relPath.startsWith(".tracepack/");
    const sensitive = isSensitivePath(relPath) || internalTracePackPath;
    const absolutePath = path.join(root, relPath);
    const base: ChangedFile = {
      path: relPath,
      status,
      previousPath: previousPath || undefined,
      additions: numstat.get(relPath)?.additions,
      deletions: numstat.get(relPath)?.deletions,
      excluded: sensitive,
      contentHashStatus: sensitive
        ? "excluded"
        : status.includes("D")
          ? "not_applicable"
          : undefined,
      contentHashReason: sensitive
        ? internalTracePackPath
          ? "Path is TracePack internal bundle/session state; content was not read."
          : "Path matched TracePack sensitive path denylist; content was not read."
        : status.includes("D")
          ? "File is deleted in the worktree; content hash is not applicable."
          : undefined,
      exclusionReason: sensitive
        ? internalTracePackPath
          ? "Path is TracePack internal bundle/session state."
          : "Path matched TracePack sensitive path denylist."
        : undefined,
      looksLikeTest:
        looksLikeTestPath(relPath) || (previousPath ? looksLikeTestPath(previousPath) : false)
    };

    if (!sensitive && ensurePathInside(root, absolutePath) && !status.includes("D")) {
      try {
        files.push({ ...base, ...(await fileMetadata(absolutePath)) });
        continue;
      } catch {
        files.push({
          ...base,
          contentHashStatus: "not_hashed",
          contentHashReason: "File metadata or content hash could not be read."
        });
        continue;
      }
    }

    files.push(base);
  }

  return files;
}

async function collectNumstat(
  root: string
): Promise<Map<string, { additions?: number; deletions?: number }>> {
  const result = await runGit(root, ["diff", "--numstat", "HEAD", "--"], true);
  const stats = new Map<string, { additions?: number; deletions?: number }>();
  if (!result.ok) {
    return stats;
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    const [additions, deletions, filePath] = line.split(/\t/);
    if (!filePath) {
      continue;
    }
    stats.set(normalizeRelativePath(filePath), {
      additions: additions === "-" ? undefined : Number.parseInt(additions ?? "0", 10),
      deletions: deletions === "-" ? undefined : Number.parseInt(deletions ?? "0", 10)
    });
  }

  return stats;
}

async function collectDiffStat(cwd: string, hasHead: boolean): Promise<GitEvidence["diffStat"]> {
  if (!hasHead) {
    return { unavailableReason: "Repository has no HEAD commit yet." };
  }

  const result = await runGit(cwd, ["diff", "--shortstat", "HEAD", "--"], true);
  if (!result.ok) {
    return { unavailableReason: "git diff --shortstat failed." };
  }

  const output = result.stdout.trim();
  if (!output) {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }

  return {
    filesChanged: parseStatNumber(output, /(\d+)\s+files?\s+changed/),
    insertions: parseStatNumber(output, /(\d+)\s+insertions?\(\+\)/),
    deletions: parseStatNumber(output, /(\d+)\s+deletions?\(-\)/)
  };
}

function parseStatNumber(value: string, pattern: RegExp): number | undefined {
  const match = value.match(pattern);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

function countChangedStatuses(files: ChangedFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const key = file.status.trim() || file.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function emptyGitEvidence(available: boolean, reason: string): GitEvidence {
  return {
    available,
    isRepository: false,
    branch: null,
    head: null,
    dirty: false,
    statusSummary: reason,
    changedFiles: [],
    changedFileCounts: {},
    diffStat: { unavailableReason: reason },
    excludedEvidence: []
  };
}

export async function runGit(
  cwd: string,
  args: string[],
  allowFailure = false
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number | null }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
      windowsHide: true
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    if (!allowFailure) {
      throw error;
    }
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : null
    };
  }
}
