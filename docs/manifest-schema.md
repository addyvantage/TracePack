# Manifest Schema

The v0.1 manifest schema version is `tracepack.manifest.v0.1`.

Each `manifest.json` includes:

- TracePack run ID, version, label, and timestamps;
- safe OS metadata and a safe current-folder representation;
- Git evidence before and after the run;
- changed-file paths, statuses, counts, diff statistics, safe metadata, and exclusions;
- command argv, exit code, timings, summaries, truncation metadata, classification, and evidence
  labels;
- deterministic warnings with triggers, evidence references, human-review wording, and limitations;
- redaction summary;
- reproduction guidance;
- explicit limitations.

Runtime validation is implemented with Zod in `src/core/manifest.ts`.
