# Quickstart

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label review
node dist/cli.js status
node dist/cli.js run -- npm test
node dist/cli.js finish
node dist/cli.js report
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
