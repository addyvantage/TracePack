import path from "node:path";
import type { Command } from "commander";
import {
  ASSERTION_CONFIDENCES,
  ASSERTION_VERDICTS,
  assertBundle,
  formatAssertionResult,
  writeAssertionResultJson,
  type AssertionPolicy
} from "../core/assertion.js";
import type { ContentObservation, ValidationReceiptVerdict } from "../core/manifest.js";

type AssertOptions = {
  requireVerdict: string[];
  requireConfidence: string;
  allowWarnings?: boolean;
  json?: boolean;
  summaryOut?: string;
  quiet?: boolean;
};

export function registerAssert(program: Command): void {
  program
    .command("assert")
    .description("Assert that a TracePack bundle satisfies a local evidence policy.")
    .argument("<bundle-dir>", "directory containing manifest.json")
    .option(
      "--require-verdict <verdict>",
      "required receipt verdict; may be repeated or comma-separated",
      collectValues,
      [] as string[]
    )
    .option("--require-confidence <confidence>", "required receipt confidence", "complete")
    .option("--allow-warnings", "print warnings but do not fail the assertion")
    .option("--json", "print machine-readable assertion JSON")
    .option("--summary-out <path>", "write assertion JSON to a file")
    .option("--quiet", "only print failures or JSON output")
    .action(async (bundleDir: string, options: AssertOptions) => {
      const policy = parsePolicy(options);
      const resolvedBundleDir = path.resolve(bundleDir);
      const result = await assertBundle(resolvedBundleDir, policy);

      if (options.summaryOut) {
        await writeAssertionResultJson(path.resolve(options.summaryOut), result);
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const output = formatAssertionResult(result, options.quiet ?? false);
        if (output) {
          console.log(output);
        }
      }

      process.exitCode = result.passed ? 0 : 1;
    });
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, ...splitValues(value)];
}

function parsePolicy(options: AssertOptions): AssertionPolicy {
  return {
    requiredVerdicts: parseVerdicts(options.requireVerdict),
    requiredConfidence: parseConfidence(options.requireConfidence),
    allowWarnings: options.allowWarnings ?? false
  };
}

function parseVerdicts(values: string[]): ValidationReceiptVerdict[] {
  const parsed = values.flatMap(splitValues);
  const verdicts = parsed.length > 0 ? parsed : ["validated_final_state"];
  const invalid = verdicts.filter((verdict) => !isValidationReceiptVerdict(verdict));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported required verdict: ${invalid.join(", ")}. Use one of: ${ASSERTION_VERDICTS.join(", ")}.`
    );
  }
  return [...new Set(verdicts)] as ValidationReceiptVerdict[];
}

function parseConfidence(value: string): ContentObservation {
  if (isContentObservation(value)) {
    return value;
  }
  throw new Error(
    `Unsupported required confidence: ${value}. Use one of: ${ASSERTION_CONFIDENCES.join(", ")}.`
  );
}

function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isValidationReceiptVerdict(value: string): value is ValidationReceiptVerdict {
  return ASSERTION_VERDICTS.includes(value as ValidationReceiptVerdict);
}

function isContentObservation(value: string): value is ContentObservation {
  return ASSERTION_CONFIDENCES.includes(value as ContentObservation);
}
