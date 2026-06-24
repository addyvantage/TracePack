import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGitStateSnapshot, fingerprintGitState } from "../../src/core/state.js";
import { classifyIgnoredPath, fileMetadata } from "../../src/core/paths.js";
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

  it("classifies common ignored path relevance without reading contents", () => {
    expect(classifyIgnoredPath("node_modules/")).toBe("ambient_environment");
    expect(classifyIgnoredPath(".venv/")).toBe("ambient_environment");
    expect(classifyIgnoredPath("pkg/__pycache__/")).toBe("ambient_environment");
    expect(classifyIgnoredPath("dist/")).toBe("ambient_environment");
    expect(classifyIgnoredPath("packages/app/build/")).toBe("ambient_environment");
    expect(classifyIgnoredPath(".cache/")).toBe("ambient_environment");
    expect(classifyIgnoredPath(".vite/")).toBe("ambient_environment");
    expect(classifyIgnoredPath(".next/")).toBe("ambient_environment");
    expect(classifyIgnoredPath("coverage/")).toBe("ambient_environment");
    expect(classifyIgnoredPath(".env.local")).toBe("sensitive_local_input");
    expect(classifyIgnoredPath("config.local.json")).toBe("sensitive_local_input");
    expect(classifyIgnoredPath("dist/config.local.json")).toBe("sensitive_local_input");
    expect(classifyIgnoredPath("build/runtime-config.json")).toBe("sensitive_local_input");
    expect(classifyIgnoredPath("local/settings.json")).toBe("sensitive_local_input");
    expect(classifyIgnoredPath("custom-fixture-data/")).toBe("unknown");
  });

  it("keeps ambient ignored environment paths out of overall confidence limits", () => {
    const snapshot = createGitStateSnapshot(git(), "2026-01-01T00:00:00.000Z", {
      mode: "metadata_observed",
      count: 1,
      ambientCount: 1,
      sensitiveLocalCount: 0,
      unknownCount: 0,
      limitsConfidence: false,
      samples: [
        {
          path: "node_modules/",
          pathHash: "ignoredhash",
          kind: "directory",
          relevance: "ambient_environment",
          reason:
            "Ambient ignored environment path was present, but TracePack did not read or hash its contents."
        }
      ],
      reason:
        "One non-TracePack ignored path was observed: one ambient ignored environment path present but not read or hashed. Ambient ignored environment paths do not by themselves limit receipt confidence. TracePack did not read ignored file contents."
    });

    expect(snapshot.contentObservation).toBe("complete");
    expect(snapshot.overallObservation).toBe("complete");
    expect(snapshot.ignoredFiles?.mode).toBe("metadata_observed");
  });

  it("marks sensitive or unknown ignored paths as partial overall observation", () => {
    const snapshot = createGitStateSnapshot(git(), "2026-01-01T00:00:00.000Z", {
      mode: "partial",
      count: 2,
      ambientCount: 0,
      sensitiveLocalCount: 1,
      unknownCount: 1,
      limitsConfidence: true,
      samples: [
        {
          path: undefined,
          pathHash: "ignoredhash",
          kind: "file",
          relevance: "sensitive_local_input",
          reason:
            "Ignored path matched sensitive or local input rules; path label is hidden and content was not read."
        },
        {
          path: "custom-fixture-data/",
          pathHash: "unknownhash",
          kind: "directory",
          relevance: "unknown",
          reason:
            "Ignored path did not match a known ambient environment category; content was not read and confidence is limited."
        }
      ],
      reason:
        "Two non-TracePack ignored paths were observed. Sensitive/local or unknown ignored paths may affect validation, so receipt confidence is limited. TracePack did not read ignored file contents."
    });

    expect(snapshot.contentObservation).toBe("complete");
    expect(snapshot.overallObservation).toBe("partial");
    expect(snapshot.ignoredFiles?.mode).toBe("partial");
  });

  it("records symlinks as unhashable without reading target contents", async () => {
    const root = await tempRoot();
    try {
      await writeFile(path.join(root, "target.txt"), "secret-ish\n", "utf8");
      await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));

      await expect(fileMetadata(path.join(root, "link.txt"))).resolves.toEqual(
        expect.objectContaining({
          contentHashStatus: "not_hashed",
          contentHashReason: expect.stringContaining("symbolic link")
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records directories as non-file paths", async () => {
    const root = await tempRoot();
    try {
      await mkdir(path.join(root, "dir"));

      await expect(fileMetadata(path.join(root, "dir"))).resolves.toEqual(
        expect.objectContaining({
          contentHashStatus: "not_hashed",
          contentHashReason: expect.stringContaining("not a regular file")
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces unreadable file hash failures where the platform enforces permissions", async () => {
    const root = await tempRoot();
    const filePath = path.join(root, "unreadable.txt");
    try {
      await writeFile(filePath, "cannot read this\n", "utf8");
      await chmod(filePath, 0o000);

      let failed = false;
      try {
        await fileMetadata(filePath);
      } catch (error) {
        failed = true;
        expect((error as Error).message).toBeTruthy();
      }
      if (process.platform !== "win32") {
        expect(failed).toBe(true);
      }
    } finally {
      await chmod(filePath, 0o600).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
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

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "TracePack-state-test-"));
}
