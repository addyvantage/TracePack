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

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Report local Tracepack readiness without reading secrets.")
    .action(async () => {
      const [git, npm, pnpm] = await Promise.all([
        checkTool("git", ["--version"]),
        checkTool(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], "npm"),
        checkTool("pnpm", ["--version"])
      ]);
      const repo = await checkGitRepository();

      console.log("Tracepack doctor");
      console.log(`Node: ${process.version}`);
      console.log(`Platform: ${process.platform} ${process.arch}`);
      console.log(`Current folder: ${process.cwd()}`);
      for (const check of [git, npm, pnpm]) {
        console.log(
          `${check.name}: ${check.available ? (check.version ?? "available") : "not available"}`
        );
      }
      console.log(`Git repository: ${repo}`);
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
