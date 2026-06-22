# Changelog

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
