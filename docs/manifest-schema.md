# Manifest Schema

The current manifest schema version is `tracepack.manifest.v0.2`. Report regeneration still accepts
legacy `tracepack.manifest.v0.1` bundles and renders a legacy/limited receipt note.

Each `manifest.json` includes:

- TracePack run ID, version, label, and timestamps;
- safe OS metadata and a safe current-folder representation;
- Git evidence before and after the run;
- baseline and final state fingerprints;
- changed-file paths, statuses, counts, diff statistics, safe metadata, and exclusions;
- command argv, exit code, timings, summaries, truncation metadata, classification, evidence labels,
  and optional `gitBefore`/`gitAfter` state snapshots;
- a top-level `receipt` with final-state validation verdict data;
- deterministic warnings with triggers, evidence references, human-review wording, and limitations;
- redaction summary;
- reproduction guidance;
- explicit limitations.

Runtime validation is implemented with Zod in `src/core/manifest.ts`.

## v0.2 Receipt Fields

`receipt.schemaVersion` is `tracepack.receipt.v0.1`.

`receipt.baseline` and `receipt.final` are Git state snapshots containing `capturedAt`, Git
evidence, an optional deterministic fingerprint, and limitations. Fingerprints use
`tracepack.state-fingerprint.v1`.

`receipt.verdict` is one of:

- `validated_final_state`
- `validation_stale`
- `validation_failed`
- `no_validation_observed`
- `inconclusive`

`receipt.coveringCommandIds` lists successful validation commands whose pre-state fingerprint equals
the final fingerprint. `receipt.staleCommandIds` lists successful validation commands whose
pre-state fingerprint does not match the final fingerprint. `receipt.failedCommandIds` lists failed
validation commands observed against the final fingerprint.

`receipt.evidenceRefs`, `receipt.explanation`, and `receipt.limitations` provide reviewer-facing
context. The receipt is a local evidence claim only; it does not prove correctness, security, or
approval.
