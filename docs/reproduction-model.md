# Reproduction Model

TracePack preserves the commands it observed as argv lists and renders shell-readable reproduction
guidance. It does not replay commands automatically and does not claim commands are safe to rerun.

Review every command before rerunning it. TracePack only knows what it observed through
`tracepack run -- <command...>`.

The manifest intentionally omits full repository contents and full raw diffs by default. A reviewer
should use the local repository, CI, and human review alongside the TracePack bundle.
