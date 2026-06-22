import { z } from "zod";

export const TRACEPACK_VERSION = "0.1.0";
export const MANIFEST_SCHEMA_VERSION = "tracepack.manifest.v0.1";
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
  redaction: RedactionSummarySchema
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

export const ManifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  tracepackVersion: z.string(),
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
export type CommandEvidence = z.infer<typeof CommandEvidenceSchema>;
export type WarningEntry = z.infer<typeof WarningSchema>;
export type TracepackManifest = z.infer<typeof ManifestSchema>;
export type RedactionReport = z.infer<typeof RedactionReportSchema>;

export function validateManifest(value: unknown): TracepackManifest {
  return ManifestSchema.parse(value);
}

export function validateRedactionReport(value: unknown): RedactionReport {
  return RedactionReportSchema.parse(value);
}
