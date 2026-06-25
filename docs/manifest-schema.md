# Manifest Schema

The current manifest schema version is `tracepack.manifest.v0.4`. Report regeneration still accepts
legacy `tracepack.manifest.v0.1`, `tracepack.manifest.v0.2`, and `tracepack.manifest.v0.3` bundles.

Each `manifest.json` includes:

- TracePack run ID, version, label, and timestamps;
- safe OS metadata and a safe current-folder representation;
- Git evidence before and after the run;
- baseline and final state fingerprints;
- state-observation completeness for changed-file content, ignored-path relevance, and overall
  receipt confidence;
- changed-file paths, statuses, counts, diff statistics, safe metadata, and exclusions;
- sanitized command argv, argument-redaction metadata, exit code, timings, summaries, truncation
  metadata, classification, evidence labels, and optional `gitBefore`/`gitAfter` state snapshots;
- a top-level `receipt` with final-state validation verdict data;
- deterministic warnings with triggers, evidence references, human-review wording, and limitations;
- redaction summary;
- reproduction guidance;
- explicit limitations.

Runtime validation is implemented with Zod in `src/core/manifest.ts`.

Command evidence stores the sanitized argv representation in `commands[].argv`. Newer v0.4 bundles
may also include `commands[].argumentRedaction` with `argumentsRedacted`, `redactedArgumentCount`,
`reproductionMayRequireLocalValues`, and redaction replacement categories. The original raw argv is
used only to execute the local command and is not written to the manifest.

`reproduction.reproductionMayRequireLocalValues` is true when a stored reproduction command contains
redacted arguments. Such commands may require locally supplied values before rerun.

## v0.4 Receipt Fields

`receipt.schemaVersion` is `tracepack.receipt.v0.3`.

`receipt.baseline` and `receipt.final` are Git state snapshots containing `capturedAt`, Git
evidence, an optional deterministic fingerprint, content-observation fields, and limitations.
Fingerprints use `tracepack.state-fingerprint.v1`.

Snapshot observation fields:

- `contentObservation`: `complete`, `partial`, or `unavailable`.
- `overallObservation`: `complete`, `partial`, or `unavailable`; this combines changed-file content
  observation with confidence-limiting ignored-path observation. Ambient ignored environment paths
  do not by themselves make this partial.
- `observedChangedFiles`: changed files whose content was safely hashed or where content hashing is
  not applicable, such as deletions.
- `unobservedChangedFiles`: safe changed paths without a content hash, with a reason such as size
  limit, symlink, non-file, unreadable path, or other hash failure.
- `excludedChangedFiles`: changed paths excluded by sensitive-path or TracePack-internal rules.
- `ignoredFiles`: ignored-path observation with `mode`, `reason`, optional bounded count/samples,
  optional relevance counts (`ambientCount`, `sensitiveLocalCount`, `unknownCount`), and optional
  `limitsConfidence`. Sample entries include a path hash and may include a relevance value of
  `ambient_environment`, `sensitive_local_input`, or `unknown`. Non-sensitive samples may include a
  path label, while sensitive path labels are hidden. Modes are `not_present`, `metadata_observed`,
  `content_observed`, `partial`, `not_observed`, and `unavailable`.

`receipt.verdict` is one of:

- `validated_final_state`
- `validation_stale`
- `validation_failed`
- `command_failed`
- `command_interrupted`
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
observation. It can be `complete` while `receipt.observationConfidence` is `partial` because
sensitive/local ignored inputs or unknown ignored paths were present but not inspected. If only
ambient ignored environment paths such as `node_modules/`, `.venv/`, `.pytest_cache/`, or
`__pycache__/` are present, the receipt can still have `complete` confidence for the tracked/source
state and will list those paths as environment notes instead of validation evidence.

If the fingerprint matches but final or matching command pre-state observation is partial or
unavailable, the receipt uses `inconclusive`, records the matching command in `coveringCommandIds`,
and records the limited match in `limitedCommandIds`.

`receipt.confidenceReasons` contains human-readable, privacy-preserving explanations for limits,
including unhashable changed files, excluded changed files, sensitive/local ignored inputs, and
unknown ignored paths.

`receipt.observationLimits` contains structured evidence references for the same limits, such as
`receipt.final.unobservedChangedFiles`, `receipt.final.excludedChangedFiles`, or
`receipt.final.ignoredFiles`. Ignored-path limit kinds distinguish sensitive/local ignored inputs
from unknown ignored paths. Matching command pre-state limits use refs such as
`commands:cmd-001.gitBefore.ignoredFiles`.

`receipt.environmentNotes` contains non-limiting ambient ignored environment notes. These notes mean
the paths were present and not read or hashed; they do not claim dependency, cache, build output, or
environment contents were validated.

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

GitHub Actions job summaries generated by `tracepack report --github-summary` are derived from the
stored bundle files and do not change `manifest.json`, receipt schema versions, or legacy report
compatibility. The summary intentionally omits raw stdout/stderr and uses the same best-effort
command-argument sanitizer as the reports; review the uploaded `report.html`, `summary.json`, and
`manifest.json` for full offline receipt details.
