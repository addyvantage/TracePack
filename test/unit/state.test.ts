import { describe, expect, it } from "vitest";
import { fingerprintGitState } from "../../src/core/state.js";
import type { GitEvidence } from "../../src/core/manifest.js";

describe("state fingerprint", () => {
  it("is stable when changed files and counters are reordered", () => {
    const left = fingerprintGitState(
      git({
        changedFiles: [changedFile("src/b.ts", " M", "b"), changedFile("src/a.ts", " M", "a")],
        changedFileCounts: { " M": 2, "??": 1 }
      })
    );
    const right = fingerprintGitState(
      git({
        changedFiles: [changedFile("src/a.ts", " M", "a"), changedFile("src/b.ts", " M", "b")],
        changedFileCounts: { "??": 1, " M": 2 }
      })
    );

    expect(left.value).toBe(right.value);
  });

  it("normalizes Windows-style changed paths before hashing", () => {
    const left = fingerprintGitState(
      git({ changedFiles: [changedFile("src\\core\\file.ts", " M", "abc")] })
    );
    const right = fingerprintGitState(
      git({ changedFiles: [changedFile("src/core/file.ts", " M", "abc")] })
    );

    expect(left.value).toBe(right.value);
  });

  it("changes when safe file hashes change", () => {
    const left = fingerprintGitState(git({ changedFiles: [changedFile("src/a.ts", " M", "a")] }));
    const right = fingerprintGitState(git({ changedFiles: [changedFile("src/a.ts", " M", "b")] }));

    expect(left.value).not.toBe(right.value);
  });

  it("marks safe changed files without content hashes as partial observation", async () => {
    const { createGitStateSnapshot } = await import("../../src/core/state.js");
    const snapshot = createGitStateSnapshot(
      git({
        changedFiles: [
          {
            path: "large.bin",
            status: " M",
            sizeBytes: 2_000_000,
            contentHashStatus: "not_hashed",
            contentHashReason: "File is larger than the safe hashing limit.",
            excluded: false,
            looksLikeTest: false
          }
        ]
      })
    );

    expect(snapshot.contentObservation).toBe("partial");
    expect(snapshot.unobservedChangedFiles).toEqual([
      expect.objectContaining({
        path: "large.bin",
        reason: "File is larger than the safe hashing limit."
      })
    ]);
  });

  it("tracks excluded changed files separately from observed files", async () => {
    const { createGitStateSnapshot } = await import("../../src/core/state.js");
    const snapshot = createGitStateSnapshot(
      git({
        changedFiles: [
          {
            path: ".env",
            status: "??",
            excluded: true,
            exclusionReason: "Path matched TracePack sensitive path denylist.",
            contentHashStatus: "excluded",
            contentHashReason:
              "Path matched TracePack sensitive path denylist; content was not read.",
            looksLikeTest: false
          }
        ],
        excludedEvidence: [
          {
            kind: "file_metadata",
            path: ".env",
            reason: "Path matched TracePack sensitive path denylist."
          }
        ]
      })
    );

    expect(snapshot.contentObservation).toBe("partial");
    expect(snapshot.excludedChangedFiles).toEqual([
      expect.objectContaining({
        path: ".env",
        reason: "Path matched TracePack sensitive path denylist."
      })
    ]);
    expect(snapshot.unobservedChangedFiles).toEqual([]);
  });
});

function git(overrides: Partial<GitEvidence> = {}): GitEvidence {
  return {
    available: true,
    isRepository: true,
    branch: "main",
    head: "abc",
    dirty: true,
    statusSummary: "dirty",
    changedFiles: [],
    changedFileCounts: {},
    diffStat: { filesChanged: 1, insertions: 1, deletions: 0 },
    excludedEvidence: [],
    ...overrides
  };
}

function changedFile(
  path: string,
  status: string,
  sha256: string
): GitEvidence["changedFiles"][number] {
  return {
    path,
    status,
    sizeBytes: 10,
    sha256,
    excluded: false,
    looksLikeTest: false
  };
}
