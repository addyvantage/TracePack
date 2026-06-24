import { createHash } from "node:crypto";
import { captureGitEvidence, captureIgnoredFilesObservation } from "./git.js";
import type {
  ChangedFile,
  ChangedFileObservation,
  ContentObservation,
  GitEvidence,
  GitStateSnapshot,
  StateFingerprint
} from "./manifest.js";
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
  "changedFiles.contentHashStatus",
  "changedFiles.contentHashReason",
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
      contentHashStatus?: string;
      contentHashReason?: string;
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
  return createGitStateSnapshot(
    await captureGitEvidence(cwd),
    new Date().toISOString(),
    await captureIgnoredFilesObservation(cwd)
  );
}

export function createGitStateSnapshot(
  git: GitEvidence,
  capturedAt = new Date().toISOString(),
  ignoredFiles: NonNullable<GitStateSnapshot["ignoredFiles"]> = {
    mode: "not_present",
    reason: "Ignored-path observation was not supplied for this synthetic or legacy snapshot."
  }
): GitStateSnapshot {
  const fingerprint = git.available && git.isRepository ? fingerprintGitState(git) : undefined;
  const observation = observeChangedContent(git);
  const overallObservation = combineObservation(observation.contentObservation, ignoredFiles);

  return {
    capturedAt,
    git,
    fingerprint,
    contentObservation: observation.contentObservation,
    overallObservation,
    observedChangedFiles: observation.observedChangedFiles,
    unobservedChangedFiles: observation.unobservedChangedFiles,
    excludedChangedFiles: observation.excludedChangedFiles,
    ignoredFiles,
    limitations: [
      "State fingerprints are deterministic metadata receipts, not source-code contents.",
      "Sensitive paths and TracePack internal paths remain excluded from file hashing and are reported as limited evidence.",
      "Git ignored paths are outside the tracked/source-state fingerprint; TracePack records ignored-path relevance without reading ignored file contents.",
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
    contentHashStatus: file.contentHashStatus,
    contentHashReason: file.contentHashReason,
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

function observeChangedContent(git: GitEvidence): {
  contentObservation: ContentObservation;
  observedChangedFiles: ChangedFileObservation[];
  unobservedChangedFiles: ChangedFileObservation[];
  excludedChangedFiles: ChangedFileObservation[];
} {
  if (!git.available || !git.isRepository) {
    return {
      contentObservation: "unavailable",
      observedChangedFiles: [],
      unobservedChangedFiles: [],
      excludedChangedFiles: []
    };
  }

  const observedChangedFiles: ChangedFileObservation[] = [];
  const unobservedChangedFiles: ChangedFileObservation[] = [];
  const excludedChangedFiles: ChangedFileObservation[] = [];

  for (const file of git.changedFiles) {
    if (file.excluded) {
      excludedChangedFiles.push(observationForFile(file, file.exclusionReason ?? "Excluded."));
      continue;
    }

    if (file.status.includes("D")) {
      observedChangedFiles.push(
        observationForFile(
          file,
          "Deleted file content is represented by Git status and diff stats."
        )
      );
      continue;
    }

    if (file.sha256) {
      observedChangedFiles.push(
        observationForFile(file, "Safe changed-file content hash captured.")
      );
      continue;
    }

    unobservedChangedFiles.push(
      observationForFile(
        file,
        file.contentHashReason ?? "Safe changed-file content hash was not captured."
      )
    );
  }

  return {
    contentObservation:
      excludedChangedFiles.length > 0 || unobservedChangedFiles.length > 0 ? "partial" : "complete",
    observedChangedFiles,
    unobservedChangedFiles,
    excludedChangedFiles
  };
}

function combineObservation(
  contentObservation: ContentObservation,
  ignoredFiles: NonNullable<GitStateSnapshot["ignoredFiles"]>
): ContentObservation {
  if (contentObservation === "unavailable" || ignoredFiles.mode === "unavailable") {
    return "unavailable";
  }

  if (
    contentObservation === "partial" ||
    ignoredFiles.limitsConfidence === true ||
    ignoredFiles.mode === "partial" ||
    ignoredFiles.mode === "not_observed"
  ) {
    return "partial";
  }

  return "complete";
}

function observationForFile(file: ChangedFile, reason: string): ChangedFileObservation {
  return {
    path: normalizeRelativePath(file.path),
    status: file.status,
    reason,
    sizeBytes: file.sizeBytes,
    evidenceRef: `git.changedFiles:${normalizeRelativePath(file.path)}`
  };
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
