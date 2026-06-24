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
