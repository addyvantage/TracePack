# Tracepack Synthetic Showcase Assets

This folder contains self-contained HTML reports generated from fake fixture data. They are intended
for README links, local screenshots, and public-alpha review.

- `stale-report.html`: successful validation was observed before the final repository change.
- `validated-report.html`: successful validation was observed for the final captured state.

Regenerate the files from the repository root:

```bash
npm run showcase:generate
```

The generator uses the built local renderer in `dist/`, so it runs `npm run build` first through the
npm script. The sample data uses fixed timestamps, fake run IDs, fake fingerprints, fake paths, and
no real local machine paths.

No PNG screenshots are committed by default. To capture screenshots reproducibly, regenerate these
files and open them from disk in a browser or browser automation tool at a fixed viewport such as
1280x720.
