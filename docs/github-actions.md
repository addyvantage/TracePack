# GitHub Actions

TracePack provides a documented workflow example, not a published Marketplace Action and not a
GitHub App.

The example in `examples/github-actions/tracepack.yml`:

- uses least privilege with `contents: read`;
- installs project dependencies with `npm ci`;
- builds the local CLI;
- runs only the validation command configured in the workflow;
- regenerates HTML, Markdown, and JSON report exports;
- runs an explicit local policy assertion with `tracepack assert`;
- uploads `.tracepack/` as a GitHub Actions artifact;
- writes a small job summary;
- captures the final-state validation receipt in the uploaded bundle;
- captures `assertion.json` in the uploaded bundle when the assertion step runs;
- does not require secrets;
- does not post PR comments;
- does not approve, merge, or claim safety.

Adapt the validation command to your project:

```yaml
- name: TracePack run validation
  run: node dist/cli.js run -- npm test
```

The example keeps the finish/report/upload steps under `if: always()` so the evidence bundle is
still available when validation or assertion fails. The policy step is intentionally explicit:

```yaml
- name: TracePack policy assertion
  if: always()
  run: >-
    node dist/cli.js assert "$TRACEPACK_BUNDLE" --require-verdict validated_final_state
    --require-confidence complete --summary-out "$TRACEPACK_BUNDLE/assertion.json"
```

That command exits non-zero unless the observed receipt verdict is `validated_final_state`, receipt
confidence is `complete`, and the bundle has no warnings. Change the required verdicts, confidence,
or `--allow-warnings` only when that matches your local review policy.

Artifacts are stored by GitHub Actions. TracePack itself does not upload to external storage outside
the workflow steps you configure.

Reviewers should download or open the uploaded bundle and inspect `report.html`, `report.md`,
`summary.json`, and `assertion.json`, especially the Final-State Validation Receipt verdict and
overall confidence line. A passing assertion is still a local evidence check only; it does not prove
correctness, security, approval, policy compliance, or merge readiness. Partial or inconclusive
confidence means some repository/input state, such as changed content or ignored paths, was not
fully observed by TracePack.
