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
- Changed files larger than the safe hashing limit, symlinks, non-files, and unreadable files are
  represented as partial observation with reasons instead of being read.
- Git ignored files are outside TracePack's default repository-state evidence. TracePack does not
  enumerate or hash ignored file contents by default.
- A matching validation fingerprint with partial observation is reported as inconclusive rather than
  complete final-state validation.
- Command classification is deterministic and conservative.
- Path-based test detection can include fixtures, snapshots, or helper files.
- Redaction is best effort and cannot guarantee every sensitive value was removed.
- TracePack does not capture validation that happened outside `tracepack run`.
