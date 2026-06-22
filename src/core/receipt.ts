import type {
  CommandEvidence,
  FinalStateReceipt,
  GitStateSnapshot,
  ValidationReceiptVerdict
} from "./manifest.js";

export function createFinalStateReceipt(params: {
  baseline: GitStateSnapshot;
  final: GitStateSnapshot;
  commands: CommandEvidence[];
}): FinalStateReceipt {
  const validationCommands = params.commands.filter(
    (command) => command.classification === "validation"
  );
  const finalFingerprint = params.final.fingerprint?.value;

  const coveringCommandIds = finalFingerprint
    ? validationCommands
        .filter(
          (command) =>
            command.exitCode === 0 && command.gitBefore?.fingerprint?.value === finalFingerprint
        )
        .map((command) => command.id)
    : [];

  const failedCommandIds = finalFingerprint
    ? validationCommands
        .filter(
          (command) =>
            command.exitCode !== 0 && command.gitBefore?.fingerprint?.value === finalFingerprint
        )
        .map((command) => command.id)
    : [];

  const staleCommandIds = finalFingerprint
    ? validationCommands
        .filter(
          (command) =>
            command.exitCode === 0 && command.gitBefore?.fingerprint?.value !== finalFingerprint
        )
        .map((command) => command.id)
    : validationCommands.map((command) => command.id);

  const verdict = receiptVerdict({
    validationCommandCount: validationCommands.length,
    hasFinalFingerprint: !!finalFingerprint,
    coveringCommandIds,
    failedCommandIds,
    staleCommandIds,
    hasMissingCommandFingerprint: validationCommands.some(
      (command) => !command.gitBefore?.fingerprint
    )
  });

  return {
    schemaVersion: "tracepack.receipt.v0.1",
    baseline: params.baseline,
    final: params.final,
    verdict,
    coveringCommandIds,
    staleCommandIds,
    failedCommandIds,
    evidenceRefs: evidenceRefs(verdict, coveringCommandIds, staleCommandIds, failedCommandIds),
    explanation: receiptExplanation(verdict, {
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      finalShort: params.final.fingerprint?.short
    }),
    limitations: [
      "TracePack observes commands run through TracePack only; validation outside TracePack is not included.",
      "The receipt confirms observed validation coverage for a local state fingerprint, not correctness, security, approval, or merge readiness.",
      "Sensitive paths and TracePack internal files are excluded from file hashing and represented only as exclusion markers.",
      "State fingerprints do not contain full source contents or full raw diffs."
    ]
  };
}

export function receiptVerdict(params: {
  validationCommandCount: number;
  hasFinalFingerprint: boolean;
  coveringCommandIds: string[];
  failedCommandIds: string[];
  staleCommandIds: string[];
  hasMissingCommandFingerprint?: boolean;
}): ValidationReceiptVerdict {
  if (!params.hasFinalFingerprint) {
    return "inconclusive";
  }
  if (params.validationCommandCount === 0) {
    return "no_validation_observed";
  }
  if (params.coveringCommandIds.length > 0) {
    return "validated_final_state";
  }
  if (params.failedCommandIds.length > 0) {
    return "validation_failed";
  }
  if (params.staleCommandIds.length > 0) {
    return "validation_stale";
  }
  if (params.hasMissingCommandFingerprint) {
    return "inconclusive";
  }
  return "inconclusive";
}

function evidenceRefs(
  verdict: ValidationReceiptVerdict,
  coveringCommandIds: string[],
  staleCommandIds: string[],
  failedCommandIds: string[]
): string[] {
  const refs = ["receipt.baseline.fingerprint", "receipt.final.fingerprint"];
  for (const id of coveringCommandIds) {
    refs.push(`commands:${id}.gitBefore.fingerprint`);
  }
  for (const id of staleCommandIds) {
    refs.push(`commands:${id}.gitBefore.fingerprint`);
  }
  for (const id of failedCommandIds) {
    refs.push(`commands:${id}.gitBefore.fingerprint`);
  }
  if (verdict === "no_validation_observed") {
    refs.push("commands");
  }
  return refs;
}

function receiptExplanation(
  verdict: ValidationReceiptVerdict,
  details: {
    coveringCommandIds: string[];
    staleCommandIds: string[];
    failedCommandIds: string[];
    finalShort?: string;
  }
): string {
  const finalState = details.finalShort ? `final state ${details.finalShort}` : "the final state";

  if (verdict === "validated_final_state") {
    return `Successful validation command(s) ${details.coveringCommandIds.join(
      ", "
    )} were observed with a pre-state fingerprint matching ${finalState}.`;
  }
  if (verdict === "validation_stale") {
    return `Successful validation was observed, but command pre-state fingerprint(s) ${details.staleCommandIds.join(
      ", "
    )} did not match ${finalState}. The final repository state changed after or during validation.`;
  }
  if (verdict === "validation_failed") {
    return `Validation command(s) ${details.failedCommandIds.join(
      ", "
    )} were observed against ${finalState}, but none completed successfully.`;
  }
  if (verdict === "no_validation_observed") {
    return "No command classified as validation was observed through TracePack.";
  }
  return "TracePack could not determine whether validation covered the final state from the available local evidence.";
}
