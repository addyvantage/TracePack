# Quickstart

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label review
node dist/cli.js status
node dist/cli.js run -- npm test
node dist/cli.js finish
node dist/cli.js report --format all
```

Open `.tracepack/<run-id>/report.html` from disk. No server is required. When run inside a
repository, `tracepack report` without a bundle path regenerates the latest completed local bundle
under `.tracepack/`.

Use one-command mode when you only need to wrap a single validation command:

```bash
node dist/cli.js run -- npm test
```

If a session is interrupted or abandoned, inspect it with:

```bash
node dist/cli.js status
```

To remove only the active-session pointer without deleting bundles or session data:

```bash
node dist/cli.js clean --force
```

Use `node dist/cli.js finish --verbose` when you need full receipt and confidence detail in the
terminal. The default finish output is intentionally compact and points to the static HTML report.

Tracepack records observed local evidence. It does not prove code correctness, test sufficiency,
security, or merge approval.

## GitHub Actions Summary

Inside GitHub Actions, append the latest completed receipt to the job summary explicitly:

```bash
node dist/cli.js report --format all --github-summary --artifact-name "$TRACEPACK_ARTIFACT_NAME"
```

This requires `$GITHUB_STEP_SUMMARY`; local shells fail with a clear error if `--github-summary` is
requested without that file. The uploaded artifact should contain `report.html`, `report.md`,
`summary.json`, `manifest.json`, and `redaction-report.json`.
