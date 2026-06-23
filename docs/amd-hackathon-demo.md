# AMD Hackathon Demo

TracePack does not require AMD, Fireworks, OpenAI, Anthropic, or any external model API. The demo is
deterministic and local.

Run:

```bash
npm run demo:smoke
```

The demo creates four local fixture repositories:

- `missing-validation`: validation succeeds, then a later code change is made before `finish`;
- `corrected`: validation is run after the final code change;
- `partial-observation`: a sensitive changed path is excluded, so the receipt confidence is partial;
- `ignored-input`: validation depends on ignored runtime input, so TracePack reports limited
  evidence instead of complete final-state validation.

The `missing-validation` report should include the missing post-change validation warning. The
`corrected` report should not include that warning. The partial and ignored-input reports should
remain honest about observation limits.

Optional AI summaries may be explored later only if labeled: "Optional AI-generated summary. Not
evidence."
