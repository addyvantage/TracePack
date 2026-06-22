# Contributing

TracePack is a local-first evidence tool. Contributions should keep the v0.1 promise narrow:
deterministic local evidence, redacted bundles, static reports, and honest limitations.

## Local Setup

```bash
npm install
npm run verify
```

Use project-local dependencies only. Do not add global install requirements, hosted services,
databases, OAuth flows, or external model APIs for core behavior.

## Contribution Rules

- Do not claim TracePack proves correctness, safety, security, or approval.
- Do not capture raw repository contents, full diffs, prompts, environment values, credentials, or
  browser sessions by default.
- Add tests for new warning rules, redaction behavior, manifest fields, and report rendering.
- Keep warning triggers deterministic and explainable.
- Prefer boring TypeScript and Node standard library APIs unless a dependency clearly reduces risk.

## Verification

Before opening a PR, run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run demo:smoke
git diff --check
```
