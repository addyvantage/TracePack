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

TracePack records observed evidence. It does not approve the change or prove correctness.

## GitHub Actions Summary

Inside GitHub Actions, append the latest completed receipt to the job summary explicitly:

```bash
node dist/cli.js report --format all --github-summary --artifact-name "$TRACEPACK_ARTIFACT_NAME"
```

This requires `$GITHUB_STEP_SUMMARY`; local shells fail with a clear error if `--github-summary` is
requested without that file. The uploaded artifact should contain `report.html`, `report.md`,
`summary.json`, `manifest.json`, and `redaction-report.json`.
