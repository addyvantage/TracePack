import type { Command } from "commander";
import path from "node:path";
import { startSession } from "../core/session.js";
import { normalizeRelativePath } from "../core/paths.js";
import { arrow, glyph, shouldUseColor } from "../core/terminal.js";

export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Create a baseline TracePack session in the current Git repository.")
    .option("--label <name>", "human-readable run label")
    .action(async (options: { label?: string }) => {
      const session = await startSession(process.cwd(), options.label);
      console.log(formatStartOutput(session, { color: shouldUseColor() }));
    });
}

type StartSessionResult = Awaited<ReturnType<typeof startSession>>;

export function formatStartOutput(
  session: StartSessionResult,
  options: { color?: boolean; unicode?: boolean } = {}
): string {
  const statePath = normalizeRelativePath(
    path.relative(session.cwd, path.join(session.cwd, ".tracepack", session.runId, "session.json"))
  );
  const lines = [
    `${glyph("observed", options)} TracePack session started`,
    `  run          ${session.runId}`,
    session.label ? `  label        ${session.label}` : undefined,
    `  baseline     ${session.initialState.fingerprint?.short ?? "not available"}`,
    `  git          ${session.initialGit.branch ?? "branch not observed"} · ${session.initialGit.head ?? "HEAD not observed"}`,
    session.tracepackGitExclude?.state === "added"
      ? "  local        added .tracepack/ to .git/info/exclude"
      : undefined,
    `  session      ${statePath}`,
    "",
    `  ${arrow(options)} tracepack run -- <validation-command>`
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}
