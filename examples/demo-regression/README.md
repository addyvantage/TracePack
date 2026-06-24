# TracePack Regression Demo

Run from the repository root:

```bash
npm run demo:smoke
```

The script creates local fixture repositories under `.work/`:

- `missing-validation` changes code, runs validation, then changes code again before finishing;
- `corrected` changes code and runs validation after the final observed change;
- `partial-observation` adds a sensitive changed input that TracePack excludes from content
  observation;
- `ignored-input` uses an ignored local config input so validation remains limited when that input
  changes.

The `missing-validation` bundle should contain `TP001`. The corrected bundle should not. The
partial-observation and ignored-input bundles should avoid reporting complete final-state
validation.
