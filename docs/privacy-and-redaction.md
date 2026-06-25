# Privacy And Redaction

TracePack is local-first. It writes bundles to `.tracepack/<run-id>/` and does not upload source,
prompts, transcripts, environment variable values, `.env` contents, credentials, browser sessions,
or repository contents.

`tracepack start` adds `.tracepack/` to `.git/info/exclude` for the local clone when needed, so
TracePack's own bundle directory does not contaminate receipts. This does not edit tracked source
files. Add `.tracepack/` to `.gitignore` only if you want a shared repository ignore rule.
`tracepack doctor` reports whether `.tracepack/` appears to be ignored by Git, but the check is best
effort.

## Excluded Paths

TracePack excludes sensitive path patterns before reading file metadata or optional hashes:

- `.env` and `.env.*`;
- SSH material and private keys;
- cloud credential folders such as `.aws`, `.azure`, and gcloud config;
- package-manager credential files such as `.npmrc`, `.yarnrc`, and `.pnpmrc`;
- browser cookie/profile stores and OS keychain-like paths;
- TracePack internal `.tracepack/` state.

## Output Redaction

Captured stdout and stderr summaries are truncated and redacted for common secret-like strings such
as API keys, GitHub tokens, AWS access keys, assignment-style secrets, and private key blocks.

Redaction is best effort, not a guarantee. Avoid printing secrets during validation commands.

## Command Argument Redaction

TracePack executes the command with the original argv supplied to `tracepack run`, then sanitizes
the argv representation before writing session state, manifests, reports, summaries, and
reproduction instructions. The sanitizer handles common token-like values, assignment forms such as
`--token=<value>`, split forms such as `--token <value>`, bearer authorization headers, recognized
secret-like query parameters, and sensitive/local path arguments.

Commands containing redacted arguments may not be directly reproducible from saved artifacts.
Reports include a note when locally supplied values may be required before rerunning a reproduction
command.

Argument redaction is best effort, not a guarantee. Prefer safer local configuration mechanisms over
passing secrets directly as command-line arguments.

## GitHub Actions Artifacts

TracePack does not upload artifacts by itself. If a GitHub Actions workflow uploads `.tracepack/`,
GitHub stores the receipt data as a workflow artifact. People with access to that artifact may be
able to inspect sanitized command strings, captured output summaries, changed-file paths, Git
branch/SHA metadata, report files, and redaction metadata.

`tracepack report --github-summary` writes a compact Markdown summary to `$GITHUB_STEP_SUMMARY` only
when explicitly requested. The summary omits raw stdout/stderr and uses the same best-effort command
argument sanitizer as the full reports. The full artifact remains the complete receipt handoff.
Redaction is still best effort, so validation commands should avoid printing or passing secrets.
