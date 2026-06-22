# Limitations

- TracePack observes local evidence only.
- TracePack does not prove correctness, security, merge readiness, or approval.
- TracePack does not replace CI or human review.
- State fingerprints are metadata receipts. They do not contain full source contents or full raw
  diffs.
- A matching fingerprint means TracePack observed matching local Git/worktree metadata, not that the
  code is correct, secure, approved, or complete.
- Sensitive paths and TracePack internal files remain excluded from file hashing and are represented
  only as excluded-evidence markers.
- Command classification is deterministic and conservative.
- Path-based test detection can include fixtures, snapshots, or helper files.
- Redaction is best effort and cannot guarantee every sensitive value was removed.
- TracePack does not capture validation that happened outside `tracepack run`.
