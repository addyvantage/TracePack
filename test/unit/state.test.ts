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
