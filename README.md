# Tracepack

Tracepack captures deterministic local evidence around an AI-assisted code change and renders a
redacted reproducible review bundle showing what changed, what validation ran, what was not
observed, and what needs human review.

Tracepack does not prove code is correct. It does not prove security. It does not approve PRs. It
observes local evidence only.

## 30-Second Quickstart

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label local-review
node dist/cli.js run -- npm test
node dist/cli.js finish
```

Open `.tracepack/<run-id>/report.html` directly from disk.

For a one-command bundle:

```bash
node dist/cli.js run -- npm test
```

## What Tracepack Captures

- Git repository detection, branch, HEAD before and after, dirty-state status, changed-file
  metadata, changed-file counts, and diff statistics.
- Commands run through `tracepack run -- <command...>`, including argv, timestamps, duration, exit
  code, conservative command classification, and redacted/truncated stdout and stderr summaries.
- Deterministic warnings such as missing successful validation after the final observed code change
  and test-related file changes.
- A local `.tracepack/<run-id>/` bundle with `manifest.json`, `redaction-report.json`, and
  `report.html`.

## What Tracepack Does Not Capture

Tracepack does not capture entire repository contents, full raw diffs by default, prompt
transcripts, environment variable values, `.env` contents, SSH keys, API keys, browser cookies,
credential stores, or unrelated workspace contents. Redaction is best effort and not a guarantee.

## What It Proves

Tracepack can support narrow observed claims, such as:

- a specific command was run through Tracepack;
- that command exited with a specific code at a specific time;
- Git observed a specific final changed-file set;
- no successful validation command was observed after the final observed changed-file timestamp.

## What It Does Not Prove

Tracepack does not prove correctness, security, merge readiness, policy compliance, developer
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
missing-validation bundle, then generates a corrected bundle where validation happens after the
final observed change.

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

This repository uses TypeScript, Node.js, Commander, Zod, Vitest, ESLint, and Prettier. The v0.1
foundation intentionally avoids React, Next.js, a hosted backend, cloud storage, source upload,
OAuth, and generic AI review.

## License

MIT is used for low-friction early adoption. Apache-2.0 remains a reasonable future alternative if
patent clarity becomes important.
