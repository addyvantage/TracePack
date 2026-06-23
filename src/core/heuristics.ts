import { commandHasSuspiciousTestFlag } from "./classify.js";
import { looksLikeTestPath } from "./git.js";
import type { CommandEvidence, FinalStateReceipt, GitEvidence, WarningEntry } from "./manifest.js";

export function runHeuristics(params: {
  gitAfter: GitEvidence;
  commands: CommandEvidence[];
  receipt: FinalStateReceipt;
}): WarningEntry[] {
  return [
    ...validationAfterFinalStateWarnings(params.receipt),
    ...testFileChangeWarnings(params.gitAfter),
    ...suspiciousTestEditWarnings(params.gitAfter, params.commands)
  ];
}

function validationAfterFinalStateWarnings(receipt: FinalStateReceipt): WarningEntry[] {
  if (receipt.verdict === "validated_final_state") {
    return [];
  }

  const title =
    receipt.verdict === "validation_stale"
      ? "Successful validation was observed, but not for the final repository state."
      : receipt.verdict === "validation_failed"
        ? "Validation was observed for the final repository state, but it failed."
        : receipt.verdict === "no_validation_observed"
          ? "No validation command was observed for the final repository state."
          : "TracePack could not determine whether validation covered the final repository state.";

  return [
    {
      id: "TP001",
      title,
      trigger: receipt.explanation,
      evidenceRefs: receipt.evidenceRefs,
      humanReview:
        "Review whether the final repository state was validated by another mechanism before trusting the change.",
      limitation:
        "TracePack observes local evidence only and does not prove the code was untested elsewhere.",
      label: "needs_human_review"
    }
  ];
}

function testFileChangeWarnings(gitAfter: GitEvidence): WarningEntry[] {
  const testFiles = gitAfter.changedFiles.filter((file) => !file.excluded && file.looksLikeTest);
  if (testFiles.length === 0) {
    return [];
  }

  return [
    {
      id: "TP002",
      title: "Test-related files changed. Review whether existing behavior coverage was preserved.",
      trigger: `${testFiles.length} changed path(s) matched deterministic test-file path patterns.`,
      evidenceRefs: testFiles.slice(0, 20).map((file) => `git.after.changedFiles:${file.path}`),
      humanReview:
        "Review the test changes with the same care as production code. This warning does not claim tests were weakened.",
      limitation:
        "Path-based test detection is conservative and may include fixtures, snapshots, or helper files.",
      label: "needs_human_review"
    }
  ];
}

function suspiciousTestEditWarnings(
  gitAfter: GitEvidence,
  commands: CommandEvidence[]
): WarningEntry[] {
  const warnings: WarningEntry[] = [];
  const deletedTests = gitAfter.changedFiles.filter(
    (file) => !file.excluded && file.looksLikeTest && file.status.includes("D")
  );
  const renamedAway = gitAfter.changedFiles.filter(
    (file) =>
      !file.excluded &&
      !!file.previousPath &&
      file.previousPath !== file.path &&
      file.status.includes("R") &&
      looksLikeTestPath(file.previousPath) &&
      !looksLikeTestPath(file.path)
  );
  const suspiciousCommandFlags = commands
    .map((command) => ({ command, trigger: commandHasSuspiciousTestFlag(command.argv) }))
    .filter((entry): entry is { command: CommandEvidence; trigger: string } => !!entry.trigger);

  if (deletedTests.length > 0 || renamedAway.length > 0) {
    warnings.push({
      id: "TP003",
      title: "A deterministic test-edit review trigger was observed.",
      trigger: [
        deletedTests.length > 0
          ? `${deletedTests.length} test-looking path(s) were deleted`
          : undefined,
        renamedAway.length > 0
          ? `${renamedAway.length} path(s) were renamed away from test-looking names`
          : undefined
      ]
        .filter(Boolean)
        .join("; "),
      evidenceRefs: [...deletedTests, ...renamedAway]
        .slice(0, 20)
        .map((file) => `git.after.changedFiles:${file.path}`),
      humanReview:
        "Review whether the change intentionally removed or moved test coverage. This warning does not judge test quality.",
      limitation:
        "TracePack reports deterministic file-status triggers only; it is not an LLM test-quality reviewer.",
      label: "needs_human_review"
    });
  }

  if (suspiciousCommandFlags.length > 0) {
    warnings.push({
      id: "TP004",
      title: "A validation command used a flag that can narrow or update test evidence.",
      trigger: suspiciousCommandFlags.map((entry) => entry.trigger).join(", "),
      evidenceRefs: suspiciousCommandFlags.map((entry) => `commands:${entry.command.id}`),
      humanReview:
        "Review whether the command intentionally skipped, filtered, or updated test evidence before relying on it.",
      limitation: "Command-line flag detection is deterministic and context-limited.",
      label: "needs_human_review"
    });
  }

  return warnings;
}
