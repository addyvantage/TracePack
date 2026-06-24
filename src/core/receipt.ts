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
            commandFailedForReceipt(command) &&
            !commandInterruptedForReceipt(command) &&
            command.gitBefore?.fingerprint?.value === finalFingerprint
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
  const successfulValidationCommandCount = validationCommands.filter(
    (command) => command.exitCode === 0
  ).length;
  const failedTracedCommands = params.commands.filter(commandFailedForReceipt);
  const interruptedCommandIds = failedTracedCommands
    .filter(commandInterruptedForReceipt)
    .map((command) => command.id);
  const failedTracedCommandIds = failedTracedCommands
    .filter(
      (command) => !commandInterruptedForReceipt(command) && command.classification !== "validation"
    )
    .map((command) => command.id);

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
    failedTracedCommandIds,
    interruptedCommandIds,
    successfulValidationCommandCount,
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
    environmentNotes: environmentNotes(params.final, coveringCommands),
    coveringCommandIds,
    staleCommandIds,
    failedCommandIds,
    failedTracedCommandIds,
    interruptedCommandIds,
    limitedCommandIds,
    evidenceRefs: evidenceRefs(
      verdict,
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      failedTracedCommandIds,
      interruptedCommandIds,
      params.final,
      coveringCommands
    ),
    explanation: receiptExplanation(verdict, {
      coveringCommandIds,
      staleCommandIds,
      failedCommandIds,
      failedTracedCommandIds,
      interruptedCommandIds,
      limitedCommandIds,
      observationConfidence,
      finalShort: params.final.fingerprint?.short
    }),
    limitations: [
      "TracePack observes commands run through TracePack only; validation outside TracePack is not included.",
      "The receipt reports observed validation coverage for a local state fingerprint, not correctness, security, approval, or merge readiness.",
      "Sensitive paths and TracePack internal files are excluded from file hashing and represented only as exclusion markers.",
      "Large files, symlinks, non-files, unreadable files, sensitive/local ignored inputs, and unknown ignored paths can limit repository-state observation.",
      "Ambient ignored environment paths are reported as notes; their contents are not read, hashed, or validated.",
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
  failedTracedCommandIds?: string[];
  interruptedCommandIds?: string[];
  successfulValidationCommandCount?: number;
  hasMissingCommandFingerprint?: boolean;
}): ValidationReceiptVerdict {
  if (!params.hasFinalFingerprint) {
    if ((params.successfulValidationCommandCount ?? 0) === 0) {
      if ((params.interruptedCommandIds?.length ?? 0) > 0) {
        return "command_interrupted";
      }
      if ((params.failedTracedCommandIds?.length ?? 0) > 0) {
        return "command_failed";
      }
    }
    return "inconclusive";
  }
  if (params.validationCommandCount === 0) {
    if ((params.interruptedCommandIds?.length ?? 0) > 0) {
      return "command_interrupted";
    }
    if ((params.failedTracedCommandIds?.length ?? 0) > 0) {
      return "command_failed";
    }
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
  if ((params.successfulValidationCommandCount ?? 0) === 0) {
    if ((params.interruptedCommandIds?.length ?? 0) > 0) {
      return "command_interrupted";
    }
    if ((params.failedTracedCommandIds?.length ?? 0) > 0) {
      return "command_failed";
    }
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
  failedTracedCommandIds: string[],
  interruptedCommandIds: string[],
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
  for (const id of failedTracedCommandIds) {
    refs.push(`commands:${id}`);
  }
  for (const id of interruptedCommandIds) {
    refs.push(`commands:${id}`);
  }
  if (verdict === "no_validation_observed") {
    refs.push("commands");
  }
  if (verdict === "command_failed" || verdict === "command_interrupted") {
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
    failedTracedCommandIds: string[];
    interruptedCommandIds: string[];
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
  if (verdict === "command_interrupted") {
    return `Traced command(s) ${details.interruptedCommandIds.join(
      ", "
    )} were interrupted or timed out, and no successful validation command was observed.`;
  }
  if (verdict === "command_failed") {
    return `Traced command(s) ${details.failedTracedCommandIds.join(
      ", "
    )} failed, and no successful validation command was observed.`;
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
  if (snapshot.overallObservation) {
    return snapshot.overallObservation;
  }
  return combineConfidence([
    snapshot.contentObservation ?? "unavailable",
    ignoredFilesConfidence(snapshot.ignoredFiles)
  ]);
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

  reasons.push(...ignoredConfidenceLimitReasons(snapshot.ignoredFiles));

  for (const command of coveringCommands) {
    for (const reason of snapshotLimitReasons(command.gitBefore)) {
      reasons.push(`${command.id} pre-state: ${reason}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      coveringCommands.length === 0
        ? "All Git-reported final changed-file contents were either safely hashed or not applicable, and no confidence-limiting ignored input was observed."
        : "All Git-reported changed-file contents were either safely hashed or not applicable, and no confidence-limiting ignored input was observed for the final or matching validation state."
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

  limits.push(...ignoredObservationLimits(snapshot.ignoredFiles, "receipt.final.ignoredFiles"));

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

  reasons.push(...ignoredConfidenceLimitReasons(snapshot.ignoredFiles));

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

  limits.push(
    ...ignoredObservationLimits(snapshot.ignoredFiles, `${evidencePrefix}.ignoredFiles`, {
      kindPrefix: "command_prestate_"
    })
  );

  return limits;
}

function environmentNotes(
  snapshot: GitStateSnapshot,
  coveringCommands: Array<CommandEvidence & { gitBefore: GitStateSnapshot }>
): NonNullable<FinalStateReceipt["environmentNotes"]> {
  const notes: NonNullable<FinalStateReceipt["environmentNotes"]> = [
    ...ambientEnvironmentNotes(snapshot.ignoredFiles, "receipt.final.ignoredFiles")
  ];

  for (const command of coveringCommands) {
    notes.push(
      ...ambientEnvironmentNotes(
        command.gitBefore.ignoredFiles,
        `commands:${command.id}.gitBefore.ignoredFiles`
      )
    );
  }

  return notes;
}

function ambientEnvironmentNotes(
  ignoredFiles: GitStateSnapshot["ignoredFiles"],
  evidenceRef: string
): NonNullable<FinalStateReceipt["environmentNotes"]> {
  const ambientCount = ignoredFiles?.ambientCount ?? 0;
  if (ambientCount === 0) {
    return [];
  }

  return [
    {
      kind: "ambient_ignored_environment",
      evidenceRef,
      reason:
        ambientCount === 1
          ? "Ambient ignored environment path was present but not read or hashed."
          : `${ambientCount} ambient ignored environment paths were present but not read or hashed.`
    }
  ];
}

function ignoredFilesConfidence(
  ignoredFiles: GitStateSnapshot["ignoredFiles"]
): ContentObservation {
  if (!ignoredFiles || ignoredFiles.mode === "not_present") {
    return "complete";
  }
  if (ignoredFiles.mode === "unavailable") {
    return "unavailable";
  }
  if (
    ignoredFiles.limitsConfidence === true ||
    ignoredFiles.mode === "partial" ||
    ignoredFiles.mode === "not_observed"
  ) {
    return "partial";
  }
  return "complete";
}

function ignoredConfidenceLimitReasons(ignoredFiles: GitStateSnapshot["ignoredFiles"]): string[] {
  if (!ignoredFiles || ignoredFiles.mode === "not_present") {
    return [];
  }
  if (ignoredFiles.mode === "unavailable") {
    return ["Ignored-path observation was unavailable."];
  }

  const reasons: string[] = [];
  const sensitiveLocalCount = ignoredFiles.sensitiveLocalCount ?? 0;
  const unknownCount = ignoredFiles.unknownCount ?? 0;

  if (sensitiveLocalCount > 0) {
    reasons.push(
      sensitiveLocalCount === 1
        ? "One sensitive or local ignored input path was present and not observed; it may affect validation."
        : `${sensitiveLocalCount} sensitive or local ignored input paths were present and not observed; they may affect validation.`
    );
  }
  if (unknownCount > 0) {
    reasons.push(
      unknownCount === 1
        ? "One unknown ignored path was present and not observed; TracePack treats it as confidence-limiting."
        : `${unknownCount} unknown ignored paths were present and not observed; TracePack treats them as confidence-limiting.`
    );
  }

  if (
    reasons.length === 0 &&
    (ignoredFiles.limitsConfidence === true ||
      ignoredFiles.mode === "partial" ||
      ignoredFiles.mode === "not_observed")
  ) {
    reasons.push(ignoredFiles.reason);
  }

  return reasons;
}

function ignoredObservationLimits(
  ignoredFiles: GitStateSnapshot["ignoredFiles"],
  evidenceRef: string,
  options: { kindPrefix?: string } = {}
): NonNullable<FinalStateReceipt["observationLimits"]> {
  if (!ignoredFiles || ignoredFiles.mode === "not_present") {
    return [];
  }

  const limits: NonNullable<FinalStateReceipt["observationLimits"]> = [];
  const prefix = options.kindPrefix ?? "";

  if (ignoredFiles.mode === "unavailable") {
    limits.push({
      kind: `${prefix}ignored_paths_unavailable`,
      evidenceRef,
      reason: "Ignored-path observation was unavailable."
    });
    return limits;
  }

  const sensitiveLocalCount = ignoredFiles.sensitiveLocalCount ?? 0;
  const unknownCount = ignoredFiles.unknownCount ?? 0;

  if (sensitiveLocalCount > 0) {
    limits.push({
      kind: `${prefix}ignored_sensitive_local_inputs_unobserved`,
      evidenceRef,
      reason:
        sensitiveLocalCount === 1
          ? "One sensitive or local ignored input path was present and not observed. Contents were not read."
          : `${sensitiveLocalCount} sensitive or local ignored input paths were present and not observed. Contents were not read.`
    });
  }

  if (unknownCount > 0) {
    limits.push({
      kind: `${prefix}ignored_unknown_paths_unobserved`,
      evidenceRef,
      reason:
        unknownCount === 1
          ? "One unknown ignored path was present and not observed. TracePack treats it as confidence-limiting."
          : `${unknownCount} unknown ignored paths were present and not observed. TracePack treats them as confidence-limiting.`
    });
  }

  if (
    limits.length === 0 &&
    (ignoredFiles.limitsConfidence === true ||
      ignoredFiles.mode === "partial" ||
      ignoredFiles.mode === "not_observed")
  ) {
    limits.push({
      kind: `${prefix}ignored_paths_unobserved`,
      evidenceRef,
      reason: ignoredFiles.reason
    });
  }

  return limits;
}

function commandFailedForReceipt(command: CommandEvidence): boolean {
  return (
    command.exitCode !== 0 &&
    (command.exitCode !== null || !!command.error || command.signal !== null)
  );
}

function commandInterruptedForReceipt(command: CommandEvidence): boolean {
  return command.signal !== null || /timed out|interrupted/i.test(command.error ?? "");
}
