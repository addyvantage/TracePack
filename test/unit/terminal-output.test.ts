import { describe, expect, it } from "vitest";
import { formatReportCommandOutput } from "../../src/commands/report.js";
import { formatStartOutput } from "../../src/commands/start.js";

describe("terminal output formatters", () => {
  it("formats start output around the baseline and next validation step", () => {
    const output = formatStartOutput({
      schemaVersion: "tracepack.session.v0.1",
      runId: "start-demo",
      label: "local-review",
      startedAt: "2026-01-01T00:00:00.000Z",
      cwd: "/tmp/repo",
      initialGit: {
        available: true,
        isRepository: true,
        branch: "main",
        head: "abc123",
        dirty: false,
        statusSummary: "clean",
        changedFiles: [],
        changedFileCounts: {},
        diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
        excludedEvidence: []
      },
      initialState: {
        capturedAt: "2026-01-01T00:00:00.000Z",
        git: {
          available: true,
          isRepository: true,
          branch: "main",
          head: "abc123",
          dirty: false,
          statusSummary: "clean",
          changedFiles: [],
          changedFileCounts: {},
          diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
          excludedEvidence: []
        },
        fingerprint: {
          algorithm: "tracepack.state-fingerprint.v1",
          value: "abc123",
          short: "abc123",
          canonicalFields: []
        },
        limitations: []
      },
      commands: [],
      tracepackGitExclude: { state: "added", excludePath: "/tmp/repo/.git/info/exclude" }
    });

    expect(output).toContain("✓ TracePack session started");
    expect(output).toContain("run          start-demo");
    expect(output).toContain("baseline     abc123");
    expect(output).toContain("local        added .tracepack/ to .git/info/exclude");
    expect(output).toContain("session      .tracepack/start-demo/session.json");
    expect(output).toContain("→ tracepack run -- <validation-command>");
  });

  it("formats report output with one clear output path", () => {
    const output = formatReportCommandOutput(
      {
        resolvedBundleDir: "/tmp/repo/.tracepack/report-demo",
        outputs: ["/tmp/repo/.tracepack/report-demo/report.html"]
      },
      "/tmp/repo"
    );

    expect(output).toContain("✓ Report regenerated");
    expect(output).toContain("bundle       .tracepack/report-demo");
    expect(output).toContain("output       .tracepack/report-demo/report.html");
    expect(output).toContain("→ open report.html from disk");
  });
});
