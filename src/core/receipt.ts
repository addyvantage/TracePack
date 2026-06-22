import type {
  CommandEvidence,
  ContentObservation,
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
  const observationConfidence = confidenceForSnapshot(params.final);

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

  const limitedCommandIds = observationConfidence === "complete" ? [] : coveringCommandIds;

  const verdict = receiptVerdict({
    validationCommandCount: validationCommands.length,
    hasFinalFingerprint: !!finalFingerprint,
    observationConfidence,
    coveringCommandIds,
    failedCommandIds,
    staleCommandIds,
    hasMissingCommandFingerprint: validationCommands.some(
      (command) => !command.gitBefore?.fingerprint
    )
  });

  return {
    schemaVersion: "tracepack.receipt.v0.2",
    baseline: params.baseline,
    final: params.final,
    verdict,
    observationConfidence,
    confidenceReasons: confidenceReasons(params.final),
    coveringCommandIds,
    staleCommandIds,
    failedCommandIds,
    limitedCommandIds,
    evidenceRefs: evidenceRefs(
      verdict,
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      params.final
    ),
    explanation: receiptExplanation(verdict, {
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      limitedCommandIds,
      observationConfidence,
      finalShort: params.final.fingerprint?.short
    }),
    limitations: [
      "TracePack observes commands run through TracePack only; validation outside TracePack is not included.",
      "The receipt reports observed validation coverage for a local state fingerprint, not correctness, security, approval, or merge readiness.",
      "Sensitive paths and TracePack internal files are excluded from file hashing and represented only as exclusion markers.",
      "Large files, symlinks, non-files, unreadable files, and ignored files can limit repository-state observation.",
      "State fingerprints do not contain full source contents or full raw diffs."
    ]
  };
}

export function receiptVerdict(params: {
  validationCommandCount: number;
  hasFinalFingerprint: boolean;
  observationConfidence?: ContentObservation;
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
    if (params.observationConfidence !== "complete") {
      return "inconclusive";
    }
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
  failedCommandIds: string[],
  final: GitStateSnapshot
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
  if ((final.unobservedChangedFiles?.length ?? 0) > 0) {
    refs.push("receipt.final.unobservedChangedFiles");
  }
  if ((final.excludedChangedFiles?.length ?? 0) > 0) {
    refs.push("receipt.final.excludedChangedFiles");
  }
  if (final.ignoredFiles) {
    refs.push("receipt.final.ignoredFiles");
  }
  return refs;
}

function receiptExplanation(
  verdict: ValidationReceiptVerdict,
  details: {
    coveringCommandIds: string[];
    staleCommandIds: string[];
    failedCommandIds: string[];
    limitedCommandIds: string[];
    observationConfidence: ContentObservation;
    finalShort?: string;
  }
): string {
  const finalState = details.finalShort ? `final state ${details.finalShort}` : "the final state";

  if (verdict === "validated_final_state") {
    return `Successful validation command(s) ${details.coveringCommandIds.join(
      ", "
    )} were observed with a pre-state fingerprint matching ${finalState}.`;
  }
  if (verdict === "inconclusive" && details.limitedCommandIds.length > 0) {
    return `Successful validation command(s) ${details.limitedCommandIds.join(
      ", "
    )} matched ${finalState}, but repository-state observation was ${details.observationConfidence}; TracePack cannot report complete final-state validation.`;
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

function confidenceForSnapshot(snapshot: GitStateSnapshot): ContentObservation {
  if (!snapshot.fingerprint) {
    return "unavailable";
  }
  return snapshot.contentObservation ?? "unavailable";
}

function confidenceReasons(snapshot: GitStateSnapshot): string[] {
  const reasons: string[] = [];

  if (!snapshot.fingerprint) {
    reasons.push("Final repository-state fingerprint was unavailable.");
  }

  for (const file of snapshot.unobservedChangedFiles ?? []) {
    reasons.push(`${file.path}: ${file.reason}`);
  }

  for (const file of snapshot.excludedChangedFiles ?? []) {
    reasons.push(`${file.path}: ${file.reason}`);
  }

  if (snapshot.ignoredFiles) {
    reasons.push(snapshot.ignoredFiles.reason);
  }

  if (reasons.length === 0) {
    reasons.push(
      "All Git-reported changed-file contents were either safely hashed or not applicable."
    );
  }

  return reasons;
}
