export const reportStyles = `
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --paper: #ffffff;
  --ink: #171717;
  --muted: #5d646b;
  --line: #d9dee5;
  --accent: #0f766e;
  --warn: #9a3412;
  --bad: #991b1b;
  --good: #166534;
  --code: #f2f5f7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}
header {
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;
  padding-bottom: 18px;
}
h1 {
  font-size: 30px;
  letter-spacing: 0;
  line-height: 1.15;
  margin: 0 0 10px;
}
h2 {
  font-size: 17px;
  margin: 30px 0 10px;
}
h3 {
  font-size: 14px;
  margin: 18px 0 8px;
}
p { margin: 8px 0; }
.muted { color: var(--muted); }
.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.panel, table {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.panel {
  overflow-wrap: anywhere;
  padding: 14px;
}
.callout {
  border-color: var(--warn);
  margin-top: 12px;
}
.summary-note {
  margin-top: 12px;
}
.label {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  padding: 2px 8px;
  text-transform: uppercase;
}
.label.good { color: var(--good); }
.label.warn { color: var(--warn); }
.label.bad { color: var(--bad); }
.label.neutral { color: var(--muted); }
table {
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border-bottom: 1px solid var(--line);
  padding: 9px 10px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
}
tr:last-child td { border-bottom: 0; }
code, pre {
  background: var(--code);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}
code {
  overflow-wrap: anywhere;
  padding: 2px 5px;
  word-break: break-word;
}
pre {
  border: 1px solid var(--line);
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
}
ul { padding-left: 18px; }
@media (max-width: 720px) {
  main { padding: 20px 12px 36px; }
  h1 { font-size: 24px; }
  table { display: block; overflow-x: auto; }
}
`;
