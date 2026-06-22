import type {
  ExcludedEvidence,
  OutputSummary,
  RedactionReplacement,
  RedactionReport,
  RedactionSummary
} from "./manifest.js";

const OUTPUT_LIMIT_BYTES = 24_000;

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "openai_api_key_like", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "github_token_like", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "aws_access_key_like", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "assignment_secret_like",
    pattern:
      /\b(api[_-]?key|token|secret|password|passwd|authorization)\b\s*[:=]\s*["']?[^"'\s]{8,}/gi
  },
  {
    name: "private_key_block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  }
];

export function redactText(input: string): { text: string; replacements: RedactionReplacement[] } {
  let text = input;
  const replacements: RedactionReplacement[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    let count = 0;
    text = text.replace(pattern, () => {
      count += 1;
      return `[REDACTED:${name}]`;
    });
    if (count > 0) {
      replacements.push({ pattern: name, count });
    }
  }

  return { text, replacements };
}

export function summarizeOutput(
  input: string,
  limitBytes = OUTPUT_LIMIT_BYTES,
  observedOriginalBytes?: number
): OutputSummary {
  const originalBytes = observedOriginalBytes ?? Buffer.byteLength(input, "utf8");
  let clipped = input;
  let truncated = false;

  if (originalBytes > limitBytes) {
    truncated = true;
    clipped = Buffer.from(input, "utf8").subarray(0, limitBytes).toString("utf8");
  }

  const redacted = redactText(clipped);
  const capturedBytes = Buffer.byteLength(redacted.text, "utf8");

  return {
    text: redacted.text,
    originalBytes,
    capturedBytes,
    omittedBytes: Math.max(0, originalBytes - limitBytes),
    truncated,
    redacted: redacted.replacements.length > 0,
    replacements: redacted.replacements
  };
}

export function combineRedactionSummaries(
  outputs: OutputSummary[],
  excludedEvidence: ExcludedEvidence[] = [],
  notes: string[] = []
): RedactionSummary {
  const replacementCount = outputs.reduce(
    (count, output) =>
      count +
      output.replacements.reduce((innerCount, replacement) => innerCount + replacement.count, 0),
    0
  );

  return {
    applied: replacementCount > 0 || excludedEvidence.length > 0,
    replacementCount,
    excludedEvidenceCount: excludedEvidence.length,
    outputTruncated: outputs.some((output) => output.truncated),
    notes
  };
}

export function mergeReplacements(outputs: OutputSummary[]): RedactionReplacement[] {
  const counts = new Map<string, number>();
  for (const output of outputs) {
    for (const replacement of output.replacements) {
      counts.set(replacement.pattern, (counts.get(replacement.pattern) ?? 0) + replacement.count);
    }
  }

  return [...counts.entries()].map(([pattern, count]) => ({ pattern, count }));
}

export function createRedactionReport(params: {
  runId: string;
  outputs: OutputSummary[];
  excludedEvidence: ExcludedEvidence[];
  notes?: string[];
}): RedactionReport {
  const notes = [
    "Redaction is best effort and is not a guarantee that every sensitive value was removed.",
    "TracePack does not read .env contents, SSH keys, browser cookie stores, or credential files by default.",
    ...(params.notes ?? [])
  ];

  return {
    schemaVersion: "tracepack.redaction-report.v0.1",
    runId: params.runId,
    generatedAt: new Date().toISOString(),
    summary: combineRedactionSummaries(params.outputs, params.excludedEvidence, notes),
    replacements: mergeReplacements(params.outputs),
    excludedEvidence: params.excludedEvidence,
    notes
  };
}
