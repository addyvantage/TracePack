# Tracepack Regression Demo

Run from the repository root:

```bash
npm run demo:smoke
```

The script creates local fixture repositories under `.work/`:

- `missing-validation` changes code, runs validation, then changes code again before finishing;
- `corrected` changes code and runs validation after the final observed change.

The first bundle should contain `TP001`. The corrected bundle should not.
