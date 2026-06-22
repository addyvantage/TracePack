# Demo Script

1. Build Tracepack:

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
   - corrected report: validation was observed after the final code change.

5. State the limitation plainly: Tracepack reports observed local evidence. It does not prove the
   code is correct or safe.
