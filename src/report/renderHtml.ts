import type {
  FinalStateReceipt,
  GitStateSnapshot,
  RedactionReport,
  TracePackManifest
} from "../core/manifest.js";
import {
  commandExitText,
  commandFailed,
  formatObservationConfidenceMeaning,
  formatReceiptVerdictMeaning
} from "../core/format.js";
import { reportStyles } from "./styles.js";

export function renderHtmlReport(
  manifest: TracePackManifest,
  redactionReport: RedactionReport
): string {
  const warnings = manifest.warnings;
  const validationCommands = manifest.commands.filter(
    (command) => command.classification === "validation"
  );
  const missingValidation = warnings.find((warning) => warning.id === "TP001");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TracePack Report ${escapeHtml(manifest.runId)}</title>
  <style>${reportStyles}</style>
</head>
<body>
<main>
  <header>
    <h1>TracePack Evidence Report</h1>
    <p class="muted">Run <code>${escapeHtml(manifest.runId)}</code>${manifest.label ? ` - ${escapeHtml(manifest.label)}` : ""}</p>
    <p>${statusLabel(warnings.length === 0 ? "observed" : "needs_human_review")} TracePack reports observed local evidence. It does not prove correctness, security, approval, or merge readiness.</p>
  </header>

  ${topSummarySection(manifest)}

  <section>
    <h2>Run Summary</h2>
    <div class="grid">
      ${metric("Started", manifest.startedAt)}
      ${metric("Finished", manifest.finishedAt)}
      ${metric("Duration", `${manifest.durationMs} ms`)}
      ${metric("Commands", `${manifest.commands.length}`)}
      ${metric("Warnings", `${manifest.warnings.length}`)}
      ${metric("Working Folder", manifest.environment.cwd.label)}
    </div>
  </section>

  ${receiptSection(manifest)}

  <section>
    <h2>Final Git Evidence</h2>
    <div class="grid">
      ${metric("Repository", manifest.git.after.isRepository ? "Observed" : "Not observed")}
      ${metric("Branch", manifest.git.after.branch ?? "Not observed")}
      ${metric("HEAD Before", manifest.git.before.head ?? "Not observed")}
      ${metric("HEAD After", manifest.git.after.head ?? "Not observed")}
      ${metric("Dirty State", manifest.git.after.dirty ? "Dirty" : "Clean")}
      ${metric("Changed Files", `${manifest.git.after.changedFiles.length}`)}
    </div>
    ${changedFilesTable(manifest)}
  </section>

  <section>
    <h2>Commands Actually Executed</h2>
    ${commandsTable(manifest.commands)}
  </section>

  <section>
    <h2>Validation Evidence</h2>
    ${
      validationCommands.length === 0
        ? `<p>${statusLabel("not_observed")} No command was deterministically classified as validation.</p>`
        : commandsTable(validationCommands)
    }
  </section>

  <section>
    <h2>Evidence Missing Or Not Observed</h2>
    ${
      missingValidation
        ? warningPanel(missingValidation)
        : `<p>${statusLabel("observed")} No missing post-change validation warning was triggered.</p>`
    }
  </section>

  <section>
    <h2>Test-Related Change Warnings</h2>
    ${
      warnings.filter((warning) => warning.id !== "TP001").length === 0
        ? `<p>${statusLabel("observed")} No deterministic test-related review warning was triggered.</p>`
        : warnings
            .filter((warning) => warning.id !== "TP001")
            .map((warning) => warningPanel(warning))
            .join("")
    }
  </section>

  <section>
    <h2>Reproduction Instructions</h2>
    <p class="muted">These commands were observed by TracePack. Re-run only commands you approve in your own environment.</p>
    <pre>${escapeHtml(manifest.reproduction.commands.join("\n") || "No commands were captured.")}</pre>
    <ul>${manifest.reproduction.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </section>

  <section>
    <h2>Redaction Summary</h2>
    <div class="grid">
      ${metric("Applied", redactionReport.summary.applied ? "Yes" : "No")}
      ${metric("Replacement Count", `${redactionReport.summary.replacementCount}`)}
      ${metric("Excluded Evidence", `${redactionReport.summary.excludedEvidenceCount}`)}
      ${metric("Output Truncated", redactionReport.summary.outputTruncated ? "Yes" : "No")}
    </div>
    <ul>${redactionReport.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </section>

  <section>
    <h2>Explicit Limitations</h2>
    <ul>${manifest.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join("")}</ul>
  </section>
</main>
</body>
</html>`;
}

function metric(label: string, value: string): string {
  return metricHtml(label, escapeHtml(value));
}

function metricHtml(label: string, value: string): string {
  return `<div class="panel"><strong>${escapeHtml(label)}</strong><p>${value}</p></div>`;
}

function topSummarySection(manifest: TracePackManifest): string {
  const receiptSummary = topReceiptSummary(manifest);
  const commandSummary = topCommandSummary(manifest);
  const topWarning = manifest.warnings[0];
  return `<section class="top-summary">
    <h2>Evidence Summary</h2>
    <div class="grid">
      ${metricHtml("Receipt Verdict", statusLabel(receiptSummary.verdict))}
      ${metricHtml("Confidence", statusLabel(receiptSummary.confidence))}
      ${metric("Commands", `${commandSummary.total} total / ${commandSummary.validation} validation / ${commandSummary.failed} failed`)}
      ${metric("Warnings", `${manifest.warnings.length}`)}
      ${metric("Changed Files", `${manifest.git.after.changedFiles.length}`)}
      ${metric("Final Fingerprint", receiptSummary.finalFingerprint)}
    </div>
    <div class="panel summary-note">
      <p><strong>Meaning:</strong> ${escapeHtml(receiptSummary.explanation)}</p>
      <p><strong>Confidence meaning:</strong> ${escapeHtml(formatObservationConfidenceMeaning(receiptSummary.confidence))}</p>
      ${topConfidenceReasonsList(receiptSummary.confidence, receiptSummary.confidenceReasons)}
    </div>
    ${
      topWarning
        ? `<div class="panel callout"><p><strong>Needs human review:</strong> ${escapeHtml(topWarning.title)}</p></div>`
        : `<p>${statusLabel("observed")} No deterministic warning was triggered.</p>`
    }
    <p class="muted">TracePack records observed local evidence. It does not prove correctness, security, approval, or merge readiness.</p>
  </section>`;
}

function topReceiptSummary(manifest: TracePackManifest): {
  verdict: string;
  confidence: string;
  finalFingerprint: string;
  explanation: string;
  confidenceReasons: string[];
} {
  if (!("receipt" in manifest)) {
    return {
      verdict: "inconclusive",
      confidence: "unavailable",
      finalFingerprint: "not available",
      explanation: "Legacy manifest without a final-state validation receipt.",
      confidenceReasons: []
    };
  }

  return {
    verdict: manifest.receipt.verdict,
    confidence: manifest.receipt.observationConfidence ?? "unavailable",
    finalFingerprint: manifest.receipt.final.fingerprint?.short ?? "not available",
    explanation:
      manifest.receipt.explanation ?? formatReceiptVerdictMeaning(manifest.receipt.verdict),
    confidenceReasons: manifest.receipt.confidenceReasons ?? []
  };
}

function topCommandSummary(manifest: TracePackManifest): {
  total: number;
  validation: number;
  failed: number;
} {
  return {
    total: manifest.commands.length,
    validation: manifest.commands.filter((command) => command.classification === "validation")
      .length,
    failed: manifest.commands.filter(commandFailed).length
  };
}

function topConfidenceReasonsList(confidence: string, reasons: string[]): string {
  if (confidence === "complete" || reasons.length === 0) {
    return "";
  }

  const renderedReasons = reasons
    .slice(0, 3)
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("");
  const remaining =
    reasons.length > 3
      ? `<li>${reasons.length - 3} more confidence note(s) in the receipt section.</li>`
      : "";

  return `<p><strong>Confidence notes:</strong></p><ul>${renderedReasons}${remaining}</ul>`;
}

function changedFilesTable(manifest: TracePackManifest): string {
  if (manifest.git.after.changedFiles.length === 0) {
    return `<p class="muted">No changed files were observed by Git.</p>`;
  }
  return `<table>
  <thead><tr><th>Path</th><th>Status</th><th>Test-like</th><th>Additions</th><th>Deletions</th><th>Content Hash</th><th>Excluded</th></tr></thead>
  <tbody>
    ${manifest.git.after.changedFiles
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

function commandsTable(commands: TracePackManifest["commands"]): string {
  if (commands.length === 0) {
    return `<p class="muted">No commands were captured.</p>`;
  }
  return `<table>
  <thead><tr><th>Command</th><th>Exit / Signal</th><th>Duration</th><th>Classification</th><th>Evidence</th><th>Pre-state</th><th>Error</th><th>Output</th></tr></thead>
  <tbody>
    ${commands
      .map(
        (command) => `<tr>
      <td><code>${escapeHtml(command.argv.join(" "))}</code></td>
      <td>${escapeHtml(commandExitText(command))}</td>
      <td>${command.durationMs} ms</td>
      <td>${escapeHtml(command.classification)}</td>
      <td>${statusLabel(command.evidence)}</td>
      <td>${command.gitBefore?.fingerprint ? `<code>${escapeHtml(command.gitBefore.fingerprint.short)}</code>` : "Not captured"}</td>
      <td>${command.error ? escapeHtml(command.error) : ""}</td>
      <td>${command.stdout.truncated || command.stderr.truncated ? "Truncated" : "Captured"}${command.redaction.applied ? ", redacted" : ""}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>`;
}

function receiptSection(manifest: TracePackManifest): string {
  if (!("receipt" in manifest)) {
    return `<section>
    <h2>Final-State Validation Receipt</h2>
    <div class="panel">
      <p>${statusLabel("inconclusive")} This is a legacy v0.1 manifest. Final-state validation receipts were not captured for this bundle.</p>
      <p class="muted">Regenerating this report preserves the old evidence, but TracePack cannot retroactively prove which repository state a validation command covered.</p>
    </div>
  </section>`;
  }

  const receipt = manifest.receipt;
  const finalHash = receipt.final.fingerprint?.short ?? "Not available";
  const confidence =
    receipt.observationConfidence ?? receipt.final.contentObservation ?? "unavailable";
  const changedContentObservation =
    receipt.changedContentObservation ?? receipt.final.contentObservation ?? "unavailable";
  const ignoredObservation = receipt.final.ignoredFiles?.mode ?? "unavailable";
  const confidenceReasons =
    receipt.confidenceReasons ??
    (manifest.schemaVersion === "tracepack.manifest.v0.2"
      ? ["Legacy v0.2 receipt did not capture observation-confidence details."]
      : []);
  const covering =
    receipt.coveringCommandIds.length > 0 ? receipt.coveringCommandIds.join(", ") : "None";
  const limited =
    (receipt.limitedCommandIds?.length ?? 0) > 0
      ? `<p><strong>Limited matching command(s):</strong> ${(receipt.limitedCommandIds ?? [])
          .map((id) => `<code>${escapeHtml(id)}</code>`)
          .join(", ")}</p>`
      : "";
  const stale =
    receipt.staleCommandIds.length > 0
      ? `<p><strong>Stale validation command(s):</strong> ${receipt.staleCommandIds
          .map((id) => `<code>${escapeHtml(id)}</code>`)
          .join(", ")}</p>`
      : "";
  const failed =
    receipt.failedCommandIds.length > 0
      ? `<p><strong>Failed validation command(s):</strong> ${receipt.failedCommandIds
          .map((id) => `<code>${escapeHtml(id)}</code>`)
          .join(", ")}</p>`
      : "";

  return `<section>
    <h2>Final-State Validation Receipt</h2>
    <div class="panel">
      <p>${statusLabel(receipt.verdict)} <strong>${escapeHtml(receipt.explanation)}</strong></p>
      <p><strong>Overall receipt confidence:</strong> ${statusLabel(confidence)}</p>
      <div class="grid">
        ${metric("Final State Fingerprint", finalHash)}
        ${metric("Matched Fingerprint Command(s)", covering)}
        ${metric("Baseline Fingerprint", receipt.baseline.fingerprint?.short ?? "Not available")}
        ${metric("Changed-File Content Observation", changedContentObservation)}
        ${metric("Ignored-Path Observation", ignoredObservation)}
      </div>
      ${confidenceReasonsList(confidenceReasons)}
      ${observationLimitsList(receipt.observationLimits ?? [])}
      ${limited}
      ${stale}
      ${failed}
      ${observationDetails(receipt.final)}
      <p class="muted">TracePack does not prove correctness, security, approval, or merge readiness.</p>
    </div>
  </section>`;
}

function confidenceReasonsList(reasons: string[]): string {
  if (reasons.length === 0) {
    return "";
  }
  return `<p><strong>Confidence notes:</strong></p><ul>${reasons
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("")}</ul>`;
}

function observationLimitsList(
  limits: NonNullable<FinalStateReceipt["observationLimits"]>
): string {
  if (limits.length === 0) {
    return "";
  }
  return `<p><strong>Observation limit evidence:</strong></p><ul>${limits
    .map((limit) => {
      const pathText = limit.path ? `, path <code>${escapeHtml(limit.path)}</code>` : "";
      return `<li><code>${escapeHtml(limit.evidenceRef)}</code>${pathText}: ${escapeHtml(limit.reason)}</li>`;
    })
    .join("")}</ul>`;
}

function observationDetails(snapshot: GitStateSnapshot): string {
  const unobserved = snapshot.unobservedChangedFiles ?? [];
  const excluded = snapshot.excludedChangedFiles ?? [];
  const ignored = snapshot.ignoredFiles;

  if (unobserved.length === 0 && excluded.length === 0 && !ignored) {
    return "";
  }

  return `<div class="panel">
    <p><strong>Repository-state observation limits</strong></p>
    ${
      unobserved.length === 0
        ? ""
        : `<p>Changed file content not hashed:</p><ul>${unobserved
            .map(
              (file) => `<li><code>${escapeHtml(file.path)}</code>: ${escapeHtml(file.reason)}</li>`
            )
            .join("")}</ul>`
    }
    ${
      excluded.length === 0
        ? ""
        : `<p>Changed paths excluded from content hashing:</p><ul>${excluded
            .map(
              (file) => `<li><code>${escapeHtml(file.path)}</code>: ${escapeHtml(file.reason)}</li>`
            )
            .join("")}</ul>`
    }
    ${
      ignored && ignored.mode !== "not_present"
        ? `<p class="muted">${escapeHtml(ignored.reason)}</p>${ignoredSamples(ignored)}`
        : ""
    }
  </div>`;
}

function ignoredSamples(ignored: NonNullable<GitStateSnapshot["ignoredFiles"]>): string {
  if (!ignored.samples || ignored.samples.length === 0) {
    return "";
  }
  return `<p>Ignored path sample(s), content not read:</p><ul>${ignored.samples
    .map(
      (sample) =>
        `<li>${sample.path ? `<code>${escapeHtml(sample.path)}</code>` : "path hidden"} (${escapeHtml(sample.kind)}, hash <code>${escapeHtml(sample.pathHash)}</code>): ${escapeHtml(sample.reason)}</li>`
    )
    .join("")}</ul>`;
}

function warningPanel(warning: TracePackManifest["warnings"][number]): string {
  return `<div class="panel">
    <p>${statusLabel(warning.label)} <strong>${escapeHtml(warning.title)}</strong></p>
    <p><strong>Trigger:</strong> ${escapeHtml(warning.trigger)}</p>
    <p><strong>Human review:</strong> ${escapeHtml(warning.humanReview)}</p>
    ${warning.limitation ? `<p class="muted">${escapeHtml(warning.limitation)}</p>` : ""}
  </div>`;
}

function statusLabel(value: string): string {
  const className =
    value.includes("failed") || value === "command_failed"
      ? "bad"
      : value.includes("stale") ||
          value === "partial" ||
          value === "unavailable" ||
          value === "not_observed" ||
          value === "no_validation_observed" ||
          value === "possible_validation_observed" ||
          value.includes("human") ||
          value.includes("redacted") ||
          value.includes("not_observed") ||
          value === "inconclusive"
        ? "warn"
        : value === "validated_final_state" ||
            value === "successful_validation" ||
            value === "complete" ||
            value === "not_present" ||
            value === "metadata_observed" ||
            value === "content_observed" ||
            value === "observed"
          ? "good"
          : "neutral";
  return `<span class="label ${className}">${escapeHtml(value.replaceAll("_", " "))}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
