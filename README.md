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
  ignored files are surfaced without reading secrets.
- Overall receipt confidence is stricter than changed-file content observation: ignored paths that
  are present but not inspected make matching validation limited rather than fully validated.
- Deterministic warnings such as stale, failed, missing, or inconclusive final-state validation and
  test-related file changes.
- A local `.tracepack/<run-id>/` bundle with `manifest.json`, `redaction-report.json`, and
  `report.html`.

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

## What It Does Not Prove

TracePack does not prove correctness, security, merge readiness, policy compliance, developer
intent, or that validation did not happen elsewhere.

## CLI

```bash
tracepack start [--label <name>]
tracepack run -- <command...>
tracepack finish [--label <name>]
tracepack report <bundle-dir>
tracepack doctor
```

The CLI uses local Git and user-approved commands. It does not require a remote repository,
accounts, auth, a database, Docker, a browser extension, or external model APIs.

## Demo

After building, run:

```bash
npm run demo:smoke
```

The demo creates local fixture repositories under `examples/demo-regression/.work/`, generates a
stale-validation bundle, a corrected bundle where validation happens after the final observed
change, a partial-observation bundle, and an ignored-input bundle that does not overclaim
validation.

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
