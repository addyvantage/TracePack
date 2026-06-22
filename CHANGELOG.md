# Changelog

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
