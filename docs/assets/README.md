# Tracepack Synthetic Showcase Assets

This folder contains self-contained HTML reports generated from fake fixture data. They are intended
for README links, local screenshots, and public-alpha review.

- `stale-report.html`: successful validation was observed before the final repository change.
- `validated-report.html`: successful validation was observed for the final captured state.

Regenerate the files from the repository root:

```bash
npm run showcase:generate
```

Capture README screenshots from those real reports:

```bash
npm run showcase:capture
npm run showcase:verify
```

The screenshot capture script regenerates the reports first, then uses a locally installed
Chromium-compatible browser in headless mode with a clean temporary profile. Browser discovery uses
`TRACEPACK_BROWSER_BIN` first, then common macOS Chrome/Chromium/Edge locations, then supported
commands on `PATH`.

The browser captures are direct first-viewport screenshots of the actual static `report.html`
output. They are not mockups, generated images, edited composites, or dashboard-style promotional
artwork. The comparison PNG is a temporary local HTML page that places the two captured report PNGs
side by side with factual captions only.

The sample data uses fixed timestamps, fake run IDs, fake fingerprints, fake paths, and no real
local machine paths. `npm run showcase:verify` checks required files, static HTML hygiene, source
and PNG SHA-256 provenance, PNG dimensions through macOS `sips`, and npm package exclusion for the
README PNGs.

The output is visually deterministic for a fixed browser and viewport, but PNG bytes may differ
across browser products or versions.
