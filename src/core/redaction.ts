import type {
  CommandArgumentRedaction,
  ExcludedEvidence,
  OutputSummary,
  RedactionReplacement,
  RedactionReport,
  RedactionSummary
} from "./manifest.js";
import { classifyIgnoredPath } from "./paths.js";

const OUTPUT_LIMIT_BYTES = 24_000;
const REDACTED_PREFIX = "[REDACTED:";
const COMMAND_SECRET_KEY =
  "(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|token|secret|client[_-]?secret|password|passwd|authorization)";

const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  replacement?: (...args: string[]) => string;
}> = [
  { name: "openai_api_key_like", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "github_token_like", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "aws_access_key_like", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "authorization_bearer_token_like",
    pattern: /\b(Authorization\s*:\s*Bearer\s+)(?!\[REDACTED:)[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: (_match, prefix) => `${prefix}[REDACTED:authorization_bearer_token_like]`
  },
  {
    name: "assignment_secret_like",
    pattern: new RegExp(
      `\\b(${COMMAND_SECRET_KEY}\\b\\s*[:=]\\s*["']?)(?!\\[REDACTED:)([^"'\\s&]{8,})`,
      "gi"
    ),
    replacement: (_match, prefix) => `${prefix}[REDACTED:assignment_secret_like]`
  },
  {
    name: "private_key_block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  }
];

export function redactText(input: string): { text: string; replacements: RedactionReplacement[] } {
  let text = input;
  const replacements: RedactionReplacement[] = [];

  for (const { name, pattern, replacement } of SECRET_PATTERNS) {
    let count = 0;
    text = text.replace(pattern, (...args: string[]) => {
      count += 1;
      return replacement ? replacement(...args) : `[REDACTED:${name}]`;
    });
    if (count > 0) {
      replacements.push({ pattern: name, count });
    }
  }

  return { text, replacements };
}

export function sanitizeCommandArgv(argv: readonly string[]): {
  argv: string[];
  redaction: CommandArgumentRedaction;
} {
  const sanitized: string[] = [];
  const replacements = new Map<string, number>();
  const redactedArgumentIndexes = new Set<number>();
  let redactCurrentAs: string | undefined;
  let pendingAuthorizationBearer = false;

  for (let index = 0; index < argv.length; index += 1) {
    const original = argv[index] ?? "";
    let value = original;
    const startingReplacementCount = totalReplacementCount(replacements);

    if (pendingAuthorizationBearer && !/^bearer$/i.test(original)) {
      pendingAuthorizationBearer = false;
    }

    if (pendingAuthorizationBearer && /^bearer$/i.test(original)) {
      pendingAuthorizationBearer = false;
      redactCurrentAs = "authorization_bearer_token_like";
    } else if (redactCurrentAs) {
      const redacted = redactSensitiveArgumentValue(original, redactCurrentAs);
      value = redacted.text;
      addReplacements(replacements, redacted.replacements);
      redactCurrentAs = undefined;
      pendingAuthorizationBearer = false;
    } else {
      const redacted = redactText(original);
      value = redacted.text;
      addReplacements(replacements, redacted.replacements);

      if (value === original && looksLikeSensitivePathArg(original)) {
        value = "[REDACTED:sensitive_path_argument]";
        addReplacement(replacements, "sensitive_path_argument", 1);
      }
    }

    sanitized.push(value);
    if (value !== original || totalReplacementCount(replacements) !== startingReplacementCount) {
      redactedArgumentIndexes.add(index);
    }

    if (redactCurrentAs === undefined && isSensitiveSeparatedOption(original)) {
      redactCurrentAs = "sensitive_argument_value";
    } else if (redactCurrentAs === undefined && isAuthorizationPrefix(original)) {
      pendingAuthorizationBearer = true;
    } else if (redactCurrentAs === undefined && isAuthorizationBearerPrefix(original)) {
      redactCurrentAs = "authorization_bearer_token_like";
    }
  }

  const mergedReplacements = [...replacements.entries()].map(([pattern, count]) => ({
    pattern,
    count
  }));
  const argumentsRedacted = redactedArgumentIndexes.size > 0;

  return {
    argv: sanitized,
    redaction: {
      argumentsRedacted,
      redactedArgumentCount: redactedArgumentIndexes.size,
      reproductionMayRequireLocalValues: argumentsRedacted,
      replacements: mergedReplacements
    }
  };
}

export function quoteCommandArgv(argv: readonly string[]): string {
  return argv.map((arg) => (/[ \t"'`]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
}

export function safeCommandText(argv: readonly string[]): string {
  return quoteCommandArgv(sanitizeCommandArgv(argv).argv);
}

export function sanitizeCommandString(input: string): string {
  let text = redactText(input).text;
  text = text.replace(
    new RegExp(
      `((?:^|\\s)--?${COMMAND_SECRET_KEY}\\s+)(?!\\[REDACTED:)(?:"[^"]*"|'[^']*'|\\S+)`,
      "gi"
    ),
    (_match, prefix: string) => `${prefix}[REDACTED:sensitive_argument_value]`
  );
  text = text.replace(
    /\b(Authorization\s*:\s*Bearer\s+)(?!\[REDACTED:)[A-Za-z0-9._~+/=-]{8,}/gi,
    (_match, prefix: string) => `${prefix}[REDACTED:authorization_bearer_token_like]`
  );
  return text;
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
  notes: string[] = [],
  argumentRedactions: CommandArgumentRedaction[] = []
): RedactionSummary {
  const outputReplacementCount = outputs.reduce(
    (count, output) =>
      count +
      output.replacements.reduce((innerCount, replacement) => innerCount + replacement.count, 0),
    0
  );
  const argumentReplacementCount = argumentRedactions.reduce(
    (count, redaction) =>
      count +
      redaction.replacements.reduce((innerCount, replacement) => innerCount + replacement.count, 0),
    0
  );
  const redactedArgumentCount = argumentRedactions.reduce(
    (count, redaction) => count + redaction.redactedArgumentCount,
    0
  );
  const reproductionMayRequireLocalValues = argumentRedactions.some(
    (redaction) => redaction.reproductionMayRequireLocalValues
  );
  const replacementCount = outputReplacementCount + argumentReplacementCount;

  return {
    applied: replacementCount > 0 || excludedEvidence.length > 0,
    replacementCount,
    excludedEvidenceCount: excludedEvidence.length,
    outputTruncated: outputs.some((output) => output.truncated),
    argumentReplacementCount,
    redactedArgumentCount,
    reproductionMayRequireLocalValues,
    notes
  };
}

export function mergeReplacements(
  outputs: OutputSummary[],
  argumentRedactions: CommandArgumentRedaction[] = []
): RedactionReplacement[] {
  const counts = new Map<string, number>();
  for (const output of outputs) {
    for (const replacement of output.replacements) {
      counts.set(replacement.pattern, (counts.get(replacement.pattern) ?? 0) + replacement.count);
    }
  }
  for (const redaction of argumentRedactions) {
    addReplacements(counts, redaction.replacements);
  }

  return [...counts.entries()].map(([pattern, count]) => ({ pattern, count }));
}

export function createRedactionReport(params: {
  runId: string;
  outputs: OutputSummary[];
  excludedEvidence: ExcludedEvidence[];
  argumentRedactions?: CommandArgumentRedaction[];
  notes?: string[];
}): RedactionReport {
  const argumentRedactions = params.argumentRedactions ?? [];
  const argumentsRedacted = argumentRedactions.some((redaction) => redaction.argumentsRedacted);
  const notes = [
    "Redaction is best effort and is not a guarantee that every sensitive value was removed.",
    "TracePack does not read .env contents, SSH keys, browser cookie stores, or credential files by default.",
    ...(argumentsRedacted
      ? [
          "Command arguments and reproduction commands are sanitized before persistence when TracePack recognizes sensitive-looking values.",
          "Commands containing redacted arguments may require locally supplied values before they can be rerun."
        ]
      : []),
    ...(params.notes ?? [])
  ];

  return {
    schemaVersion: "tracepack.redaction-report.v0.1",
    runId: params.runId,
    generatedAt: new Date().toISOString(),
    summary: combineRedactionSummaries(
      params.outputs,
      params.excludedEvidence,
      notes,
      argumentRedactions
    ),
    replacements: mergeReplacements(params.outputs, argumentRedactions),
    excludedEvidence: params.excludedEvidence,
    notes
  };
}

function redactSensitiveArgumentValue(
  value: string,
  fallbackPattern: string
): { text: string; replacements: RedactionReplacement[] } {
  if (value.startsWith(REDACTED_PREFIX)) {
    return { text: value, replacements: [] };
  }

  const redacted = redactText(value);
  if (redacted.replacements.length > 0) {
    return redacted;
  }

  return {
    text: `[REDACTED:${fallbackPattern}]`,
    replacements: [{ pattern: fallbackPattern, count: 1 }]
  };
}

function isSensitiveSeparatedOption(arg: string): boolean {
  return new RegExp(`^--?${COMMAND_SECRET_KEY}$`, "i").test(arg);
}

function isAuthorizationBearerPrefix(arg: string): boolean {
  return /^authorization\s*:\s*bearer$/i.test(arg);
}

function isAuthorizationPrefix(arg: string): boolean {
  return /^authorization\s*:$/i.test(arg);
}

function looksLikeSensitivePathArg(arg: string): boolean {
  if (arg.startsWith(REDACTED_PREFIX)) {
    return false;
  }

  const candidates = arg
    .split(/[\s="'`(),;]+/)
    .flatMap((part) => part.split("="))
    .map((part) => part.trim())
    .filter(Boolean);

  return candidates.some((candidate) => classifyIgnoredPath(candidate) === "sensitive_local_input");
}

function addReplacements(counts: Map<string, number>, replacements: RedactionReplacement[]): void {
  for (const replacement of replacements) {
    addReplacement(counts, replacement.pattern, replacement.count);
  }
}

function addReplacement(counts: Map<string, number>, pattern: string, count: number): void {
  counts.set(pattern, (counts.get(pattern) ?? 0) + count);
}

function totalReplacementCount(replacements: Map<string, number>): number {
  return [...replacements.values()].reduce(
    (count, replacementCount) => count + replacementCount,
    0
  );
}
