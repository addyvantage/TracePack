# Limitations

- Tracepack observes local evidence only.
- Tracepack does not prove correctness, security, merge readiness, or approval.
- Tracepack does not replace CI or human review.
- Filesystem timestamps can be imperfect.
- Command classification is deterministic and conservative.
- Path-based test detection can include fixtures, snapshots, or helper files.
- Redaction is best effort and cannot guarantee every sensitive value was removed.
- Tracepack does not capture validation that happened outside `tracepack run`.
