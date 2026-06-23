import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Command } from "commander";

const execFileAsync = promisify(execFile);

type ToolCheck = {
  name: string;
  available: boolean;
  version?: string;
  note?: string;
};

export type TracepackGitIgnoreCheck = {
  state: "yes" | "no" | "unavailable";
  reason?: string;
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

      console.log("TracePack doctor");
      console.log(`Node: ${process.version}`);
      console.log(`Platform: ${process.platform} ${process.arch}`);
      console.log(`Current folder: ${process.cwd()}`);
      for (const check of [git, npm, pnpm]) {
        console.log(
          `${check.name}: ${check.available ? (check.version ?? "available") : "not available"}`
        );
      }
      console.log(`Git repository: ${repo}`);
      console.log(`.tracepack ignored by Git: ${tracepackIgnored.state}`);
      if (tracepackIgnored.state === "no") {
        console.log("Recommendation: add `.tracepack/` to .gitignore before sharing receipts.");
      }
      if (tracepackIgnored.state === "unavailable" && tracepackIgnored.reason) {
        console.log(`.tracepack ignore check: ${tracepackIgnored.reason}`);
      }
      console.log(
        "Safe configuration: doctor does not read .env files, credentials, or browser profiles."
      );
    });
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
