import { z } from "zod";

export const TRACEPACK_VERSION = "0.3.0";
export const MANIFEST_SCHEMA_VERSION_V0_1 = "tracepack.manifest.v0.1";
export const MANIFEST_SCHEMA_VERSION_V0_2 = "tracepack.manifest.v0.2";
export const MANIFEST_SCHEMA_VERSION = "tracepack.manifest.v0.3";
export const SESSION_SCHEMA_VERSION = "tracepack.session.v0.1";

export const EvidenceLabelSchema = z.enum([
  "observed",
  "not_observed",
  "needs_human_review",
  "command_failed",
  "redacted",
  "excluded",
  "successful_validation",
  "failed_validation",
  "possible_validation_observed"
]);

export const CommandClassificationSchema = z.enum([
  "validation",
  "possible_validation",
  "non_validation",
  "unknown"
]);

export const SafePathDescriptorSchema = z.object({
  label: z.string(),
  pathHash: z.string(),
  representation: z.enum(["basename", "relative", "hash_only"])
});

export const RedactionReplacementSchema = z.object({
  pattern: z.string(),
  count: z.number().int().nonnegative()
});

export const OutputSummarySchema = z.object({
  text: z.string(),
  originalBytes: z.number().int().nonnegative(),
  capturedBytes: z.number().int().nonnegative(),
  omittedBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  redacted: z.boolean(),
  replacements: z.array(RedactionReplacementSchema)
});

export const RedactionSummarySchema = z.object({
  applied: z.boolean(),
  replacementCount: z.number().int().nonnegative(),
  excludedEvidenceCount: z.number().int().nonnegative(),
  outputTruncated: z.boolean(),
  notes: z.array(z.string())
});

export const ExcludedEvidenceSchema = z.object({
  kind: z.string(),
  path: z.string().optional(),
  reason: z.string()
});

export const ChangedFileSchema = z.object({
  path: z.string(),
  status: z.string(),
  previousPath: z.string().optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  mtime: z.string().optional(),
  sha256: z.string().optional(),
  contentHashStatus: z.enum(["hashed", "not_hashed", "not_applicable", "excluded"]).optional(),
  contentHashReason: z.string().optional(),
  excluded: z.boolean(),
  exclusionReason: z.string().optional(),
  looksLikeTest: z.boolean()
});

export const DiffStatSchema = z.object({
  filesChanged: z.number().int().nonnegative().optional(),
  insertions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  unavailableReason: z.string().optional()
});

export const GitEvidenceSchema = z.object({
  available: z.boolean(),
  isRepository: z.boolean(),
  root: SafePathDescriptorSchema.optional(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  dirty: z.boolean(),
  statusSummary: z.string(),
  changedFiles: z.array(ChangedFileSchema),
  changedFileCounts: z.record(z.string(), z.number().int().nonnegative()),
  diffStat: DiffStatSchema,
  excludedEvidence: z.array(ExcludedEvidenceSchema)
});

export const StateFingerprintSchema = z.object({
  algorithm: z.literal("tracepack.state-fingerprint.v1"),
  value: z.string(),
  short: z.string(),
  canonicalFields: z.array(z.string())
});

export const ContentObservationSchema = z.enum(["complete", "partial", "unavailable"]);

export const ChangedFileObservationSchema = z.object({
  path: z.string(),
  status: z.string(),
  reason: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  evidenceRef: z.string()
});

export const IgnoredFilesObservationSchema = z.object({
  mode: z.literal("not_observed"),
  reason: z.string()
});

export const GitStateSnapshotSchema = z.object({
  capturedAt: z.string(),
  git: GitEvidenceSchema,
  fingerprint: StateFingerprintSchema.optional(),
  contentObservation: ContentObservationSchema.optional(),
  observedChangedFiles: z.array(ChangedFileObservationSchema).optional(),
  unobservedChangedFiles: z.array(ChangedFileObservationSchema).optional(),
  excludedChangedFiles: z.array(ChangedFileObservationSchema).optional(),
  ignoredFiles: IgnoredFilesObservationSchema.optional(),
  limitations: z.array(z.string())
});

export const CommandEvidenceSchema = z.object({
  id: z.string(),
  argv: z.array(z.string()).min(1),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  error: z.string().optional(),
  stdout: OutputSummarySchema,
  stderr: OutputSummarySchema,
  classification: CommandClassificationSchema,
  evidence: EvidenceLabelSchema,
  redaction: RedactionSummarySchema,
  gitBefore: GitStateSnapshotSchema.optional(),
  gitAfter: GitStateSnapshotSchema.optional()
});

export const ValidationReceiptVerdictSchema = z.enum([
  "validated_final_state",
  "validation_stale",
  "validation_failed",
  "no_validation_observed",
  "inconclusive"
]);

export const FinalStateReceiptSchema = z.object({
  schemaVersion: z.enum(["tracepack.receipt.v0.1", "tracepack.receipt.v0.2"]),
  baseline: GitStateSnapshotSchema,
  final: GitStateSnapshotSchema,
  verdict: ValidationReceiptVerdictSchema,
  observationConfidence: ContentObservationSchema.optional(),
  confidenceReasons: z.array(z.string()).optional(),
  coveringCommandIds: z.array(z.string()),
  staleCommandIds: z.array(z.string()),
  failedCommandIds: z.array(z.string()),
  limitedCommandIds: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.string()),
  explanation: z.string(),
  limitations: z.array(z.string())
});

export const WarningSchema = z.object({
  id: z.string(),
  title: z.string(),
  trigger: z.string(),
  evidenceRefs: z.array(z.string()),
  humanReview: z.string(),
  limitation: z.string().optional(),
  label: EvidenceLabelSchema
});

const ManifestBaseSchema = z.object({
  TracePackVersion: z.string(),
  runId: z.string(),
  label: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  environment: z.object({
    node: z.string(),
    platform: z.string(),
    arch: z.string(),
    shell: z.string().optional(),
    cwd: SafePathDescriptorSchema
  }),
  git: z.object({
    before: GitEvidenceSchema,
    after: GitEvidenceSchema
  }),
  commands: z.array(CommandEvidenceSchema),
  warnings: z.array(WarningSchema),
  redaction: RedactionSummarySchema,
  reproduction: z.object({
    commands: z.array(z.string()),
    notes: z.array(z.string())
  }),
  limitations: z.array(z.string())
});

export const ManifestV01Schema = ManifestBaseSchema.extend({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION_V0_1)
});

export const ManifestV02Schema = ManifestBaseSchema.extend({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION_V0_2),
  receipt: FinalStateReceiptSchema
});

export const ManifestV03Schema = ManifestBaseSchema.extend({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  receipt: FinalStateReceiptSchema
});

export const ManifestSchema = z.union([ManifestV03Schema, ManifestV02Schema, ManifestV01Schema]);

export const RedactionReportSchema = z.object({
  schemaVersion: z.literal("tracepack.redaction-report.v0.1"),
  runId: z.string(),
  generatedAt: z.string(),
  summary: RedactionSummarySchema,
  replacements: z.array(RedactionReplacementSchema),
  excludedEvidence: z.array(ExcludedEvidenceSchema),
  notes: z.array(z.string())
});

export type EvidenceLabel = z.infer<typeof EvidenceLabelSchema>;
export type CommandClassification = z.infer<typeof CommandClassificationSchema>;
export type SafePathDescriptor = z.infer<typeof SafePathDescriptorSchema>;
export type OutputSummary = z.infer<typeof OutputSummarySchema>;
export type RedactionReplacement = z.infer<typeof RedactionReplacementSchema>;
export type RedactionSummary = z.infer<typeof RedactionSummarySchema>;
export type ExcludedEvidence = z.infer<typeof ExcludedEvidenceSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type GitEvidence = z.infer<typeof GitEvidenceSchema>;
export type StateFingerprint = z.infer<typeof StateFingerprintSchema>;
export type ContentObservation = z.infer<typeof ContentObservationSchema>;
export type ChangedFileObservation = z.infer<typeof ChangedFileObservationSchema>;
export type GitStateSnapshot = z.infer<typeof GitStateSnapshotSchema>;
export type CommandEvidence = z.infer<typeof CommandEvidenceSchema>;
export type ValidationReceiptVerdict = z.infer<typeof ValidationReceiptVerdictSchema>;
export type FinalStateReceipt = z.infer<typeof FinalStateReceiptSchema>;
export type WarningEntry = z.infer<typeof WarningSchema>;
export type TracePackManifestV01 = z.infer<typeof ManifestV01Schema>;
export type TracePackManifestV02 = z.infer<typeof ManifestV02Schema>;
export type TracePackManifestV03 = z.infer<typeof ManifestV03Schema>;
export type TracePackManifest = z.infer<typeof ManifestSchema>;
export type RedactionReport = z.infer<typeof RedactionReportSchema>;

export function validateManifest(value: unknown): TracePackManifest {
  return ManifestSchema.parse(value);
}

export function validateRedactionReport(value: unknown): RedactionReport {
  return RedactionReportSchema.parse(value);
}
