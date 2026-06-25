export const reportStyles = `
:root {
  color-scheme: light;
  --tp-bg: #f4f1eb;
  --tp-paper: #fffdf8;
  --tp-panel: #fffaf0;
  --tp-ink: #1f2933;
  --tp-muted: #5f6975;
  --tp-subtle: #7a8490;
  --tp-line: #d8d0c4;
  --tp-line-strong: #b8afa3;
  --tp-code-bg: #f0eee8;
  --tp-good: #1f7a4d;
  --tp-good-bg: #eef8f1;
  --tp-warn: #9a5b12;
  --tp-warn-bg: #fff6df;
  --tp-bad: #a13434;
  --tp-bad-bg: #fff1f0;
  --tp-neutral: #657080;
  --tp-neutral-bg: #f1f3f5;
  --tp-focus: #1b67d8;
}

* { box-sizing: border-box; }

html { background: var(--tp-bg); }

body {
  margin: 0;
  background: var(--tp-bg);
  color: var(--tp-ink);
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-rendering: optimizeLegibility;
}

main {
  margin: 0 auto;
  max-width: 960px;
  padding: 24px 18px 42px;
}

a {
  color: #1e5f9f;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

a:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--tp-focus);
  outline-offset: 3px;
}

p { margin: 8px 0; }

h1,
h2,
h3 {
  color: var(--tp-ink);
  letter-spacing: 0;
}

h1 {
  font-size: 30px;
  line-height: 1.12;
  margin: 0 0 10px;
}

h2 {
  font-size: 17px;
  line-height: 1.3;
  margin: 28px 0 10px;
}

h3 {
  font-size: 14px;
  line-height: 1.35;
  margin: 16px 0 8px;
}

code,
pre,
.tp-mono {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}

code {
  background: var(--tp-code-bg);
  border-radius: 5px;
  overflow-wrap: anywhere;
  padding: 2px 5px;
  word-break: break-word;
}

pre {
  background: var(--tp-code-bg);
  border: 1px solid var(--tp-line);
  border-radius: 6px;
  margin: 10px 0 0;
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
}

ul { padding-left: 18px; }

table {
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-collapse: collapse;
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
}

caption.tp-sr-only {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  width: 1px;
}

th,
td {
  border-bottom: 1px solid var(--tp-line);
  padding: 9px 10px;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--tp-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

tbody tr:last-child th,
tbody tr:last-child td { border-bottom: 0; }

tbody th {
  color: var(--tp-ink);
  font-size: 13px;
  text-transform: none;
  width: 210px;
}

details {
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-radius: 8px;
  margin: 10px 0;
  padding: 0;
}

summary {
  cursor: pointer;
  font-weight: 700;
  list-style-position: inside;
  padding: 12px 14px;
}

details > :not(summary) {
  margin-left: 14px;
  margin-right: 14px;
}

details > :last-child { margin-bottom: 14px; }

.tp-header {
  align-items: center;
  border-bottom: 1px solid var(--tp-line);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 12px;
}

.tp-wordmark {
  color: var(--tp-ink);
  font-size: 15px;
  font-weight: 750;
}

.tp-header-meta {
  align-items: center;
  color: var(--tp-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px;
  justify-content: flex-end;
}

.tp-chip {
  align-items: center;
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-radius: 999px;
  color: var(--tp-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  line-height: 1.2;
  padding: 4px 8px;
  text-decoration: none;
  white-space: nowrap;
}

.tp-chip strong { color: var(--tp-ink); }

.tp-hero {
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-left: 6px solid var(--tp-rail);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  grid-template-columns: 1fr auto;
  margin-bottom: 16px;
  padding: 18px 18px 16px;
}

.tp-hero[data-state="observed"] {
  --tp-rail: var(--tp-good);
  background: var(--tp-good-bg);
}

.tp-hero[data-state="incomplete"] {
  --tp-rail: var(--tp-warn);
  background: var(--tp-warn-bg);
}

.tp-hero[data-state="failed"] {
  --tp-rail: var(--tp-bad);
  background: var(--tp-bad-bg);
}

.tp-hero[data-state="unavailable"] {
  --tp-rail: var(--tp-neutral);
  background: var(--tp-neutral-bg);
}

.tp-hero p {
  color: var(--tp-muted);
  font-size: 15px;
  margin: 0;
  max-width: 68ch;
}

.tp-hero-glyph {
  align-self: start;
  border: 1px solid var(--tp-line-strong);
  border-radius: 999px;
  color: var(--tp-rail);
  display: grid;
  font-size: 24px;
  font-weight: 800;
  height: 44px;
  place-items: center;
  width: 44px;
}

.tp-fingerprint {
  margin-top: 12px;
}

.tp-section-note,
.tp-muted {
  color: var(--tp-muted);
}

.tp-panel {
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-radius: 8px;
  overflow-wrap: anywhere;
  padding: 13px 14px;
}

.tp-strip {
  align-items: flex-start;
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-left: 5px solid var(--tp-rail);
  border-radius: 8px;
  display: flex;
  gap: 10px;
  margin: 14px 0 18px;
  padding: 12px 14px;
}

.tp-strip[data-state="needs-review"] { --tp-rail: var(--tp-warn); }
.tp-strip[data-state="neutral"] { --tp-rail: var(--tp-neutral); }

.tp-strip p { margin: 0; }

.tp-strip .tp-strip-icon {
  color: var(--tp-rail);
  font-weight: 800;
  min-width: 18px;
}

.tp-label {
  align-items: center;
  border: 1px solid currentColor;
  border-radius: 999px;
  display: inline-flex;
  font-size: 12px;
  font-weight: 800;
  gap: 5px;
  line-height: 1.2;
  padding: 2px 7px;
  white-space: nowrap;
}

.tp-label[data-state="observed"] { color: var(--tp-good); }
.tp-label[data-state="not-observed"],
.tp-label[data-state="needs-review"] { color: var(--tp-warn); }
.tp-label[data-state="failed"] { color: var(--tp-bad); }
.tp-label[data-state="excluded"],
.tp-label[data-state="neutral"] { color: var(--tp-neutral); }

.tp-timeline {
  background: var(--tp-paper);
  border: 1px solid var(--tp-line);
  border-radius: 8px;
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.tp-timeline li {
  min-height: 132px;
  padding: 16px;
  position: relative;
}

.tp-timeline li + li {
  border-left: 1px solid var(--tp-line);
}

.tp-node {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.tp-node-marker {
  background: var(--tp-paper);
  border: 2px solid var(--tp-node-color, var(--tp-neutral));
  border-radius: 999px;
  display: inline-block;
  height: 13px;
  width: 13px;
}

.tp-timeline-title {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

.tp-timeline .tp-small {
  color: var(--tp-muted);
  font-size: 12px;
  margin: 5px 0 0;
}

.tp-timeline-connector {
  border-top: 2px solid var(--tp-node-color, var(--tp-neutral));
  color: var(--tp-muted);
  font-size: 12px;
  font-weight: 800;
  margin: 12px 0 0;
  padding-top: 6px;
  text-transform: uppercase;
}

.tp-timeline-connector[data-connection="not-observed"] {
  border-top-style: dashed;
}

.tp-timeline-connector[data-connection="failed"] {
  border-top-color: var(--tp-bad);
}

.tp-timeline li[data-state="observed"] { --tp-node-color: var(--tp-good); }
.tp-timeline li[data-state="not-observed"] { --tp-node-color: var(--tp-warn); }
.tp-timeline li[data-state="failed"] { --tp-node-color: var(--tp-bad); }
.tp-timeline li[data-state="neutral"] { --tp-node-color: var(--tp-neutral); }

.tp-matrix td:last-child {
  color: var(--tp-muted);
}

.tp-two-column {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tp-command-list {
  display: grid;
  gap: 10px;
}

.tp-command-output {
  margin-top: 10px;
}

.tp-footer {
  border-top: 1px solid var(--tp-line);
  color: var(--tp-muted);
  margin-top: 30px;
  padding-top: 14px;
}

.tp-sr-only {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  width: 1px;
}

@media (max-width: 760px) {
  main { padding: 18px 12px 34px; }
  h1 { font-size: 24px; }

  .tp-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .tp-header-meta {
    justify-content: flex-start;
  }

  .tp-hero {
    grid-template-columns: 1fr;
  }

  .tp-hero-glyph {
    grid-row: 1;
  }

  .tp-timeline {
    display: block;
  }

  .tp-timeline li {
    min-height: auto;
    padding-left: 20px;
  }

  .tp-timeline li + li {
    border-left: 0;
    border-top: 1px solid var(--tp-line);
  }

  .tp-timeline-connector {
    border-top: 0;
    border-left: 2px solid var(--tp-node-color, var(--tp-neutral));
    margin-left: 5px;
    padding-left: 10px;
    padding-top: 0;
  }

  .tp-timeline-connector[data-connection="not-observed"] {
    border-left-style: dashed;
  }

  .tp-two-column {
    grid-template-columns: 1fr;
  }

  table {
    display: block;
    overflow-x: auto;
  }
}

@media print {
  :root {
    --tp-bg: #ffffff;
    --tp-paper: #ffffff;
    --tp-panel: #ffffff;
    --tp-code-bg: #f5f5f5;
  }

  body,
  main {
    background: #ffffff;
  }

  main {
    max-width: none;
    padding: 0;
  }

  a { color: currentColor; }

  .tp-hero,
  .tp-timeline,
  table,
  details,
  .tp-panel,
  .tp-strip {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .tp-hero {
    background: #ffffff !important;
  }

  .tp-strip {
    background: #ffffff !important;
  }

  details:not([open]) > :not(summary) {
    display: block;
  }

  summary {
    cursor: default;
  }

  pre {
    max-height: none;
  }
}
`;
