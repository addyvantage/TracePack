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
- Git ignored files are outside TracePack's tracked/source-state fingerprint. TracePack does not
  read or hash ignored file contents. Ignored-path samples may include non-sensitive path labels;
  sensitive path labels are hidden and represented by path hash plus reason.
- Ambient ignored environment paths such as dependency folders, virtual environments, caches,
  coverage outputs, and build outputs are reported as environment notes. Their presence does not by
  itself make a matching successful validation inconclusive, and TracePack does not claim those
  ignored contents were read or validated.
- Sensitive/local ignored inputs and unknown ignored paths remain confidence-limiting. A matching
  validation fingerprint with partial changed-content, sensitive/local ignored input limits, unknown
  ignored path limits, or unavailable observation in the final snapshot or validation pre-state
  snapshot is reported as inconclusive rather than complete final-state validation.
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
  the current work tree. `tracepack start` may add `.tracepack/` to `.git/info/exclude` for the
  local clone without editing tracked `.gitignore` files.
- GitHub Actions support is a report/artifact handoff only. TracePack does not provide a GitHub App,
  PR comment bot, hosted dashboard, or automatic merge gate.
- `tracepack report --github-summary` writes only when explicitly requested and when
  `$GITHUB_STEP_SUMMARY` is available. The summary is a compact view of the existing receipt bundle,
  not a separate evidence source.
- CI artifacts are stored by GitHub Actions, not by TracePack. People with access to workflow
  artifacts may be able to inspect command strings, captured output summaries, changed-file paths,
  Git metadata, and receipt files.
- A green GitHub Actions job that generated a TracePack artifact means the receipt workflow
  completed. It does not prove correctness, security, approval, merge readiness, or policy
  compliance.
