# Reproduction Model

TracePack preserves the commands it observed as argv lists and renders shell-readable reproduction
guidance. It does not replay commands automatically and does not claim commands are safe to rerun.

Review every command before rerunning it. TracePack only knows what it observed through
`tracepack run -- <command...>`.

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

Ignored files are outside default Git status evidence. TracePack does not enumerate or read ignored
file contents by default, including common ignored directories such as `node_modules`. If validation
depends on ignored runtime files, the report surfaces this as a blind spot, but the ignored file
contents are not captured.

In v0.4, ignored paths observed by Git reduce overall receipt confidence unless they are absent or
explicitly observed under a future stronger mode. This is conservative: changed-file content
observation can be complete while overall receipt confidence is still partial because ignored inputs
were present but not inspected in the final state or the matching validation pre-state.
