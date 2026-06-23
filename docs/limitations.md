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
  enumerate or hash ignored file contents by default. Ignored-path samples may include non-sensitive
  path labels; sensitive path labels are hidden and represented by path hash plus reason.
- A matching validation fingerprint with partial changed-content or ignored-path observation in the
  final snapshot or validation pre-state snapshot is reported as inconclusive rather than complete
  final-state validation.
- Command classification is deterministic and conservative.
- Path-based test detection can include fixtures, snapshots, or helper files.
- Redaction is best effort and cannot guarantee every sensitive value was removed.
- TracePack does not capture validation that happened outside `tracepack run`.
- Timeout handling terminates the direct child process first. Detached descendant processes may be
  platform-dependent and should be reviewed separately.
- Robust cross-platform Ctrl+C/SIGINT command evidence capture is not implemented yet. Use
  `tracepack status` and `tracepack clean --force` to recover from abandoned active-session
  pointers.
- `tracepack status` relies on stored session data. It does not recapture or hash the current Git
  state.
- `.tracepack/` Git ignore detection in `doctor` is best-effort and based on Git's ignore rules for
  the current work tree.
