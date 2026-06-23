import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import type { Command } from "commander";
import { cleanActiveSessionPointer, inspectActiveSession } from "../core/session.js";
import { normalizeRelativePath, runDirectory } from "../core/paths.js";

type CleanOptions = {
  force?: boolean;
};

export function registerClean(program: Command): void {
  program
    .command("clean")
    .description("Remove the active TracePack session pointer without deleting bundles.")
    .option("--force", "remove an active-session pointer without confirmation")
    .action(async (options: CleanOptions) => {
      const cwd = process.cwd();
      const inspection = await inspectActiveSession(cwd);

      if (inspection.state === "active" && !options.force) {
        if (!process.stdin.isTTY) {
          throw new Error(
            "Refusing to remove an active TracePack session pointer without --force because stdin is not interactive."
          );
        }

        const confirmed = await confirmClean(inspection.runId);
        if (!confirmed) {
          console.log("Active TracePack session pointer was not removed.");
          return;
        }
      }

      const cleaned = await cleanActiveSessionPointer(cwd);
      console.log(formatCleanResult(cleaned, cwd));
    });
}

export function formatCleanResult(
  cleaned: Awaited<ReturnType<typeof cleanActiveSessionPointer>>,
  cwd: string
): string {
  if (cleaned.state === "none") {
    return "No active TracePack session pointer to remove.";
  }

  if (cleaned.state === "stale") {
    return [
      `Removed stale TracePack active-session pointer: ${relativePath(cwd, cleaned.pointerPath)}`,
      `Reason: ${cleaned.reason}`
    ].join("\n");
  }

  return [
    `Removed active TracePack session pointer for ${cleaned.runId}.`,
    "This did not delete the bundle or session data.",
    `Session data remains in: ${relativePath(cwd, path.join(runDirectory(cwd, cleaned.runId), "session.json"))}`
  ].join("\n");
}

async function confirmClean(runId: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Remove active TracePack session pointer for ${runId}? This will not delete the bundle. [y/N] `
    );
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function relativePath(cwd: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(cwd, absolutePath));
}
