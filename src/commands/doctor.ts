import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Command } from "commander";

const execFileAsync = promisify(execFile);

export type ToolCheck = {
  name: string;
  available: boolean;
  version?: string;
  note?: string;
};

export type TracepackGitIgnoreCheck = {
  state: "yes" | "no" | "unavailable";
  reason?: string;
};

export type DoctorOutput = {
  nodeVersion: string;
  platform: string;
  arch: string;
  cwd: string;
  tools: ToolCheck[];
  gitRepository: string;
  tracepackIgnored: TracepackGitIgnoreCheck;
};

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Report local TracePack readiness without reading secrets.")
    .action(async () => {
      const [git, npm, pnpm] = await Promise.all([
        checkTool("git", ["--version"]),
        checkTool(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], "npm"),
        checkTool("pnpm", ["--version"])
      ]);
      const repo = await checkGitRepository();
      const tracepackIgnored = await checkTracepackIgnoredByGit(process.cwd());

      console.log(
        formatDoctorOutput({
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cwd: process.cwd(),
          tools: [git, npm, pnpm],
          gitRepository: repo,
          tracepackIgnored
        })
      );
    });
}

export function formatDoctorOutput(output: DoctorOutput): string {
  const lines = [
    "TracePack doctor",
    "",
    "Runtime:",
    `  Node: ${output.nodeVersion}`,
    `  Platform: ${output.platform} ${output.arch}`,
    `  Current folder: ${output.cwd}`,
    "",
    "Tools:",
    ...output.tools.map(
      (check) =>
        `  ${check.name}: ${check.available ? (check.version ?? "available") : "not available"}`
    ),
    "",
    "Repository:",
    `  Git repository: ${output.gitRepository}`,
    `  .tracepack ignored by Git: ${output.tracepackIgnored.state}`
  ];

  if (output.tracepackIgnored.state === "no") {
    lines.push("  Recommendation: add `.tracepack/` to .gitignore before sharing receipts.");
  }

  if (output.tracepackIgnored.state === "unavailable" && output.tracepackIgnored.reason) {
    lines.push(`  .tracepack ignore check: ${output.tracepackIgnored.reason}`);
  }

  lines.push(
    "",
    "Privacy:",
    "  doctor does not read .env files, credentials, or browser profiles."
  );

  return lines.join("\n");
}

async function checkTool(
  command: string,
  args: string[],
  displayName = command
): Promise<ToolCheck> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    return { name: displayName, available: true, version: result.stdout.trim() };
  } catch {
    return { name: displayName, available: false };
  }
}

async function checkGitRepository(): Promise<string> {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    return result.stdout.trim() === "true" ? "observed" : "not observed";
  } catch {
    return "not observed";
  }
}

export async function checkTracepackIgnoredByGit(cwd: string): Promise<TracepackGitIgnoreCheck> {
  try {
    const inside = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    if (inside.stdout.trim() !== "true") {
      return { state: "unavailable", reason: "not inside a Git work tree" };
    }
  } catch {
    return { state: "unavailable", reason: "not inside a Git work tree" };
  }

  try {
    await execFileAsync("git", ["check-ignore", "-q", ".tracepack/"], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    return { state: "yes" };
  } catch (error) {
    const failure = error as { code?: number | string };
    if (failure.code === 1) {
      return { state: "no" };
    }
    return { state: "unavailable", reason: "git check-ignore failed" };
  }
}
