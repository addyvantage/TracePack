# Limitations

- TracePack observes local evidence only.
- TracePack does not prove correctness, security, merge readiness, or approval.
- TracePack does not replace CI or human review.
- Filesystem timestamps can be imperfect.
- Command classification is deterministic and conservative.
- Path-based test detection can include fixtures, snapshots, or helper files.
- Redaction is best effort and cannot guarantee every sensitive value was removed.
- TracePack does not capture validation that happened outside `tracepack run`.
