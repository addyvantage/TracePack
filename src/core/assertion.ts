import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_SCHEMA_VERSION,
  validateManifest,
  type ContentObservation,
  type FinalStateReceipt,
  type TracePackManifest,
  type ValidationReceiptVerdict
} from "./manifest.js";

export const ASSERTION_SCHEMA_VERSION = "tracepack.assertion.v0.1";
export const ASSERTION_DISCLAIMER =
  "TracePack assertion checks observed evidence only; it does not prove correctness, security, approval, or merge readiness.";

export const ASSERTION_VERDICTS = [
  "validated_final_state",
  "validation_stale",
  "validation_failed",
  "command_failed",
  "command_interrupted",
  "no_validation_observed",
  "inconclusive"
] as const satisfies readonly ValidationReceiptVerdict[];

export const ASSERTION_CONFIDENCES = [
  "complete",
  "partial",
  "unavailable"
] as const satisfies readonly ContentObservation[];

export type AssertionPolicy = {
  requiredVerdicts: ValidationReceiptVerdict[];
  requiredConfidence: ContentObservation;
  allowWarnings: boolean;
};

export type AssertionResult = {
  schemaVersion: typeof ASSERTION_SCHEMA_VERSION;
  passed: boolean;
  bundleDir: string;
  runId: string | null;
  label: string | null;
  requiredVerdicts: ValidationReceiptVerdict[];
  requiredConfidence: ContentObservation;
  allowWarnings: boolean;
  actualVerdict: ValidationReceiptVerdict | null;
  actualConfidence: ContentObservation | null;
  warningCount: number;
  failures: string[];
  notes: string[];
  disclaimer: typeof ASSERTION_DISCLAIMER;
};

export async function assertBundle(
  bundleDir: string,
  policy: AssertionPolicy
): Promise<AssertionResult> {
  try {
    const manifest = validateManifest(
      JSON.parse(await readFile(path.join(bundleDir, "manifest.json"), "utf8")) as unknown
    );
    return evaluateAssertion(manifest, bundleDir, policy);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: ASSERTION_SCHEMA_VERSION,
      passed: false,
      bundleDir,
      runId: null,
      label: null,
      requiredVerdicts: policy.requiredVerdicts,
      requiredConfidence: policy.requiredConfidence,
      allowWarnings: policy.allowWarnings,
      actualVerdict: null,
      actualConfidence: null,
      warningCount: 0,
      failures: [`Could not read or validate manifest.json: ${message}`],
      notes: [],
      disclaimer: ASSERTION_DISCLAIMER
    };
  }
}

export function evaluateAssertion(
  manifest: TracePackManifest,
  bundleDir: string,
  policy: AssertionPolicy
): AssertionResult {
  const receipt = "receipt" in manifest ? manifest.receipt : undefined;
  const actualVerdict = receipt?.verdict ?? null;
  const actualConfidence = receipt ? receiptConfidence(receipt) : null;
  const failures: string[] = [];
  const notes: string[] = [];

  if (!receipt) {
    failures.push(
      "Legacy manifest does not contain a final-state validation receipt; run TracePack again with a receipt-capable version."
    );
  } else {
    if (!policy.requiredVerdicts.includes(receipt.verdict)) {
      failures.push(
        `Receipt verdict ${receipt.verdict} is not in the required set: ${policy.requiredVerdicts.join(", ")}.`
      );
    }

    if (actualConfidence !== policy.requiredConfidence) {
      failures.push(
        `Receipt confidence ${actualConfidence} does not equal required confidence ${policy.requiredConfidence}.`
      );
    }

    if (receipt.limitedCommandIds && receipt.limitedCommandIds.length > 0) {
      notes.push(`Limited validation command IDs: ${receipt.limitedCommandIds.join(", ")}.`);
    }
  }

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    notes.push(
      `Manifest schema ${manifest.schemaVersion} was evaluated as stored; TracePack did not upgrade legacy evidence certainty.`
    );
  }

  if (manifest.warnings.length > 0 && !policy.allowWarnings) {
    failures.push(
      `Manifest contains ${manifest.warnings.length} warning(s); pass --allow-warnings only if this policy should ignore warning status.`
    );
  } else if (manifest.warnings.length > 0) {
    notes.push(`Manifest contains ${manifest.warnings.length} warning(s), allowed by policy.`);
  }

  return {
    schemaVersion: ASSERTION_SCHEMA_VERSION,
    passed: failures.length === 0,
    bundleDir,
    runId: manifest.runId,
    label: manifest.label ?? null,
    requiredVerdicts: policy.requiredVerdicts,
    requiredConfidence: policy.requiredConfidence,
    allowWarnings: policy.allowWarnings,
    actualVerdict,
    actualConfidence,
    warningCount: manifest.warnings.length,
    failures,
    notes,
    disclaimer: ASSERTION_DISCLAIMER
  };
}

export async function writeAssertionResultJson(
  outputPath: string,
  result: AssertionResult
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export function formatAssertionResult(result: AssertionResult, quiet: boolean): string {
  if (quiet) {
    if (result.passed) {
      return "";
    }
    return [
      "TracePack assertion failed.",
      ...result.failures.map((failure) => `- ${failure}`),
      ASSERTION_DISCLAIMER
    ].join("\n");
  }

  const lines = [
    `TracePack assertion: ${result.passed ? "passed" : "failed"}`,
    `Bundle: ${result.bundleDir}`,
    `Run ID: ${result.runId ?? "unknown"}`,
    `Label: ${result.label ?? "none"}`,
    `Required verdict(s): ${result.requiredVerdicts.join(", ")}`,
    `Actual verdict: ${result.actualVerdict ?? "unavailable"}`,
    `Required confidence: ${result.requiredConfidence}`,
    `Actual confidence: ${result.actualConfidence ?? "unavailable"}`,
    `Warnings: ${result.warningCount}${result.allowWarnings ? " (allowed)" : ""}`
  ];

  if (result.failures.length > 0) {
    lines.push("Failures:", ...result.failures.map((failure) => `- ${failure}`));
  }

  if (result.notes.length > 0) {
    lines.push("Notes:", ...result.notes.map((note) => `- ${note}`));
  }

  lines.push(ASSERTION_DISCLAIMER);
  return lines.join("\n");
}

function receiptConfidence(receipt: FinalStateReceipt): ContentObservation {
  return (
    receipt.observationConfidence ??
    receipt.final.overallObservation ??
    receipt.final.contentObservation ??
    "unavailable"
  );
}
