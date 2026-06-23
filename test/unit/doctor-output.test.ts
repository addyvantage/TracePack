import { describe, expect, it } from "vitest";
import { formatDoctorOutput } from "../../src/commands/doctor.js";

describe("doctor output", () => {
  it("groups runtime, tool, repository, and privacy details", () => {
    const output = formatDoctorOutput({
      nodeVersion: "v24.14.0",
      platform: "darwin",
      arch: "arm64",
      cwd: "/tmp/repo",
      tools: [
        { name: "git", available: true, version: "git version 2.53.0" },
        { name: "npm", available: true, version: "11.9.0" },
        { name: "pnpm", available: false }
      ],
      gitRepository: "observed",
      tracepackIgnored: { state: "no" }
    });

    expect(output).toContain("Runtime:");
    expect(output).toContain("  Node: v24.14.0");
    expect(output).toContain("Tools:");
    expect(output).toContain("  pnpm: not available");
    expect(output).toContain("Repository:");
    expect(output).toContain("  .tracepack ignored by Git: no");
    expect(output).toContain("Recommendation: add `.tracepack/` to .gitignore");
    expect(output).toContain("Privacy:");
    expect(output).toContain("doctor does not read .env files, credentials, or browser profiles.");
  });
});
