# TracePack

## Local evidence of whether your tests actually covered your final code.

Your coding agent says tests passed. Did it validate the final code state?

TracePack is a local-first CLI that records deterministic, redacted receipts of whether successful
validation was observed for your final repository state. No accounts, no upload.

Start with the synthetic sample reports:

- [Stale validation sample](docs/assets/stale-report.html)
- [Final-state validation observed sample](docs/assets/validated-report.html)
- [How the sample assets are generated](docs/assets/README.md)

## Terminal Example

```text
⚠ Validation evidence incomplete
  Successful validation was observed, but the repository changed afterward.
  The final state was not observed by validation.

  validation   observed    npm test · exit 0
  final state  f9a14c      changed after last validation
  changed files 1          src/calc.mjs
  needs review 1          TP001 Successful validation was observed, but not for the final repository state.

  report       .tracepack/<run-id>/report.html
  → re-run validation against the final state, then tracepack finish
```

## 30-Second Quickstart

From this repository:

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label local-review
# make or review local changes
node dist/cli.js run -- npm test
node dist/cli.js finish
```

Open `.tracepack/<run-id>/report.html` directly from disk. The report is static HTML with inline
CSS; it does not need a server, account, browser extension, CDN, or external model API.

For a one-command local receipt:

```bash
node dist/cli.js run -- npm test
```

## Stale-Validation Walkthrough

TracePack’s core question is not “did tests pass at some point?” It is “was successful validation
observed for the final captured repository state?”

1. Start a session.
2. Change code.
3. Run validation through TracePack.
4. Change code again.
5. Finish the session.

That produces a stale-validation receipt: successful validation was observed, but the final state
was not observed by validation. Re-run validation after the final change and finish again to produce
`Final-state validation observed`.

## What TracePack Observes

- Git repository detection, branch, HEAD, dirty state, changed-file metadata, diff statistics, and
  deterministic state fingerprints.
- Commands run through `tracepack run -- <command...>`, including sanitized argv, timestamps,
  duration, exit code, conservative command classification, and pre/post command Git state.
- Redacted and bounded stdout/stderr summaries for captured commands.
- A final-state receipt comparing validation command pre-state fingerprints with the final captured
  repository-state fingerprint.
- Deterministic warnings for stale, failed, missing, or inconclusive final-state validation and
  test-related review triggers.
- A local `.tracepack/<run-id>/` bundle containing `manifest.json`, `redaction-report.json`, and
  `report.html`, with optional Markdown and JSON exports.

## What TracePack Does Not Prove

Tracepack records observed local evidence. It does not prove code correctness, test sufficiency,
security, or merge approval.

TracePack is not an AI code reviewer, security scanner, CI replacement, PR approver, merge gate,
hosted dashboard, or agent transcript recorder.

## Privacy And Local-First Boundaries

TracePack does not upload source code, prompts, transcripts, environment variable values, `.env`
contents, SSH keys, API keys, browser cookies, credential stores, or unrelated workspace contents.

Command arguments and captured output summaries are sanitized before persistence using best-effort
redaction. Avoid passing secrets directly as command-line arguments when safer alternatives exist.

On first `tracepack start` inside a Git repo, TracePack may add `.tracepack/` to the local
`.git/info/exclude` file for this clone. It does not edit tracked `.gitignore` automatically.

## Demo And Showcase

Run the deterministic demo:

```bash
npm run demo:smoke
```

The demo creates local fixture repositories under `examples/demo-regression/.work/` and preserves
four outcomes: stale validation, final-state validation observed, partial observation, and ignored
local input.

Regenerate the public showcase reports:

```bash
npm run showcase:generate
```

The showcase uses synthetic data only and writes self-contained HTML reports to `docs/assets/`.

## CLI Reference

```bash
tracepack start [--label <name>]
tracepack run [--timeout <seconds>] -- <command...>
tracepack status
tracepack finish [--label <name>] [--verbose]
tracepack report [bundle-dir] [--format html|markdown|json|all] [--out <path>] [--github-summary] [--artifact-name <name>]
tracepack assert <bundle-dir> [--require-verdict <verdict>] [--require-confidence <confidence>] [--allow-warnings] [--json] [--summary-out <path>] [--quiet]
tracepack clean [--force]
tracepack doctor
```

`tracepack run` stops the child command after 300 seconds by default. Use `--timeout <seconds>`
before `--` to set a different positive-integer timeout.

`tracepack report [bundle-dir]` regenerates local report exports. `--format all` writes
`report.html`, `report.md`, and `summary.json`. `--github-summary` appends a compact Markdown
summary to `$GITHUB_STEP_SUMMARY` when explicitly used in GitHub Actions.

`tracepack assert <bundle-dir>` evaluates a local policy against a generated bundle and exits
non-zero when the observed evidence does not match that policy.

## Contributing

Use Node.js 20.11 or newer.

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run demo:smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor path and
[docs/architecture.md](docs/architecture.md) for the local receipt model.

## Roadmap

- Keep the report static, local, printable, and inspectable from `file://`.
- Harden deterministic command classification and receipt confidence for more ecosystems.
- Improve CI artifact handoff while keeping uploads explicit and user-controlled.
- Improve fixture coverage for partial repository observation and redaction edge cases.

No hosted service, user accounts, OAuth flow, GitHub App, score, approval signal, or agent
transcript capture is on the public-alpha roadmap.

## License

MIT. See [LICENSE](LICENSE).
