# GitHub Actions

TracePack v0.1 provides a documented workflow example, not a published Marketplace Action and not a
GitHub App.

The example in `examples/github-actions/TracePack.yml`:

- uses least privilege with `contents: read`;
- installs project dependencies with `npm ci`;
- builds the local CLI;
- runs only the validation command configured in the workflow;
- uploads `.tracepack/` as a GitHub Actions artifact;
- writes a small job summary;
- does not require secrets;
- does not post PR comments;
- does not approve, merge, or claim safety.

Adapt the validation command to your project:

```yaml
- name: TracePack run validation
  run: node dist/cli.js run -- npm test
```

Artifacts are stored by GitHub Actions. TracePack itself does not upload to external storage outside
the workflow steps you configure.
