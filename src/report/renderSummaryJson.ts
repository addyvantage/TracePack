import type {
  RedactionReport,
  TracePackManifest,
  ValidationReceiptVerdict
} from "../core/manifest.js";

export const SUMMARY_SCHEMA_VERSION = "tracepack.summary.v0.1";

export type TracePackSummaryJson = {
  schemaVersion: typeof SUMMARY_SCHEMA_VERSION;
  tracePackVersion: string;
  manifestSchemaVersion: string;
  run: {
    id: string;
    label?: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  commands: {
    total: number;
    validation: number;
    possibleValidation: number;
    nonValidation: number;
    unknown: number;
    succeeded: number;
    failed: number;
  };
  warnings: {
    total: number;
    ids: string[];
    byLabel: Array<{ label: string; count: number }>;
  };
  receipt: {
    present: boolean;
    schemaVersion?: string;
    verdict: ValidationReceiptVerdict;
    observationConfidence: string;
    changedContentObservation: string;
    finalFingerprintShort?: string;
    coveringCommandIds: string[];
    staleCommandIds: string[];
    failedCommandIds: string[];
    limitedCommandIds: string[];
    explanation?: string;
  };
  finalState: {
    branch: string | null;
    head: string | null;
    dirty: boolean;
    statusSummary: string;
    changedFileCount: number;
    changedFileCounts: Array<{ status: string; count: number }>;
    diffStat: TracePackManifest["git"]["after"]["diffStat"];
    contentObservation?: string;
    overallObservation?: string;
    ignoredFilesMode?: string;
  };
  redaction: {
    applied: boolean;
    replacementCount: number;
    excludedEvidenceCount: number;
    outputTruncated: boolean;
    notes: string[];
  };
  limitations: string[];
};

export function renderSummaryJson(
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): TracePackSummaryJson {
  const commands = commandCounts(manifest);

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    tracePackVersion: manifest.TracePackVersion,
    manifestSchemaVersion: manifest.schemaVersion,
    run: {
      id: manifest.runId,
      ...(manifest.label ? { label: manifest.label } : {}),
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      durationMs: manifest.durationMs
    },
    commands,
    warnings: {
      total: manifest.warnings.length,
      ids: manifest.warnings.map((warning) => warning.id),
      byLabel: sortedCounts(manifest.warnings.map((warning) => warning.label))
    },
    receipt: receiptSummary(manifest),
    finalState: finalStateSummary(manifest),
    redaction: {
      applied: redactionReport.summary.applied,
      replacementCount: redactionReport.summary.replacementCount,
      excludedEvidenceCount: redactionReport.summary.excludedEvidenceCount,
      outputTruncated: redactionReport.summary.outputTruncated,
      notes: redactionReport.notes
    },
    limitations: manifest.limitations
  };
}

function commandCounts(manifest: TracePackManifest): TracePackSummaryJson["commands"] {
  return {
    total: manifest.commands.length,
    validation: manifest.commands.filter((command) => command.classification === "validation")
      .length,
    possibleValidation: manifest.commands.filter(
      (command) => command.classification === "possible_validation"
    ).length,
    nonValidation: manifest.commands.filter(
      (command) => command.classification === "non_validation"
    ).length,
    unknown: manifest.commands.filter((command) => command.classification === "unknown").length,
    succeeded: manifest.commands.filter((command) => command.exitCode === 0).length,
    failed: manifest.commands.filter(
      (command) =>
        command.exitCode !== 0 &&
        (command.exitCode !== null || !!command.error || command.signal !== null)
    ).length
  };
}

function receiptSummary(manifest: TracePackManifest): TracePackSummaryJson["receipt"] {
  if (!("receipt" in manifest)) {
    return {
      present: false,
      verdict: "inconclusive",
      observationConfidence: "unavailable",
      changedContentObservation: "unavailable",
      coveringCommandIds: [],
      staleCommandIds: [],
      failedCommandIds: [],
      limitedCommandIds: [],
      explanation: "Legacy manifest without a final-state validation receipt."
    };
  }

  return {
    present: true,
    schemaVersion: manifest.receipt.schemaVersion,
    verdict: manifest.receipt.verdict,
    observationConfidence: manifest.receipt.observationConfidence ?? "unavailable",
    changedContentObservation: manifest.receipt.changedContentObservation ?? "unavailable",
    finalFingerprintShort: manifest.receipt.final.fingerprint?.short,
    coveringCommandIds: manifest.receipt.coveringCommandIds,
    staleCommandIds: manifest.receipt.staleCommandIds,
    failedCommandIds: manifest.receipt.failedCommandIds,
    limitedCommandIds: manifest.receipt.limitedCommandIds ?? [],
    explanation: manifest.receipt.explanation
  };
}

function finalStateSummary(manifest: TracePackManifest): TracePackSummaryJson["finalState"] {
  const final = "receipt" in manifest ? manifest.receipt.final : undefined;

  return {
    branch: manifest.git.after.branch,
    head: manifest.git.after.head,
    dirty: manifest.git.after.dirty,
    statusSummary: manifest.git.after.statusSummary,
    changedFileCount: manifest.git.after.changedFiles.length,
    changedFileCounts: Object.entries(manifest.git.after.changedFileCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => left.status.localeCompare(right.status)),
    diffStat: manifest.git.after.diffStat,
    contentObservation: final?.contentObservation,
    overallObservation: final?.overallObservation,
    ignoredFilesMode: final?.ignoredFiles?.mode
  };
}

function sortedCounts(values: string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
