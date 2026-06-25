import type {
  CommandEvidence,
  FinalStateReceipt,
  GitStateSnapshot,
  RedactionReport,
  TracePackManifest,
  WarningEntry
} from "../core/manifest.js";
import {
  CANONICAL_LIMITATION_STATEMENT,
  displayVerdictForManifest,
  type DisplayVerdict
} from "../core/display.js";
import {
  commandExitText,
  commandFailed,
  formatObservationConfidenceMeaning
} from "../core/format.js";
import { redactText, safeCommandText, sanitizeCommandString } from "../core/redaction.js";
import { reportStyles } from "./styles.js";

type MatrixState = "Observed" | "Not observed" | "Needs human review" | "Failed" | "Excluded";

type TimelineEvidence = {
  baseline: GitStateSnapshot | undefined;
  validation: CommandEvidence | undefined;
  final: GitStateSnapshot | undefined;
};

export function renderHtmlReport(
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): string {
  const verdict = displayVerdictForManifest(manifest);
  const timeline = timelineEvidence(manifest);
  const receiptOpen = verdict.key !== "final_state_validation_observed" ? " open" : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tracepack Report ${escapeHtml(manifest.runId)}</title>
  <style>${reportStyles}</style>
</head>
<body>
<main>
  ${reportHeader(manifest, redactionReport)}
  ${heroSection(manifest, verdict)}
  ${timelineSection(timeline, verdict)}
  ${humanReviewStrip(manifest)}
  ${evidenceMatrix(manifest, redactionReport, verdict)}
  ${receiptDetail(manifest, receiptOpen)}
  ${commandsObservedSection(manifest)}
  ${finalGitSection(manifest)}
  ${warningsSection(manifest)}
  ${observationSection(manifest)}
  ${redactionSection(redactionReport)}
  ${reproductionSection(manifest)}
  <footer class="tp-footer">
    <p>${escapeHtml(CANONICAL_LIMITATION_STATEMENT)}</p>
  </footer>
</main>
</body>
</html>`;
}

function reportHeader(manifest: TracePackManifest, redactionReport: RedactionReport): string {
  const redactedCount =
    redactionReport.summary.replacementCount +
    redactionReport.summary.excludedEvidenceCount +
    (redactionReport.summary.outputTruncated ? 1 : 0);

  return `<header class="tp-header">
    <div class="tp-wordmark">Tracepack</div>
    <div class="tp-header-meta" aria-label="Run metadata">
      <span>Run <code>${escapeHtml(manifest.runId)}</code></span>
      ${manifest.label ? `<span>Label <code>${escapeHtml(manifest.label)}</code></span>` : ""}
      <span>Finished <time datetime="${escapeHtml(manifest.finishedAt)}">${escapeHtml(manifest.finishedAt)}</time></span>
      <a class="tp-chip" href="#redaction">Redacted · <strong>${redactedCount}</strong></a>
    </div>
  </header>`;
}

function heroSection(manifest: TracePackManifest, verdict: DisplayVerdict): string {
  return `<section class="tp-hero" data-state="${escapeHtml(verdict.stateWord)}" aria-labelledby="tracepack-verdict">
    <div>
      <h1 id="tracepack-verdict">${escapeHtml(verdict.headline)}</h1>
      <p>${escapeHtml(verdict.explanation)}</p>
      <div class="tp-fingerprint">
        <span class="tp-chip"><strong>Final state</strong> <code>${escapeHtml(finalFingerprint(manifest))}</code></span>
      </div>
    </div>
    <div class="tp-hero-glyph" aria-hidden="true">${escapeHtml(verdict.glyph)}</div>
  </section>`;
}

function timelineSection(evidence: TimelineEvidence, verdict: DisplayVerdict): string {
  const baseline = evidence.baseline;
  const validation = evidence.validation;
  const final = evidence.final;
  const validationState = validation
    ? commandFailed(validation)
      ? "failed"
      : "observed"
    : "not-observed";
  const finalState =
    verdict.key === "final_state_validation_observed"
      ? "observed"
      : verdict.key === "validation_command_failed"
        ? "failed"
        : verdict.key === "repository_evidence_unavailable"
          ? "neutral"
          : "not-observed";
  const connection = timelineConnection(verdict);

  return `<section aria-labelledby="timeline-title">
    <h2 id="timeline-title">Evidence timeline</h2>
    <ol class="tp-timeline">
      <li data-state="neutral">
        <div class="tp-node"><span class="tp-node-marker" aria-hidden="true"></span><span class="tp-timeline-title">Baseline</span></div>
        <p>${fingerprintLine("Baseline", baseline?.fingerprint?.short)}</p>
        <p class="tp-small">${baseline ? `Captured ${escapeHtml(baseline.capturedAt)}` : "Baseline repository evidence was not available."}</p>
      </li>
      <li data-state="${validationState}">
        <div class="tp-node"><span class="tp-node-marker" aria-hidden="true"></span><span class="tp-timeline-title">Last validation observed</span></div>
        ${validation ? validationCommandSummary(validation) : `<p>${stateLabel("Not observed")}</p><p class="tp-small">No command classified as validation was captured.</p>`}
      </li>
      <li data-state="${finalState}">
        <div class="tp-node"><span class="tp-node-marker" aria-hidden="true"></span><span class="tp-timeline-title">Final state</span></div>
        <p>${fingerprintLine("Final", final?.fingerprint?.short)}</p>
        <p class="tp-small">${finalStatePhrase(verdict, validation, final)}</p>
        <div class="tp-timeline-connector" data-connection="${escapeHtml(connection.kind)}">${escapeHtml(connection.label)}</div>
      </li>
    </ol>
  </section>`;
}

function humanReviewStrip(manifest: TracePackManifest): string {
  const topWarning = manifest.warnings[0];
  if (!topWarning) {
    return `<section class="tp-strip" data-state="neutral" aria-label="Human review focus">
      <span class="tp-strip-icon" aria-hidden="true">·</span>
      <p><strong>No deterministic review trigger.</strong></p>
    </section>`;
  }

  const remaining = manifest.warnings.length - 1;
  return `<section class="tp-strip" data-state="needs-review" aria-label="Human review focus">
    <span class="tp-strip-icon" aria-hidden="true">⚠</span>
    <p><strong>Needs human review:</strong> ${escapeHtml(topWarning.title)}${remaining > 0 ? ` <a href="#warnings">+${remaining} more below</a>` : ` <a href="#warnings">Details below</a>`}</p>
  </section>`;
}

function evidenceMatrix(
  manifest: TracePackManifest,
  redactionReport: RedactionReport,
  verdict: DisplayVerdict
): string {
  const validationCommands = manifest.commands.filter(
    (command) => command.classification === "validation"
  );
  const failedValidationCommands = validationCommands.filter(commandFailed);
  const testWarnings = manifest.warnings.filter((warning) => warning.id !== "TP001");
  const untrackedFiles = manifest.git.after.changedFiles.filter((file) =>
    file.status.includes("?")
  );
  const redactionEvents =
    redactionReport.summary.replacementCount +
    redactionReport.summary.excludedEvidenceCount +
    (redactionReport.summary.outputTruncated ? 1 : 0);

  const rows: Array<{ name: string; state: MatrixState; detail: string }> = [
    {
      name: "Final Git state",
      state:
        manifest.git.after.available && manifest.git.after.isRepository
          ? "Observed"
          : "Not observed",
      detail: `${manifest.git.after.branch ?? "branch not observed"} · ${finalFingerprint(manifest)}`
    },
    {
      name: "Validation commands",
      state:
        failedValidationCommands.length > 0
          ? "Failed"
          : validationCommands.length > 0
            ? "Observed"
            : "Not observed",
      detail:
        validationCommands.length > 0
          ? `${validationCommands.length} validation command(s) captured`
          : "No command was classified as validation."
    },
    {
      name: "Validation covered final state",
      state:
        verdict.key === "final_state_validation_observed"
          ? "Observed"
          : verdict.key === "validation_command_failed"
            ? "Failed"
            : "Not observed",
      detail: verdict.explanation
    },
    {
      name: "Test-related changes",
      state: testWarnings.length > 0 ? "Needs human review" : "Not observed",
      detail:
        testWarnings.length > 0
          ? `${testWarnings.length} deterministic review trigger(s)`
          : "No deterministic test-related change warning."
    },
    {
      name: "Untracked files",
      state: untrackedFiles.length > 0 ? "Observed" : "Not observed",
      detail:
        untrackedFiles.length > 0
          ? `${untrackedFiles.length} untracked changed path(s)`
          : "No untracked changed path was reported by Git."
    },
    {
      name: "Redaction",
      state: redactionEvents > 0 ? "Observed" : "Not observed",
      detail: `${redactionReport.summary.replacementCount} replacement(s), ${redactionReport.summary.excludedEvidenceCount} excluded evidence item(s)`
    },
    {
      name: "Reproduction",
      state: manifest.reproduction.commands.length > 0 ? "Observed" : "Not observed",
      detail:
        manifest.reproduction.commands.length > 0
          ? `${manifest.reproduction.commands.length} sanitized command(s)`
          : "No command was captured for reproduction."
    }
  ];

  return `<section aria-labelledby="matrix-title">
    <h2 id="matrix-title">Evidence matrix</h2>
    <table class="tp-matrix">
      <caption class="tp-sr-only">Categorical Tracepack evidence states</caption>
      <thead><tr><th scope="col">Evidence</th><th scope="col">State</th><th scope="col">Context</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr>
          <th scope="row">${escapeHtml(row.name)}</th>
          <td>${stateLabel(row.state)}</td>
          <td>${escapeHtml(row.detail)}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </section>`;
}

function receiptDetail(manifest: TracePackManifest, openAttribute: string): string {
  if (!("receipt" in manifest)) {
    return `<section aria-labelledby="receipt-detail-title">
      <h2 id="receipt-detail-title">Final-state receipt detail</h2>
      <details open>
        <summary>Legacy bundle detail</summary>
        <p>${stateLabel("Not observed")} This legacy manifest does not include a final-state validation receipt.</p>
      </details>
    </section>`;
  }

  const receipt = manifest.receipt;
  const confidence = receipt.observationConfidence ?? "unavailable";
  const limited = receipt.limitedCommandIds ?? [];

  return `<section aria-labelledby="receipt-detail-title">
    <h2 id="receipt-detail-title">Final-state receipt detail</h2>
    <details${openAttribute}>
      <summary>Receipt fields and deterministic references</summary>
      <div class="tp-two-column">
        ${fieldPanel("Receipt verdict", receipt.verdict)}
        ${fieldPanel("Observation confidence", confidence)}
        ${fieldPanel("Final state", receipt.final.fingerprint?.short ?? "not available")}
        ${fieldPanel("Baseline state", receipt.baseline.fingerprint?.short ?? "not available")}
        ${fieldPanel("Covering command IDs", ids(receipt.coveringCommandIds))}
        ${fieldPanel("Stale command IDs", ids(receipt.staleCommandIds))}
        ${fieldPanel("Failed validation IDs", ids(receipt.failedCommandIds))}
        ${fieldPanel("Limited command IDs", ids(limited))}
      </div>
      <p><strong>Receipt explanation:</strong> ${escapeHtml(receipt.explanation)}</p>
      ${receipt.evidenceRefs.length > 0 ? `<p><strong>Evidence references:</strong> ${escapeHtml(receipt.evidenceRefs.join(", "))}</p>` : ""}
      <details>
        <summary>Run metadata</summary>
        <table>
          <caption class="tp-sr-only">Run metadata</caption>
          <tbody>
            <tr><th scope="row">Started</th><td>${escapeHtml(manifest.startedAt)}</td></tr>
            <tr><th scope="row">Finished</th><td>${escapeHtml(manifest.finishedAt)}</td></tr>
            <tr><th scope="row">Duration</th><td>${manifest.durationMs} ms</td></tr>
            <tr><th scope="row">Working folder</th><td>${escapeHtml(manifest.environment.cwd.label)} (${escapeHtml(manifest.environment.cwd.representation)}, path hash <code>${escapeHtml(manifest.environment.cwd.pathHash)}</code>)</td></tr>
          </tbody>
        </table>
      </details>
    </details>
  </section>`;
}

function commandsObservedSection(manifest: TracePackManifest): string {
  return `<section aria-labelledby="commands-title">
    <h2 id="commands-title">Commands observed</h2>
    ${
      manifest.commands.length === 0
        ? `<p class="tp-muted">No commands were captured.</p>`
        : `<div class="tp-command-list">${manifest.commands.map(commandDetail).join("")}</div>`
    }
  </section>`;
}

function commandDetail(command: CommandEvidence): string {
  const commandState = commandFailed(command)
    ? "Failed"
    : command.classification === "validation" && command.exitCode === 0
      ? "Observed"
      : "Observed";
  const outputState = outputSummary(command);

  return `<details>
    <summary><code>${escapeHtml(command.id)}</code> ${escapeHtml(safeCommandText(command.argv))} · ${escapeHtml(commandExitText(command))}</summary>
    <table>
      <caption class="tp-sr-only">Command ${escapeHtml(command.id)} evidence</caption>
      <tbody>
        <tr><th scope="row">State</th><td>${stateLabel(commandState)}</td></tr>
        <tr><th scope="row">Classification</th><td>${escapeHtml(command.classification)}</td></tr>
        <tr><th scope="row">Evidence label</th><td>${escapeHtml(command.evidence)}</td></tr>
        <tr><th scope="row">Pre-state</th><td>${command.gitBefore?.fingerprint ? `<code>${escapeHtml(command.gitBefore.fingerprint.short)}</code>` : "Not captured"}</td></tr>
        <tr><th scope="row">Duration</th><td>${command.durationMs} ms</td></tr>
        ${command.error ? `<tr><th scope="row">Error</th><td>${escapeHtml(sanitizeCommandString(command.error))}</td></tr>` : ""}
        <tr><th scope="row">Output</th><td>${escapeHtml(outputState)}</td></tr>
      </tbody>
    </table>
    ${commandOutputBlock("stdout", command.stdout)}
    ${commandOutputBlock("stderr", command.stderr)}
  </details>`;
}

function finalGitSection(manifest: TracePackManifest): string {
  const files = manifest.git.after.changedFiles;
  const table = changedFilesTable(files);

  return `<section aria-labelledby="final-git-title">
    <h2 id="final-git-title">Final Git evidence and changed files</h2>
    <table>
      <caption class="tp-sr-only">Final Git evidence</caption>
      <tbody>
        <tr><th scope="row">Repository</th><td>${manifest.git.after.isRepository ? "Observed" : "Not observed"}</td></tr>
        <tr><th scope="row">Branch</th><td>${escapeHtml(manifest.git.after.branch ?? "Not observed")}</td></tr>
        <tr><th scope="row">HEAD before</th><td>${escapeHtml(manifest.git.before.head ?? "Not observed")}</td></tr>
        <tr><th scope="row">HEAD after</th><td>${escapeHtml(manifest.git.after.head ?? "Not observed")}</td></tr>
        <tr><th scope="row">Dirty state</th><td>${manifest.git.after.dirty ? "Dirty" : "Clean"}</td></tr>
        <tr><th scope="row">Changed files</th><td>${files.length}</td></tr>
      </tbody>
    </table>
    ${
      files.length > 12
        ? `<details><summary>${files.length} changed files</summary>${table}</details>`
        : table
    }
  </section>`;
}

function warningsSection(manifest: TracePackManifest): string {
  return `<section id="warnings" aria-labelledby="warnings-title">
    <h2 id="warnings-title">Human-review warnings</h2>
    ${
      manifest.warnings.length === 0
        ? `<p>${stateLabel("Not observed")} No deterministic review trigger.</p>`
        : manifest.warnings.map(warningPanel).join("")
    }
  </section>`;
}

function observationSection(manifest: TracePackManifest): string {
  if (!("receipt" in manifest)) {
    return `<section aria-labelledby="observation-title">
      <h2 id="observation-title">Observation confidence and limitations</h2>
      <p>${stateLabel("Not observed")} Legacy manifest without receipt confidence fields.</p>
    </section>`;
  }

  const receipt = manifest.receipt;
  const confidence = receipt.observationConfidence ?? "unavailable";
  const reasons =
    receipt.confidenceReasons ??
    (manifest.schemaVersion === "tracepack.manifest.v0.2"
      ? ["Legacy v0.2 receipt did not capture observation-confidence details."]
      : []);
  const limits = receipt.observationLimits ?? [];
  const environmentNotes = receipt.environmentNotes ?? [];

  return `<section aria-labelledby="observation-title">
    <h2 id="observation-title">Observation confidence and limitations</h2>
    <div class="tp-panel">
      <p><strong>Observation confidence:</strong> <code>${escapeHtml(confidence)}</code></p>
      <p class="tp-muted">${escapeHtml(formatObservationConfidenceMeaning(confidence))}</p>
    </div>
    ${reasons.length > 3 ? detailsList("Confidence detail", reasons, true) : listBlock("Confidence detail", reasons)}
    ${limits.length > 3 ? observationLimitDetails(limits) : observationLimitList(limits)}
    ${environmentNotes.length > 0 ? observationNoteList(environmentNotes) : `<p class="tp-muted">No ambient environment note was recorded.</p>`}
    ${repositoryObservationDetails(receipt.final)}
  </section>`;
}

function redactionSection(redactionReport: RedactionReport): string {
  return `<section id="redaction" aria-labelledby="redaction-title">
    <h2 id="redaction-title">Redaction summary</h2>
    <table>
      <caption class="tp-sr-only">Redaction summary</caption>
      <tbody>
        <tr><th scope="row">Replacements</th><td>${redactionReport.summary.replacementCount}</td></tr>
        <tr><th scope="row">Command argument replacements</th><td>${redactionReport.summary.argumentReplacementCount ?? 0}</td></tr>
        <tr><th scope="row">Redacted command arguments</th><td>${redactionReport.summary.redactedArgumentCount ?? 0}</td></tr>
        <tr><th scope="row">Excluded evidence</th><td>${redactionReport.summary.excludedEvidenceCount}</td></tr>
        <tr><th scope="row">Output truncation</th><td>${redactionReport.summary.outputTruncated ? "Observed" : "Not observed"}</td></tr>
        <tr><th scope="row">Reproduction requires local values</th><td>${redactionReport.summary.reproductionMayRequireLocalValues ? "Yes" : "No"}</td></tr>
      </tbody>
    </table>
    ${replacementList(redactionReport)}
    ${excludedEvidenceDetails(redactionReport)}
    ${listBlock("Redaction notes", redactionReport.notes)}
  </section>`;
}

function reproductionSection(manifest: TracePackManifest): string {
  return `<section aria-labelledby="reproduction-title">
    <h2 id="reproduction-title">Reproduction instructions</h2>
    <p class="tp-muted">These commands were observed by Tracepack. Re-run only commands you approve in your own environment.</p>
    <pre>${escapeHtml(reproductionCommandText(manifest.reproduction.commands))}</pre>
    ${manifest.reproduction.notes.length > 0 ? listBlock("Reproduction notes", manifest.reproduction.notes) : ""}
  </section>`;
}

function timelineEvidence(manifest: TracePackManifest): TimelineEvidence {
  if (!("receipt" in manifest)) {
    return {
      baseline: undefined,
      validation: undefined,
      final: undefined
    };
  }

  return {
    baseline: manifest.receipt.baseline,
    validation: relevantValidationCommand(manifest),
    final: manifest.receipt.final
  };
}

function relevantValidationCommand(manifest: TracePackManifest): CommandEvidence | undefined {
  if (!("receipt" in manifest)) {
    return undefined;
  }

  const receipt = manifest.receipt;
  const ids = [
    ...receipt.coveringCommandIds,
    ...receipt.staleCommandIds,
    ...receipt.failedCommandIds
  ];
  for (const command of [...manifest.commands].reverse()) {
    if (ids.includes(command.id)) {
      return command;
    }
  }
  return [...manifest.commands]
    .reverse()
    .find((command) => command.classification === "validation");
}

function validationCommandSummary(command: CommandEvidence): string {
  return `<p><code>${escapeHtml(safeCommandText(command.argv))}</code></p>
    <p>${stateLabel(commandFailed(command) ? "Failed" : "Observed")} <span class="tp-muted">${escapeHtml(commandExitText(command))}</span></p>
    <p class="tp-small">Pre-state ${command.gitBefore?.fingerprint ? `<code>${escapeHtml(command.gitBefore.fingerprint.short)}</code>` : "not captured"}</p>`;
}

function timelineConnection(verdict: DisplayVerdict): { kind: string; label: string } {
  if (verdict.key === "final_state_validation_observed") {
    return { kind: "observed", label: "Observed" };
  }
  if (verdict.key === "validation_command_failed") {
    return { kind: "failed", label: "Failed" };
  }
  return { kind: "not-observed", label: "Not observed" };
}

function finalStatePhrase(
  verdict: DisplayVerdict,
  validation: CommandEvidence | undefined,
  final: GitStateSnapshot | undefined
): string {
  const finalShort = final?.fingerprint?.short;
  const validationShort = validation?.gitBefore?.fingerprint?.short;
  if (verdict.key === "final_state_validation_observed") {
    return validationShort && finalShort
      ? `Validation pre-state ${validationShort} matched final state ${finalShort}.`
      : "Validation pre-state matched the final state.";
  }
  if (verdict.key === "validation_evidence_incomplete" && validationShort && finalShort) {
    return `Validation pre-state ${validationShort} differed from final state ${finalShort}.`;
  }
  if (verdict.key === "validation_command_failed") {
    return "A validation result did not complete successfully for this final state.";
  }
  if (verdict.key === "repository_evidence_unavailable") {
    return "Final repository-state fingerprint was unavailable.";
  }
  return "Final-state validation was not observed.";
}

function changedFilesTable(files: TracePackManifest["git"]["after"]["changedFiles"]): string {
  if (files.length === 0) {
    return `<p class="tp-muted">No changed files were observed by Git.</p>`;
  }

  return `<table>
    <caption class="tp-sr-only">Changed files in final Git state</caption>
    <thead><tr><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Test-like</th><th scope="col">Additions</th><th scope="col">Deletions</th><th scope="col">Content hash</th><th scope="col">Excluded</th></tr></thead>
    <tbody>
      ${files
        .map(
          (file) => `<tr>
        <td><code>${escapeHtml(file.path)}</code></td>
        <td>${escapeHtml(file.status)}</td>
        <td>${file.looksLikeTest ? "Yes" : "No"}</td>
        <td>${file.additions ?? ""}</td>
        <td>${file.deletions ?? ""}</td>
        <td>${escapeHtml(file.contentHashStatus ?? (file.sha256 ? "hashed" : "not captured"))}</td>
        <td>${file.excluded ? escapeHtml(file.exclusionReason ?? "Excluded") : "No"}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function warningPanel(warning: WarningEntry): string {
  return `<div class="tp-panel">
    <p>${stateLabel("Needs human review")} <strong>${escapeHtml(warning.id)} ${escapeHtml(warning.title)}</strong></p>
    <p><strong>Trigger:</strong> ${escapeHtml(warning.trigger)}</p>
    <p><strong>Human review:</strong> ${escapeHtml(warning.humanReview)}</p>
    ${warning.limitation ? `<p class="tp-muted">${escapeHtml(warning.limitation)}</p>` : ""}
  </div>`;
}

function repositoryObservationDetails(snapshot: GitStateSnapshot): string {
  const unobserved = snapshot.unobservedChangedFiles ?? [];
  const excluded = snapshot.excludedChangedFiles ?? [];
  const ignored = snapshot.ignoredFiles;

  if (
    unobserved.length === 0 &&
    excluded.length === 0 &&
    (!ignored || ignored.mode === "not_present")
  ) {
    return "";
  }

  return `<details>
    <summary>Repository-state observation details</summary>
    ${
      unobserved.length > 0
        ? listBlock(
            "Changed file content not hashed",
            unobserved.map((file) => `${file.path}: ${file.reason}`)
          )
        : ""
    }
    ${
      excluded.length > 0
        ? listBlock(
            "Changed paths excluded from content hashing",
            excluded.map((file) => `${file.path}: ${file.reason}`)
          )
        : ""
    }
    ${ignored && ignored.mode !== "not_present" ? `<p class="tp-muted">${escapeHtml(ignored.reason)}</p>${ignoredSamples(ignored)}` : ""}
  </details>`;
}

function ignoredSamples(ignored: NonNullable<GitStateSnapshot["ignoredFiles"]>): string {
  if (!ignored.samples || ignored.samples.length === 0) {
    return "";
  }

  return detailsList(
    "Ignored path samples",
    ignored.samples.map(
      (sample) =>
        `${sample.path ? sample.path : "path hidden"} (${sample.relevance ? `${sample.relevance}, ` : ""}${sample.kind}, hash ${sample.pathHash}): ${sample.reason}`
    ),
    false
  );
}

function observationLimitDetails(
  limits: NonNullable<FinalStateReceipt["observationLimits"]>
): string {
  return detailsList(
    "Observation limit evidence",
    limits.map((limit) =>
      [limit.kind, `(${limit.evidenceRef})`, limit.path ? `${limit.path}:` : "", limit.reason]
        .filter(Boolean)
        .join(" ")
    ),
    true
  );
}

function observationLimitList(limits: NonNullable<FinalStateReceipt["observationLimits"]>): string {
  return listBlock(
    "Observation limit evidence",
    limits.map((limit) =>
      [limit.kind, `(${limit.evidenceRef})`, limit.path ? `${limit.path}:` : "", limit.reason]
        .filter(Boolean)
        .join(" ")
    )
  );
}

function observationNoteList(notes: NonNullable<FinalStateReceipt["environmentNotes"]>): string {
  return listBlock(
    "Environment notes",
    notes.map((note) =>
      [note.kind, `(${note.evidenceRef})`, note.path ? `${note.path}:` : "", note.reason]
        .filter(Boolean)
        .join(" ")
    )
  );
}

function replacementList(redactionReport: RedactionReport): string {
  if (redactionReport.replacements.length === 0) {
    return `<p class="tp-muted">No replacement pattern was recorded.</p>`;
  }

  return `<details>
    <summary>Replacement patterns</summary>
    <table>
      <caption class="tp-sr-only">Redaction replacement patterns</caption>
      <thead><tr><th scope="col">Pattern</th><th scope="col">Count</th></tr></thead>
      <tbody>${redactionReport.replacements
        .map(
          (replacement) =>
            `<tr><th scope="row">${escapeHtml(replacement.pattern)}</th><td>${replacement.count}</td></tr>`
        )
        .join("")}</tbody>
    </table>
  </details>`;
}

function excludedEvidenceDetails(redactionReport: RedactionReport): string {
  if (redactionReport.excludedEvidence.length === 0) {
    return `<p class="tp-muted">No excluded evidence item was recorded.</p>`;
  }

  return detailsList(
    "Excluded evidence",
    redactionReport.excludedEvidence.map((item) =>
      [item.kind, item.path ? `${item.path}:` : "", item.reason].filter(Boolean).join(" ")
    ),
    false
  );
}

function commandOutputBlock(label: "stdout" | "stderr", output: CommandEvidence["stdout"]): string {
  if (!output.text && !output.truncated && !output.redacted) {
    return "";
  }

  const flags = [
    output.redacted ? "redacted" : undefined,
    output.truncated ? "truncated" : undefined,
    output.omittedBytes > 0 ? `${output.omittedBytes} byte(s) omitted` : undefined
  ]
    .filter(Boolean)
    .join(", ");
  const displayText = boundedOutputText(redactText(output.text).text);

  return `<div class="tp-command-output">
    <details>
      <summary>${label}${flags ? ` · ${escapeHtml(flags)}` : ""}</summary>
      <pre>${escapeHtml(displayText || "(no text captured)")}</pre>
    </details>
  </div>`;
}

function outputSummary(command: CommandEvidence): string {
  const states = [
    command.stdout.truncated || command.stderr.truncated ? "truncated" : undefined,
    command.stdout.redacted || command.stderr.redacted || command.redaction.applied
      ? "redacted"
      : undefined
  ].filter(Boolean);

  return states.length > 0 ? `Captured, ${states.join(", ")}` : "Captured";
}

function boundedOutputText(value: string): string {
  const limit = 4000;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}\n[Tracepack display truncated ${value.length - limit} character(s)]`;
}

function fieldPanel(label: string, value: string): string {
  return `<div class="tp-panel"><strong>${escapeHtml(label)}</strong><p><code>${escapeHtml(value)}</code></p></div>`;
}

function listBlock(title: string, values: string[]): string {
  if (values.length === 0) {
    return `<p class="tp-muted">${escapeHtml(title)}: none recorded.</p>`;
  }
  return `<div class="tp-panel">
    <p><strong>${escapeHtml(title)}</strong></p>
    <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
  </div>`;
}

function detailsList(title: string, values: string[], open: boolean): string {
  if (values.length === 0) {
    return `<p class="tp-muted">${escapeHtml(title)}: none recorded.</p>`;
  }

  return `<details${open ? " open" : ""}>
    <summary>${escapeHtml(title)}</summary>
    <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
  </details>`;
}

function reproductionCommandText(commands: string[]): string {
  return commands.length > 0
    ? commands.map((command) => sanitizeCommandString(command)).join("\n")
    : "No commands were captured.";
}

function stateLabel(state: MatrixState): string {
  const dataState =
    state === "Observed"
      ? "observed"
      : state === "Not observed"
        ? "not-observed"
        : state === "Needs human review"
          ? "needs-review"
          : state === "Failed"
            ? "failed"
            : "excluded";
  const glyph =
    state === "Observed"
      ? "✓"
      : state === "Failed"
        ? "✗"
        : state === "Not observed" || state === "Needs human review"
          ? "⚠"
          : "·";
  return `<span class="tp-label" data-state="${dataState}"><span aria-hidden="true">${glyph}</span>${escapeHtml(state)}</span>`;
}

function fingerprintLine(label: string, fingerprint: string | undefined): string {
  return `<strong>${escapeHtml(label)}:</strong> <code>${escapeHtml(fingerprint ?? "not available")}</code>`;
}

function finalFingerprint(manifest: TracePackManifest): string {
  if (!("receipt" in manifest)) {
    return "not available";
  }
  return manifest.receipt.final.fingerprint?.short ?? "not available";
}

function ids(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
