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
  const changedContentObservation = params.final.contentObservation ?? "unavailable";

  const coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }> =
    finalFingerprint
      ? validationCommands.filter(
          (command): command is CommandEvidence & { gitBefore: GitStateSnapshot } =>
            command.exitCode === 0 && command.gitBefore?.fingerprint?.value === finalFingerprint
        )
      : [];
  const coveringCommandIds = coveringCommands.map((command) => command.id);

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

  const observationConfidence = receiptObservationConfidence(params.final, coveringCommands);
  const limitedCommandIds = coveringCommands
    .filter((command) => receiptObservationConfidence(params.final, [command]) !== "complete")
    .map((command) => command.id);

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
    schemaVersion: "tracepack.receipt.v0.3",
    baseline: params.baseline,
    final: params.final,
    verdict,
    observationConfidence,
    changedContentObservation,
    confidenceReasons: confidenceReasons(params.final, coveringCommands),
    observationLimits: observationLimits(params.final, coveringCommands),
    coveringCommandIds,
    staleCommandIds,
    failedCommandIds,
    limitedCommandIds,
    evidenceRefs: evidenceRefs(
      verdict,
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      params.final,
      coveringCommands
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
  final: GitStateSnapshot,
  coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }>
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
  if (final.ignoredFiles && final.ignoredFiles.mode !== "not_present") {
    refs.push("receipt.final.ignoredFiles");
  }
  for (const command of coveringCommands) {
    if ((command.gitBefore.unobservedChangedFiles?.length ?? 0) > 0) {
      refs.push(`commands:${command.id}.gitBefore.unobservedChangedFiles`);
    }
    if ((command.gitBefore.excludedChangedFiles?.length ?? 0) > 0) {
      refs.push(`commands:${command.id}.gitBefore.excludedChangedFiles`);
    }
    if (command.gitBefore.ignoredFiles && command.gitBefore.ignoredFiles.mode !== "not_present") {
      refs.push(`commands:${command.id}.gitBefore.ignoredFiles`);
    }
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
  return snapshot.overallObservation ?? snapshot.contentObservation ?? "unavailable";
}

function receiptObservationConfidence(
  final: GitStateSnapshot,
  coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }>
): ContentObservation {
  return combineConfidence([
    confidenceForSnapshot(final),
    ...coveringCommands.map((command) => confidenceForSnapshot(command.gitBefore))
  ]);
}

function combineConfidence(values: ContentObservation[]): ContentObservation {
  if (values.includes("unavailable")) {
    return "unavailable";
  }
  if (values.includes("partial")) {
    return "partial";
  }
  return "complete";
}

function confidenceReasons(
  snapshot: GitStateSnapshot,
  coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }>
): string[] {
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

  if (snapshot.ignoredFiles && snapshot.ignoredFiles.mode !== "not_present") {
    reasons.push(snapshot.ignoredFiles.reason);
  }

  for (const command of coveringCommands) {
    for (const reason of snapshotLimitReasons(command.gitBefore)) {
      reasons.push(`${command.id} pre-state: ${reason}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      coveringCommands.length === 0
        ? "All Git-reported final changed-file contents were either safely hashed or not applicable, and no final ignored-path limit was observed."
        : "All Git-reported changed-file contents were either safely hashed or not applicable, and no ignored-path limit was observed for the final or matching validation state."
    );
  }

  return reasons;
}

function observationLimits(
  snapshot: GitStateSnapshot,
  coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }>
): NonNullable<FinalStateReceipt["observationLimits"]> {
  const limits: NonNullable<FinalStateReceipt["observationLimits"]> = [];

  if (!snapshot.fingerprint) {
    limits.push({
      kind: "fingerprint_unavailable",
      evidenceRef: "receipt.final.fingerprint",
      reason: "Final repository-state fingerprint was unavailable."
    });
  }

  for (const file of snapshot.unobservedChangedFiles ?? []) {
    limits.push({
      kind: "changed_file_unobserved",
      evidenceRef: file.evidenceRef,
      path: file.path,
      reason: file.reason
    });
  }

  for (const file of snapshot.excludedChangedFiles ?? []) {
    limits.push({
      kind: "changed_file_excluded",
      evidenceRef: file.evidenceRef,
      path: file.path,
      reason: file.reason
    });
  }

  if (snapshot.ignoredFiles && snapshot.ignoredFiles.mode !== "not_present") {
    limits.push({
      kind: "ignored_paths_unobserved",
      evidenceRef: "receipt.final.ignoredFiles",
      reason: snapshot.ignoredFiles.reason
    });
  }

  for (const command of coveringCommands) {
    limits.push(
      ...snapshotObservationLimits(command.gitBefore, `commands:${command.id}.gitBefore`)
    );
  }

  return limits;
}

function snapshotLimitReasons(snapshot: GitStateSnapshot): string[] {
  const reasons: string[] = [];

  if (!snapshot.fingerprint) {
    reasons.push("Repository-state fingerprint was unavailable.");
  }

  for (const file of snapshot.unobservedChangedFiles ?? []) {
    reasons.push(`${file.path}: ${file.reason}`);
  }

  for (const file of snapshot.excludedChangedFiles ?? []) {
    reasons.push(`${file.path}: ${file.reason}`);
  }

  if (snapshot.ignoredFiles && snapshot.ignoredFiles.mode !== "not_present") {
    reasons.push(snapshot.ignoredFiles.reason);
  }

  return reasons;
}

function snapshotObservationLimits(
  snapshot: GitStateSnapshot,
  evidencePrefix: string
): NonNullable<FinalStateReceipt["observationLimits"]> {
  const limits: NonNullable<FinalStateReceipt["observationLimits"]> = [];

  if (!snapshot.fingerprint) {
    limits.push({
      kind: "command_prestate_fingerprint_unavailable",
      evidenceRef: `${evidencePrefix}.fingerprint`,
      reason: "Validation command pre-state fingerprint was unavailable."
    });
  }

  for (const file of snapshot.unobservedChangedFiles ?? []) {
    limits.push({
      kind: "command_prestate_changed_file_unobserved",
      evidenceRef: `${evidencePrefix}.unobservedChangedFiles`,
      path: file.path,
      reason: file.reason
    });
  }

  for (const file of snapshot.excludedChangedFiles ?? []) {
    limits.push({
      kind: "command_prestate_changed_file_excluded",
      evidenceRef: `${evidencePrefix}.excludedChangedFiles`,
      path: file.path,
      reason: file.reason
    });
  }

  if (snapshot.ignoredFiles && snapshot.ignoredFiles.mode !== "not_present") {
    limits.push({
      kind: "command_prestate_ignored_paths_unobserved",
      evidenceRef: `${evidencePrefix}.ignoredFiles`,
      reason: snapshot.ignoredFiles.reason
    });
  }

  return limits;
}
