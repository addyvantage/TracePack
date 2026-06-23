# Roadmap

## v0.1

- Local TypeScript CLI.
- Git evidence, command evidence, redaction, deterministic warnings, static report, demo fixtures,
  and GitHub Actions example workflow.

## v0.5

- Local Markdown and JSON report exports for PR/CI consumption.
- No hosted service, dashboard, PR bot, source upload, or approval claim.

## v0.6

- Local CI policy checks with `tracepack assert <bundle-dir>`.
- Machine-readable assertion JSON for CI artifacts.
- Explicit local policy gates for receipt verdict, receipt confidence, and warnings without claiming
  correctness, security, approval, compliance, or merge readiness.

## Candidate Future Work

- More deterministic command classifiers.
- More local report export polish.
- Optional AI-generated summary clearly labeled: "Optional AI-generated summary. Not evidence."
- A reusable GitHub Action only if the local CLI workflow proves useful first.

## Explicit Non-Goals

Hosted dashboards, accounts, billing, OAuth, source upload, generic AI code review, broad compliance
claims, automatic PR approval, and enterprise governance are not v0.1 goals.
