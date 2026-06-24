# TracePack

TracePack captures deterministic local evidence around an AI-assisted code change and renders a
redacted reproducible review bundle showing what changed, what validation ran, whether successful
validation covered the final observed repository state, how complete that state observation was,
what was not observed, and what needs human review.

TracePack does not prove code is correct. It does not prove security. It does not approve PRs. It
observes local evidence only.

## 30-Second Quickstart

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label local-review
node dist/cli.js status
# make or review local changes
node dist/cli.js run -- npm test
node dist/cli.js finish
```

Open `.tracepack/<run-id>/report.html` directly from disk.

For a one-command bundle:

```bash
node dist/cli.js run -- npm test
```

## What TracePack Captures

- Git repository detection, branch, HEAD before and after, dirty-state status, changed-file
  metadata, changed-file counts, diff statistics, and deterministic state fingerprints.
- Commands run through `tracepack run -- <command...>`, including argv, timestamps, duration, exit
  code, conservative command classification, pre/post command Git state snapshots, and
  redacted/truncated stdout and stderr summaries.
- A final-state validation receipt showing whether a successful validation command's pre-state
  fingerprint matched the final observed repository-state fingerprint.
- Receipt confidence showing whether changed-file content observation was complete, partial, or
  unavailable. Large files, symlinks, non-files, unreadable files, excluded sensitive paths, and
  confidence-limiting ignored inputs are surfaced without reading secrets.
- Ignored-path relevance: ordinary ambient environment paths such as `node_modules/`, `.venv/`, and
  caches are reported as environment notes, while sensitive/local ignored inputs and unknown ignored
  paths still limit receipt confidence.
- Deterministic warnings such as stale, failed, missing, or inconclusive final-state validation and
  test-related file changes.
- A local `.tracepack/<run-id>/` bundle with `manifest.json`, `redaction-report.json`, and
  `report.html`.
- Optional local report exports for PR/CI consumption: Markdown (`report.md`) and stable summary
  JSON (`summary.json`).

## What TracePack Does Not Capture

TracePack does not capture entire repository contents, full raw diffs by default, prompt
transcripts, environment variable values, `.env` contents, SSH keys, API keys, browser cookies,
credential stores, or unrelated workspace contents. Redaction is best effort and not a guarantee.

## What It Proves

TracePack can support narrow observed claims, such as:

- a specific command was run through TracePack;
- that command exited with a specific code at a specific time;
- Git observed a specific final changed-file set;
- a successful validation command was observed against the same local state fingerprint as the final
  observed repository state with complete overall receipt observation for both the final state and
  the matching validation pre-state;
- a validation fingerprint match was limited by partial observation, or that validation was stale,
  failed, missing, or inconclusive.
- ambient ignored environment paths were present but not read, hashed, or validated.

## What It Does Not Prove

TracePack does not prove correctness, security, merge readiness, policy compliance, developer
intent, or that validation did not happen elsewhere.

## CLI

```bash
tracepack start [--label <name>]
tracepack run [--timeout <seconds>] -- <command...>
tracepack status
tracepack finish [--label <name>]
tracepack report [bundle-dir] [--format html|markdown|json|all] [--out <path>]
tracepack assert <bundle-dir> [--require-verdict <verdict>] [--require-confidence <confidence>] [--allow-warnings] [--json] [--summary-out <path>] [--quiet]
tracepack clean [--force]
tracepack doctor
```

The CLI uses local Git and user-approved commands. It does not require a remote repository,
accounts, auth, a database, Docker, a browser extension, or external model APIs.

On first `tracepack start` inside a Git repo, TracePack idempotently adds `.tracepack/` to the local
`.git/info/exclude` file when needed. It does not edit tracked `.gitignore` automatically.

`tracepack run` stops the child command after 300 seconds by default. Use `--timeout <seconds>`
before `--` to set a different positive-integer timeout for that command. Timed-out commands
preserve captured output so far, are marked as failed command evidence, and do not count as
successful validation.

Command classification is deterministic and conservative. Common validation commands include test,
lint, typecheck, and focused local checks such as `git diff --check`; classification does not imply
correctness, coverage, or merge readiness.

`tracepack status` shows whether an active session exists, what commands have been captured, and
whether the active-session pointer is stale. `tracepack clean` removes only
`.tracepack/active-session.json`; it does not delete completed bundles or session files. Use
`--force` for non-interactive recovery.

`tracepack report [bundle-dir]` defaults to the original HTML behavior and regenerates
`report.html`. When run without a bundle path inside a repo, it selects the latest completed
`.tracepack/` bundle. Use `--format markdown` for a PR-friendly Markdown report, `--format json` for
a CI-friendly `tracepack.summary.v0.1` JSON summary, or `--format all` to write `report.html`,
`report.md`, and `summary.json` in the bundle directory. `--out <path>` is available for single
formats only.

`tracepack assert <bundle-dir>` evaluates the bundle's manifest against an explicit local policy and
exits non-zero when it fails. By default it requires `validated_final_state`, `complete` receipt
confidence, and zero warnings. Use `--require-verdict` with a comma-separated or repeated set of
accepted receipt verdicts, `--require-confidence complete|partial|unavailable`, `--allow-warnings`
when warnings should not fail the policy, `--json` for machine-readable output, and
`--summary-out <path>` to write `tracepack.assertion.v0.1` JSON for CI artifacts. A passing
assertion means only that the observed evidence matched the configured policy; it does not prove
correctness, security, approval, policy compliance, or merge readiness.

## Demo

After building, run:

```bash
npm run demo:smoke
```

The demo creates local fixture repositories under `examples/demo-regression/.work/`, generates a
stale-validation bundle, a corrected bundle where validation happens after the final observed
change, a partial-observation bundle, and an ignored local-input bundle that does not overclaim
validation when ignored local config changes.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run verify
```

This repository uses TypeScript, Node.js 20+, Commander, Zod, Vitest, ESLint, and Prettier. The
local-first foundation intentionally avoids React, Next.js, a hosted backend, cloud storage, source
upload, OAuth, and generic AI review.

Release note: the unscoped npm package name `tracepack` may be unavailable or owned elsewhere. This
repository is not published to npm by these instructions; publishing may require a scoped package
name or ownership resolution.

## License

MIT is used for low-friction early adoption. Apache-2.0 remains a reasonable future alternative if
patent clarity becomes important.
