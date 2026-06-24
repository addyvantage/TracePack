# Changelog

## Unreleased

- Added `tracepack status` for active-session visibility, including stale pointer diagnostics and
  captured command summaries.
- Added `tracepack clean` to remove only the active-session pointer without deleting bundles or
  session data.
- Expanded `tracepack finish` terminal output with receipt verdict, confidence, command counts,
  warnings, changed-file examples, and bundle paths.
- Added a `doctor` warning when `.tracepack/` does not appear to be ignored by Git.
- Improved the HTML report top section so receipt verdict, confidence, warning count, command
  counts, changed-file count, and the main limitation are visible immediately.
- Added clearer CLI next-action hints, grouped `doctor` output, receipt explanations in `finish`,
  and top Evidence Summary explanations in HTML and Markdown reports.
- Hardened ignored-path relevance so ambient environment paths such as `node_modules/`, `.venv/`,
  and caches are reported as non-limiting environment notes, while sensitive/local ignored inputs
  and unknown ignored paths remain confidence-limiting.
- Promoted failed and interrupted traced commands to top-level receipt verdicts when no successful
  validation was observed.
- Made `tracepack start` idempotently add `.tracepack/` to local `.git/info/exclude` when needed,
  without editing tracked `.gitignore`.
- Made `tracepack report` select the latest completed bundle when run without a bundle path.
- Classified `git diff --check` as deterministic validation evidence.
- Updated the regression demo to use ignored local config for the ignored-input confidence-limit
  case.
- Added opt-in GitHub Actions job-summary output through `tracepack report --github-summary`.
- Added a reviewer-facing GitHub Actions reference workflow that builds TracePack from local source,
  finishes receipts after failed validation commands, regenerates all report exports, writes the job
  summary, and uploads the bundle as a named artifact.
- Documented GitHub artifact contents, distribution limits, and privacy implications without
  introducing PR comments, GitHub App behavior, hosted services, or merge gates.

## 0.6.0

- Added `tracepack assert <bundle-dir>` for local CI policy checks over manifest-derived receipt
  evidence.
- Added a default 300-second command timeout for `tracepack run` with `--timeout <seconds>` for
  positive-integer overrides.
- Fixed deterministic test rename-away warning detection so `TP003` fires when a test-looking path
  is renamed to a non-test-looking path.
- Added a repository CI workflow that runs the existing local verification script on push and pull
  request.
- Added strict default assertion policy requiring `validated_final_state`, `complete` receipt
  confidence, and zero warnings.
- Added `tracepack.assertion.v0.1` JSON output through `--json` and `--summary-out <path>` for CI
  artifacts.
- Updated the GitHub Actions example to generate all report exports, run an explicit assertion, and
  upload the full local bundle without secrets or PR automation.
- Kept policy wording scoped to observed evidence only; passing assertions do not prove correctness,
  security, approval, policy compliance, or merge readiness.

## 0.5.0

- Added `tracepack report --format html|markdown|json|all` while preserving HTML as the default.
- Added `--out <path>` for single-format report regeneration.
- Added PR-friendly Markdown reports with receipt, warning, validation, changed-file, redaction,
  reproduction, and limitation sections.
- Added deterministic `tracepack.summary.v0.1` JSON summaries for CI parsing without duplicating the
  full manifest or raw captured output.
- Kept exports local-first and explicit that TracePack does not prove correctness, security,
  approval, or merge readiness.

## 0.4.0

- Added v0.4 manifests and v0.3 receipts with an overall observation gate for final-state
  validation.
- Structured ignored-path observation separately from Git-reported changed-file content observation.
- Hardened ignored-input semantics so ignored paths present in the final state reduce receipt
  confidence and matching validation becomes `inconclusive` with `limitedCommandIds`.
- Hardened matching validation pre-state semantics so ignored or otherwise partial command pre-state
  observation cannot produce `validated_final_state` just because the final snapshot looks complete.
- Added ignored-input demo and regression tests so validation that reads an ignored file cannot
  later report `validated_final_state` after ignored state changes.
- Preserved v0.1, v0.2, and v0.3 report regeneration without upgrading legacy certainty.

## 0.3.0

- Added v0.3 manifests and v0.2 receipts with explicit receipt confidence.
- Added changed-content observation completeness for state snapshots, including fully observed,
  unobserved, excluded, and ignored-file evidence categories.
- Hardened receipt semantics so matching validation fingerprints with partial changed-content
  observation report `inconclusive` rather than unconditional `validated_final_state`.
- Surfaced large-file, symlink, non-file, unreadable-file, sensitive-path, and ignored-file limits
  in reports and documentation without reading excluded contents.
- Added demo coverage for normal validation, stale validation, and partial-observation receipts.
- Added `prepack` build guard and package repository/bugs/homepage metadata so npm packing cannot
  silently omit `dist/cli.js` from a clean clone.
- Documented the unscoped npm package-name release blocker.

## 0.2.0

- Added v0.2 manifests with a final-state validation receipt.
- Added deterministic local state fingerprints based on Git/worktree metadata, safe file hashes,
  diff stats, and excluded-evidence markers.
- Captured Git state at session start, before and after each TracePack-run command, and finish.
- Replaced timestamp-primary validation warnings with receipt verdicts: `validated_final_state`,
  `validation_stale`, `validation_failed`, `no_validation_observed`, and `inconclusive`.
- Preserved v0.1 report regeneration with a legacy/limited receipt note.
- Fixed Windows-style relative path normalization, POSIX CLI path output, report mojibake, and the
  documented GitHub Actions example path.
- Kept Node 20 support by using a Commander release whose engine range is compatible with Node 20.

## 0.1.0

- Initial local-first TypeScript CLI foundation.
- Added session workflow, one-command workflow, manifest validation, redaction report, static HTML
  report generation, deterministic warnings, demo fixtures, and public-alpha documentation.
