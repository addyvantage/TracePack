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

    expect(output).toContain("· TracePack doctor");
    expect(output).toContain("runtime     Node v24.14.0 · darwin arm64");
    expect(output).toContain("folder      /tmp/repo");
    expect(output).toContain("git         observed");
    expect(output).toContain("local       .tracepack ignored by Git: no");
    expect(output).toContain("tools       git ok, npm ok, pnpm missing");
    expect(output).toContain(
      "privacy     does not read .env files, credentials, or browser profiles."
    );
    expect(output).toContain(
      "local       tracepack start will add .tracepack/ to .git/info/exclude"
    );
    expect(output).toContain("→ tracepack start");
  });
});
