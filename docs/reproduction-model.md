# Reproduction Model

TracePack preserves the commands it observed as argv lists and renders shell-readable reproduction
guidance. It does not replay commands automatically and does not claim commands are safe to rerun.

Review every command before rerunning it. TracePack only knows what it observed through
`tracepack run -- <command...>`.

The manifest intentionally omits full repository contents and full raw diffs by default. A reviewer
should use the local repository, CI, and human review alongside the TracePack bundle.

## Validation Subject

TracePack treats a validation command's pre-state as the state that command validated. A successful
validation command covers the final state only when `command.gitBefore.fingerprint.value` equals
`receipt.final.fingerprint.value`.

If a validation command changes the worktree, that command validated its pre-state, not the new
post-command state. Unless a later successful validation command covers the new final fingerprint,
the receipt reports stale or inconclusive validation rather than success.
