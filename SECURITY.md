# Security Policy

Tracepack is local-first. It does not upload source, prompts, transcripts, environment variable
values, `.env` contents, credentials, browser sessions, or repository contents.

## Reporting Security Issues

Please report security issues privately to the maintainers before publishing details. If no private
channel is available yet, open a minimal public issue that says a security report is available
without including exploit details or secrets.

## Privacy Boundaries

Tracepack avoids reading sensitive paths such as `.env`, SSH material, cloud credential folders,
package-manager credential files, private keys, browser cookie stores, and OS keychain-like paths.
Captured command output is truncated and redacted for common secret-like strings.

Redaction is best effort. Do not intentionally print secrets into command output.

## Non-Goals

Tracepack is not a security scanner, policy engine, PR approver, SIEM, hosted dashboard, or
compliance system. It reports deterministic local evidence and explicit limitations.
