import type { CommandEvidence, ValidationReceiptVerdict } from "./manifest.js";

export function formatReceiptVerdictMeaning(verdict: ValidationReceiptVerdict): string {
  if (verdict === "validated_final_state") {
    return "successful validation was observed against the final local state fingerprint";
  }
  if (verdict === "validation_stale") {
    return "validation ran, but not against the final observed state";
  }
  if (verdict === "validation_failed") {
    return "validation ran against the final observed state, but did not complete successfully";
  }
  if (verdict === "no_validation_observed") {
    return "no command captured by TracePack was classified as validation";
  }
  return "available local evidence is not enough to determine final-state validation";
}

export function formatReceiptNextAction(verdict: ValidationReceiptVerdict): string {
  if (verdict === "validated_final_state") {
    return "review the report before sharing the receipt.";
  }
  if (verdict === "validation_stale") {
    return "rerun validation after final changes before relying on this receipt.";
  }
  if (verdict === "validation_failed") {
    return "review the failed validation output and rerun validation after fixes.";
  }
  if (verdict === "no_validation_observed") {
    return "run `tracepack run -- <validation-command>` before relying on this receipt.";
  }
  return "review observation limits and ignored or sensitive paths before relying on this receipt.";
}

export function formatObservationConfidenceMeaning(confidence: string | undefined): string {
  if (confidence === "complete") {
    return "TracePack observed the repository-state evidence required by the receipt model.";
  }
  if (confidence === "partial") {
    return "Some repository-state evidence was observed only partially; review the confidence notes.";
  }
  return "Repository-state observation was unavailable or could not be fully determined.";
}

export function commandExitText(command: Pick<CommandEvidence, "exitCode" | "signal">): string {
  if (command.exitCode !== null) {
    return `exit ${command.exitCode}`;
  }
  if (command.signal) {
    return `signal ${command.signal}`;
  }
  return "not available";
}

export function commandFailed(
  command: Pick<CommandEvidence, "exitCode" | "signal" | "error">
): boolean {
  return (
    command.exitCode !== 0 &&
    (command.exitCode !== null || !!command.error || command.signal !== null)
  );
}
