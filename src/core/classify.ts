import type { CommandClassification, EvidenceLabel } from "./manifest.js";

const VALIDATION_COMMANDS = new Set([
  "test",
  "vitest",
  "jest",
  "mocha",
  "ava",
  "pytest",
  "ruff",
  "mypy",
  "eslint",
  "tsc",
  "go",
  "cargo",
  "dotnet",
  "gradle",
  "mvn"
]);

const VALIDATION_SCRIPT_NAMES = new Set([
  "test",
  "tests",
  "lint",
  "typecheck",
  "type-check",
  "check",
  "verify",
  "ci"
]);

const POSSIBLE_VALIDATION_SCRIPT_NAMES = new Set(["build", "smoke"]);

export function classifyCommand(argv: string[]): CommandClassification {
  const base = normalizeBase(argv[0] ?? "");
  const args = argv.slice(1).map((arg) => arg.toLowerCase());

  if (!base) {
    return "unknown";
  }

  if (base === "npm" || base === "pnpm" || base === "yarn" || base === "bun") {
    const script = packageScriptName(args);
    if (script && VALIDATION_SCRIPT_NAMES.has(script)) {
      return "validation";
    }
    if (script && POSSIBLE_VALIDATION_SCRIPT_NAMES.has(script)) {
      return "possible_validation";
    }
    if (args[0] === "install" || args[0] === "add" || args[0] === "dev" || args[0] === "start") {
      return "non_validation";
    }
  }

  if (base === "python" || base === "python3" || base === "py") {
    if (
      args.includes("-m") &&
      args.some((arg) => ["pytest", "unittest", "mypy", "ruff"].includes(arg))
    ) {
      return "validation";
    }
  }

  if (VALIDATION_COMMANDS.has(base)) {
    if (base === "go" && args[0] !== "test") {
      return args[0] === "vet" ? "validation" : "unknown";
    }
    if (base === "cargo" && args[0] !== "test" && args[0] !== "clippy") {
      return args[0] === "check" ? "validation" : "unknown";
    }
    return "validation";
  }

  if (base.includes("test") || base.includes("lint") || base.includes("typecheck")) {
    return "validation";
  }

  return "unknown";
}

export function evidenceForCommand(
  classification: CommandClassification,
  exitCode: number | null,
  failedWithoutExitCode = false
): EvidenceLabel {
  if (classification === "validation") {
    return exitCode === 0 && !failedWithoutExitCode ? "successful_validation" : "failed_validation";
  }
  if (classification === "possible_validation") {
    return exitCode === 0 && !failedWithoutExitCode
      ? "possible_validation_observed"
      : "command_failed";
  }
  if (failedWithoutExitCode || (exitCode !== 0 && exitCode !== null)) {
    return "command_failed";
  }
  return "observed";
}

function packageScriptName(args: string[]): string | undefined {
  if (args.length === 0) {
    return undefined;
  }

  const first = args[0];
  if (first && VALIDATION_SCRIPT_NAMES.has(first)) {
    return first;
  }
  if (first && POSSIBLE_VALIDATION_SCRIPT_NAMES.has(first)) {
    return first;
  }

  if (first === "run" || first === "exec") {
    return args[1];
  }

  return undefined;
}

function normalizeBase(value: string): string {
  const normalized = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return normalized.replace(/\.(cmd|exe|ps1|bat)$/i, "").toLowerCase();
}

export function commandHasSuspiciousTestFlag(argv: string[]): string | undefined {
  const lowered = argv.map((arg) => arg.toLowerCase());
  if (lowered.some((arg) => arg === "--updatesnapshot" || arg === "--update-snapshot")) {
    return "--updateSnapshot or --update-snapshot";
  }
  if (lowered.some((arg) => arg === "--skip" || arg.startsWith("--skip="))) {
    return "--skip";
  }
  if (lowered.some((arg) => arg === "--grep" || arg === "--grep-invert" || arg === "--invert")) {
    return "--grep/--grep-invert";
  }
  const knownSnapshotTools = lowered.some((arg) => ["jest", "vitest"].includes(arg));
  if (knownSnapshotTools && lowered.includes("-u")) {
    return "-u for a known snapshot-capable test tool";
  }
  return undefined;
}
