import type { FinalStateReceipt, TracePackManifest, ValidationReceiptVerdict } from "./manifest.js";

export const CANONICAL_LIMITATION_STATEMENT =
  "Tracepack records observed local evidence. It does not prove code correctness, test sufficiency, security, or merge approval.";

export type DisplayVerdictKey =
  | "final_state_validation_observed"
  | "validation_evidence_incomplete"
  | "validation_command_failed"
  | "repository_evidence_unavailable";

export type DisplayVerdictHeadline =
  | "Final-state validation observed"
  | "Validation evidence incomplete"
  | "Validation command failed"
  | "Repository evidence unavailable";

export type DisplayVerdict = {
  key: DisplayVerdictKey;
  headline: DisplayVerdictHeadline;
  explanation: string;
  glyph: string;
  asciiGlyph: string;
  stateWord: "observed" | "incomplete" | "failed" | "unavailable";
  nextAction: string;
};

export function displayVerdictForManifest(manifest: TracePackManifest): DisplayVerdict {
  if (!("receipt" in manifest)) {
    return repositoryUnavailableVerdict(
      "This bundle does not include a final-state validation receipt, so Tracepack cannot compare validation with the final captured repository state."
    );
  }

  return displayVerdictForReceipt(manifest.receipt);
}

export function displayVerdictForReceipt(receipt: FinalStateReceipt): DisplayVerdict {
  if (
    !receipt.final.git.available ||
    !receipt.final.git.isRepository ||
    !receipt.final.fingerprint
  ) {
    return repositoryUnavailableVerdict(
      "Tracepack could not capture the final repository-state fingerprint needed to compare validation with the final state."
    );
  }

  if (receipt.verdict === "validated_final_state") {
    return {
      key: "final_state_validation_observed",
      headline: "Final-state validation observed",
      explanation:
        "Successful validation was observed against the final captured repository state.",
      glyph: "✓",
      asciiGlyph: "[ok]",
      stateWord: "observed",
      nextAction: "review the report before sharing the receipt"
    };
  }

  if (isFailedVerdict(receipt.verdict)) {
    return {
      key: "validation_command_failed",
      headline: "Validation command failed",
      explanation: failedExplanation(receipt.verdict),
      glyph: "✗",
      asciiGlyph: "[fail]",
      stateWord: "failed",
      nextAction: failedNextAction(receipt.verdict)
    };
  }

  return {
    key: "validation_evidence_incomplete",
    headline: "Validation evidence incomplete",
    explanation: incompleteExplanation(receipt),
    glyph: "⚠",
    asciiGlyph: "[warn]",
    stateWord: "incomplete",
    nextAction: incompleteNextAction(receipt.verdict)
  };
}

function repositoryUnavailableVerdict(explanation: string): DisplayVerdict {
  return {
    key: "repository_evidence_unavailable",
    headline: "Repository evidence unavailable",
    explanation,
    glyph: "·",
    asciiGlyph: "[..]",
    stateWord: "unavailable",
    nextAction: "review repository evidence limits before relying on this receipt"
  };
}

function isFailedVerdict(verdict: ValidationReceiptVerdict): boolean {
  return (
    verdict === "validation_failed" ||
    verdict === "command_failed" ||
    verdict === "command_interrupted"
  );
}

function failedExplanation(verdict: ValidationReceiptVerdict): string {
  if (verdict === "validation_failed") {
    return "A validation command was observed for the final captured repository state, but it did not complete successfully.";
  }
  if (verdict === "command_interrupted") {
    return "A traced command was interrupted or timed out before successful validation was observed for the final captured repository state.";
  }
  return "A traced command failed before successful validation was observed for the final captured repository state.";
}

function failedNextAction(verdict: ValidationReceiptVerdict): string {
  if (verdict === "validation_failed") {
    return "review the failed validation output, then rerun validation against the final state";
  }
  if (verdict === "command_interrupted") {
    return "review the interrupted command, then rerun validation against the final state";
  }
  return "review the failed command, then run validation against the final state";
}

function incompleteExplanation(receipt: FinalStateReceipt): string {
  if (receipt.verdict === "validation_stale") {
    return "Successful validation was observed, but the repository changed afterward. The final state was not observed by validation.";
  }
  if (receipt.verdict === "no_validation_observed") {
    return "No command classified as validation was observed for the final captured repository state.";
  }
  if (receipt.verdict === "inconclusive" && receipt.coveringCommandIds.length > 0) {
    return "Successful validation matched the final state, but repository-state observation was incomplete.";
  }
  return "Available local evidence was not enough to determine whether validation covered the final captured repository state.";
}

function incompleteNextAction(verdict: ValidationReceiptVerdict): string {
  if (verdict === "validation_stale") {
    return "re-run validation against the final state, then tracepack finish";
  }
  if (verdict === "no_validation_observed") {
    return "run tracepack run -- <validation-command>, then tracepack finish";
  }
  return "review observation limits, then rerun validation against the final state";
}
