# Reproduction Model

TracePack executes the original argv supplied to `tracepack run`, then preserves a sanitized argv
representation and renders shell-readable reproduction guidance from that sanitized representation.
It does not replay commands automatically and does not claim commands are safe to rerun.

Review every command before rerunning it. TracePack only knows what it observed through
`tracepack run [--timeout <seconds>] -- <command...>`.

When command arguments are redacted, the saved reproduction command may require locally supplied
values before it can be rerun. TracePack does not store the original redacted value for convenience.
Argument redaction is best effort, not a guarantee; avoid passing secrets directly as command-line
arguments when safer alternatives exist.

`tracepack run` applies a 300-second timeout by default. A timed-out command remains part of the
local evidence bundle, including captured stdout and stderr so far, but it is failed command
evidence and not successful validation.

`tracepack status` reads stored session data to show the active run, captured commands, and stale
pointer diagnostics. It does not recapture the current Git state. `tracepack clean` removes only the
active-session pointer and leaves `.tracepack/<run-id>/` session and bundle artifacts in place.

The manifest intentionally omits full repository contents and full raw diffs by default. A reviewer
should use the local repository, CI, and human review alongside the TracePack bundle.

## Validation Subject

TracePack treats a validation command's pre-state as the state that command validated. A successful
validation command covers the final observed state only when `command.gitBefore.fingerprint.value`
equals `receipt.final.fingerprint.value` and the receipt's overall `observationConfidence` is
`complete` for both the final snapshot and the matching validation pre-state snapshot.

If a validation command changes the worktree, that command validated its pre-state, not the new
post-command state. Unless a later successful validation command covers the new final fingerprint,
the receipt reports stale or inconclusive validation rather than success.

## Observed Repository State

TracePack's repository-state evidence comes from bounded local Git commands. Git-reported changed
files are represented by path/status metadata, diff stats, safe content hashes where allowed, and
excluded-evidence markers. TracePack does not store full source contents or full raw diffs.

Ignored files are outside the tracked/source-state fingerprint. TracePack does not read ignored file
contents. Common generated environment paths such as `node_modules/`, `.venv/`, `.pytest_cache/`,
and `__pycache__/` are reported as ambient environment notes when present; those notes do not claim
the ignored contents were read, hashed, or validated.

Sensitive/local ignored inputs and unknown ignored paths remain confidence-limiting. This is
conservative: changed-file content observation can be complete while overall receipt confidence is
still partial because ignored inputs were present but not inspected in the final state or the
matching validation pre-state.
