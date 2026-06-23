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

4. Show the key contrast:

   - missing-validation report: no successful validation command was observed after the final
     observed code change;
   - corrected report: validation was observed after the final code change;
   - partial-observation report: sensitive changed input was excluded, so TracePack does not
     overclaim complete validation;
   - ignored-input report: ignored runtime input was present or changed, so the receipt remains
     limited instead of reporting complete final-state validation.

5. State the limitation plainly: TracePack reports observed local evidence. It does not prove the
   code is correct or secure, and it does not approve PRs.
