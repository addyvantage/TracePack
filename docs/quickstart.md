# Quickstart

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js start --label review
node dist/cli.js run -- npm test
node dist/cli.js finish
```

Open `.tracepack/<run-id>/report.html` from disk. No server is required.

Use one-command mode when you only need to wrap a single validation command:

```bash
node dist/cli.js run -- npm test
```

TracePack records observed evidence. It does not approve the change or prove correctness.
