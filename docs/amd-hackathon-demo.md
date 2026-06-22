# AMD Hackathon Demo

TracePack does not require AMD, Fireworks, OpenAI, Anthropic, or any external model API. The demo is
deterministic and local.

Run:

```bash
npm run demo:smoke
```

The demo creates two local fixture repositories:

- `missing-validation`: validation succeeds, then a later code change is made before `finish`;
- `corrected`: validation is run after the final code change.

The first report should include the missing post-change validation warning. The corrected report
should not include that warning.

Optional AI summaries may be explored later only if labeled: "Optional AI-generated summary. Not
evidence."
