# Demo Script

1. Build TracePack:

   ```bash
   npm run build
   ```

2. Run the deterministic demo:

   ```bash
   npm run demo:smoke
   ```

3. Open the generated reports printed by the script.

4. Show the key contrast printed by the demo:

   - Stale: successful validation was observed before the final repository change.
   - Corrected: successful validation was observed for the final captured state.
   - partial-observation report: sensitive changed input was excluded, so TracePack does not
     overclaim complete validation;
   - ignored-input report: ignored runtime input was present or changed, so the receipt remains
     limited instead of reporting complete final-state validation.

5. Open the two public showcase reports when you need a stable side-by-side:

   ```bash
   npm run showcase:generate
   ```

   - `docs/assets/stale-report.html`
   - `docs/assets/validated-report.html`

6. State the limitation plainly: Tracepack records observed local evidence. It does not prove code
   correctness, test sufficiency, security, or merge approval.
