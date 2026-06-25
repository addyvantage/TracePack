# GitHub Actions

TracePack provides a reference GitHub Actions integration, not a Marketplace Action, GitHub App, PR
bot, hosted service, dashboard, or merge gate. GitHub Actions is only a transport layer for the
local receipt bundle and reviewer-facing job summary.

The example in `examples/github-actions/tracepack.yml` is intentionally narrow:

- triggers on `pull_request` and `workflow_dispatch`;
- uses least privilege with `permissions: contents: read`;
- checks out the repository and sets up Node 20;
- installs dependencies with `npm ci`;
- builds the TracePack CLI from checked-out source;
- starts a TracePack session;
- runs two validation commands through `tracepack run`;
- keeps validation steps `continue-on-error` so `tracepack finish` can still produce a receipt when
  validation fails;
- treats failure to finish/report/upload a receipt as workflow infrastructure failure;
- regenerates `report.html`, `report.md`, and `summary.json`;
- appends a compact receipt summary with `tracepack report --github-summary`;
- uploads the completed `.tracepack/<run-id>/` directory as a named artifact;
- does not request PR, issue, checks, deployment, id-token, or repository write permissions;
- does not post comments or make approval claims.

## Distribution Status

The unscoped `tracepack` npm package name may be unavailable or owned elsewhere. The reference
workflow therefore does **not** use `npm install -g tracepack`. It is written for the TracePack
repository itself, or for a repository that vendors/builds TracePack source. If you use TracePack
from another repository before package distribution is settled, pin a trusted source or vendor the
CLI and keep that choice explicit in your workflow.

## Validation Steps

Replace these with your repository's real validation commands:

```yaml
- name: TracePack run validation - lint
  continue-on-error: true
  run: node dist/cli.js run -- npm run lint

- name: TracePack run validation - tests
  continue-on-error: true
  run: node dist/cli.js run -- npm test
```

`tracepack run` returns the child command's non-zero exit code after capturing evidence. The
workflow uses step-level `continue-on-error` so a failed validation command is recorded in the
receipt instead of preventing `tracepack finish`.

This distinction matters:

- validation command failure is receipt evidence and should appear as `validation_failed` or another
  truthful failure/interruption verdict;
- TracePack failing to create or report a receipt is workflow infrastructure failure;
- optional policy assertions, if you add them later, are separate from receipt generation.

Phase 3A does not include an automatic policy gate. A green workflow job means the receipt workflow
completed; it does not mean TracePack proved correctness, security, approval, or merge readiness.

## Job Summary

`tracepack report --github-summary` appends Markdown to `$GITHUB_STEP_SUMMARY` only when explicitly
requested. It fails if that environment variable is unavailable, so local shells are not silently
treated like GitHub Actions.

The job summary includes the receipt verdict, confidence, final observed Git state, run ID, branch,
SHA, command counts, command result rows, evidence limitations, environment notes, artifact handoff
note, and TracePack disclaimer. It does not include raw stdout/stderr. Command arguments are
sanitized with the same best-effort rules used for the full reports and manifest.

## Artifact Contents

The workflow uploads the completed bundle directory after running `tracepack report --format all`.
Reviewers should open:

- `report.html` first for the full static human-readable receipt;
- `report.md` when Markdown is easier to review in a text editor;
- `summary.json` for machine-readable report summary data;
- `manifest.json` for the complete structured evidence record;
- `redaction-report.json` for redaction and excluded-evidence metadata.

The reports are self-contained and do not depend on external CDNs.

Artifacts are stored by GitHub Actions according to your repository's artifact access controls and
retention settings. TracePack itself does not make network calls or upload anything outside the
workflow steps you configure.

## Privacy Notes

Receipt artifacts and job summaries can expose:

- sanitized command strings and command classifications;
- captured stdout/stderr summaries in the full artifact;
- changed-file paths and Git metadata;
- redaction replacement counts and excluded-evidence reasons;
- ignored-path relevance counts and non-sensitive ignored-path samples.

TracePack does not read ignored sensitive file contents, and sensitive ignored path labels are
hidden in receipt observation samples. Command arguments and output summaries are sanitized before
persistence, but redaction is best effort, not a guarantee. Avoid printing secrets or passing them
directly as command-line arguments during validation commands. Anyone with access to workflow
artifacts may be able to inspect the uploaded receipt data.

Partial or inconclusive evidence usually means TracePack could not fully observe some relevant
tracked/source state, sensitive/local ignored input, unknown ignored path, or final fingerprint. A
failed or interrupted command is shown as command evidence, not as a product judgment about the
change.
