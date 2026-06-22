import { createHash } from "node:crypto";
import { captureGitEvidence } from "./git.js";
import type { ChangedFile, GitEvidence, GitStateSnapshot, StateFingerprint } from "./manifest.js";
import { normalizeRelativePath } from "./paths.js";

const FINGERPRINT_ALGORITHM = "tracepack.state-fingerprint.v1" as const;

const CANONICAL_FIELDS = [
  "head",
  "branch",
  "dirty",
  "statusSummary",
  "changedFiles.path",
  "changedFiles.status",
  "changedFiles.previousPath",
  "changedFiles.additions",
  "changedFiles.deletions",
  "changedFiles.sizeBytes",
  "changedFiles.sha256",
  "changedFiles.excluded",
  "changedFiles.exclusionReason",
  "changedFiles.looksLikeTest",
  "changedFileCounts",
  "diffStat",
  "excludedEvidence"
];

type CanonicalStateInput = {
  algorithm: typeof FINGERPRINT_ALGORITHM;
  git: {
    available: boolean;
    isRepository: boolean;
    head: string | null;
    branch: string | null;
    dirty: boolean;
    statusSummary: string;
    changedFiles: Array<{
      path: string;
      status: string;
      previousPath?: string;
      additions?: number;
      deletions?: number;
      sizeBytes?: number;
      sha256?: string;
      excluded: boolean;
      exclusionReason?: string;
      looksLikeTest: boolean;
    }>;
    changedFileCounts: Array<{ status: string; count: number }>;
    diffStat: GitEvidence["diffStat"];
    excludedEvidence: Array<{ kind: string; path?: string; reason: string }>;
  };
};

export async function captureGitStateSnapshot(cwd: string): Promise<GitStateSnapshot> {
  return createGitStateSnapshot(await captureGitEvidence(cwd));
}

export function createGitStateSnapshot(
  git: GitEvidence,
  capturedAt = new Date().toISOString()
): GitStateSnapshot {
  const fingerprint = git.available && git.isRepository ? fingerprintGitState(git) : undefined;

  return {
    capturedAt,
    git,
    fingerprint,
    limitations: [
      "State fingerprints are deterministic metadata receipts, not source-code contents.",
      "Sensitive paths and TracePack internal paths remain excluded from file hashing.",
      "A matching fingerprint means TracePack observed the same local Git/worktree metadata, not that the code is correct or secure."
    ]
  };
}

export function fingerprintGitState(git: GitEvidence): StateFingerprint {
  const input = canonicalStateInput(git);
  const canonical = canonicalJson(input);
  const value = createHash("sha256").update(canonical).digest("hex");

  return {
    algorithm: FINGERPRINT_ALGORITHM,
    value,
    short: value.slice(0, 12),
    canonicalFields: CANONICAL_FIELDS
  };
}

export function canonicalStateInput(git: GitEvidence): CanonicalStateInput {
  return {
    algorithm: FINGERPRINT_ALGORITHM,
    git: {
      available: git.available,
      isRepository: git.isRepository,
      head: git.head,
      branch: git.branch,
      dirty: git.dirty,
      statusSummary: git.statusSummary,
      changedFiles: git.changedFiles.map(canonicalChangedFile).sort(compareChangedFiles),
      changedFileCounts: Object.entries(git.changedFileCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      diffStat: {
        filesChanged: git.diffStat.filesChanged,
        insertions: git.diffStat.insertions,
        deletions: git.diffStat.deletions,
        unavailableReason: git.diffStat.unavailableReason
      },
      excludedEvidence: git.excludedEvidence
        .map((evidence) => ({
          kind: evidence.kind,
          path: evidence.path ? normalizeRelativePath(evidence.path) : undefined,
          reason: evidence.reason
        }))
        .sort((a, b) =>
          `${a.kind}\0${a.path ?? ""}\0${a.reason}`.localeCompare(
            `${b.kind}\0${b.path ?? ""}\0${b.reason}`
          )
        )
    }
  };
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function canonicalChangedFile(
  file: ChangedFile
): CanonicalStateInput["git"]["changedFiles"][number] {
  return {
    path: normalizeRelativePath(file.path),
    status: file.status,
    previousPath: file.previousPath ? normalizeRelativePath(file.previousPath) : undefined,
    additions: file.additions,
    deletions: file.deletions,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    excluded: file.excluded,
    exclusionReason: file.exclusionReason,
    looksLikeTest: file.looksLikeTest
  };
}

function compareChangedFiles(
  a: CanonicalStateInput["git"]["changedFiles"][number],
  b: CanonicalStateInput["git"]["changedFiles"][number]
): number {
  return `${a.path}\0${a.status}\0${a.previousPath ?? ""}`.localeCompare(
    `${b.path}\0${b.status}\0${b.previousPath ?? ""}`
  );
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortForJson(entryValue)])
    );
  }
  return value;
}
