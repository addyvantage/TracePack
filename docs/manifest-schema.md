# Manifest Schema

The current manifest schema version is `tracepack.manifest.v0.4`. Report regeneration still accepts
legacy `tracepack.manifest.v0.1`, `tracepack.manifest.v0.2`, and `tracepack.manifest.v0.3` bundles.

Each `manifest.json` includes:

- TracePack run ID, version, label, and timestamps;
- safe OS metadata and a safe current-folder representation;
- Git evidence before and after the run;
- baseline and final state fingerprints;
- state-observation completeness for changed-file content and overall receipt confidence;
- changed-file paths, statuses, counts, diff statistics, safe metadata, and exclusions;
- command argv, exit code, timings, summaries, truncation metadata, classification, evidence labels,
  and optional `gitBefore`/`gitAfter` state snapshots;
- a top-level `receipt` with final-state validation verdict data;
- deterministic warnings with triggers, evidence references, human-review wording, and limitations;
- redaction summary;
- reproduction guidance;
- explicit limitations.

Runtime validation is implemented with Zod in `src/core/manifest.ts`.

## v0.4 Receipt Fields

`receipt.schemaVersion` is `tracepack.receipt.v0.3`.

`receipt.baseline` and `receipt.final` are Git state snapshots containing `capturedAt`, Git
evidence, an optional deterministic fingerprint, content-observation fields, and limitations.
Fingerprints use `tracepack.state-fingerprint.v1`.

Snapshot observation fields:

- `contentObservation`: `complete`, `partial`, or `unavailable`.
- `overallObservation`: `complete`, `partial`, or `unavailable`; this combines changed-file content
  observation with ignored-path observation.
- `observedChangedFiles`: changed files whose content was safely hashed or where content hashing is
  not applicable, such as deletions.
- `unobservedChangedFiles`: safe changed paths without a content hash, with a reason such as size
  limit, symlink, non-file, unreadable path, or other hash failure.
- `excludedChangedFiles`: changed paths excluded by sensitive-path or TracePack-internal rules.
- `ignoredFiles`: ignored-path observation with `mode`, `reason`, and optional bounded
  count/samples. Sample entries include a path hash; non-sensitive samples may include a path label,
  while sensitive path labels are hidden. Modes are `not_present`, `metadata_observed`,
  `content_observed`, `partial`, `not_observed`, and `unavailable`.

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

`receipt.observationConfidence` is the overall confidence gate: `complete`, `partial`, or
`unavailable`. A successful validation command with a matching fingerprint produces
`validated_final_state` only when this overall confidence is `complete` for the final snapshot and
the matching validation command pre-state snapshot.

`receipt.changedContentObservation` records the narrower Git-reported changed-file content
observation. It can be `complete` while `receipt.observationConfidence` is `partial` because ignored
paths were present but not inspected.

If the fingerprint matches but final or matching command pre-state observation is partial or
unavailable, the receipt uses `inconclusive`, records the matching command in `coveringCommandIds`,
and records the limited match in `limitedCommandIds`.

`receipt.confidenceReasons` contains human-readable, privacy-preserving explanations for limits,
including unhashable changed files, excluded changed files, and ignored-file blind spots.

`receipt.observationLimits` contains structured evidence references for the same limits, such as
`receipt.final.unobservedChangedFiles`, `receipt.final.excludedChangedFiles`, or
`receipt.final.ignoredFiles`. Matching command pre-state limits use refs such as
`commands:cmd-001.gitBefore.ignoredFiles`.

`receipt.evidenceRefs`, `receipt.explanation`, and `receipt.limitations` provide reviewer-facing
context. The receipt is a local evidence claim only; it does not prove correctness, security, or
approval.

## Compatibility

`tracepack report` renders:

- v0.1 manifests with a legacy note because no final-state receipt exists;
- v0.2 manifests with their stored receipt plus a legacy confidence note when confidence fields are
  absent;
- v0.3 manifests with their stored receipt confidence and observation details, without upgrading
  legacy certainty to v0.4 semantics;
- v0.4 manifests with the overall receipt observation gate.
