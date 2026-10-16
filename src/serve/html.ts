const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);

/** Segments are encoded one by one so the slashes stay. */
export const docHref = (rel: string): string =>
  `/doc/${rel.split("/").map(encodeURIComponent).join("/")}`;

const STYLE = `
:root { color-scheme: light dark; --fg: #1f2328; --bg: #fff; --muted: #59636e; --line: #d1d9e0; --soft: #f6f8fa; --link: #0969da; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #e6edf3; --bg: #0d1117; --muted: #9198a1; --line: #3d444d; --soft: #151b23; --link: #4493f8; }
}
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
header { display: flex; gap: 1.25rem; align-items: baseline; padding: .75rem 1rem; border-bottom: 1px solid var(--line); }
header strong { margin-right: .5rem; }
main { padding: 1rem; max-width: 72rem; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
table { border-collapse: collapse; margin: .75rem 0; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: .3rem .6rem; text-align: left; vertical-align: top; }
th { background: var(--soft); }
pre, code { font: 13px/1.45 ui-monospace, monospace; background: var(--soft); border-radius: 4px; }
code { padding: .1rem .3rem; }
pre { padding: .75rem; overflow-x: auto; }
pre code { padding: 0; }
blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid var(--line); color: var(--muted); }
form { display: flex; gap: .5rem; flex-wrap: wrap; }
input { font: inherit; padding: .3rem .5rem; min-width: 20rem; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; }
.muted { color: var(--muted); }
.error { color: #d1242f; }
`;

const NAV = [
  ["/", "Documents"],
  ["/items", "Items"],
  ["/summaries", "Summaries"],
] as const;

export const layout = (store: string, title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(store)}</title>
<style>${STYLE}</style>
</head>
<body>
<header><strong>${escapeHtml(store)}</strong>${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</header>
<main>
${body}
</main>
</body>
</html>
`;

/** Cells are already HTML; callers escape them. */
export const table = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  `<table><thead><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

export type FormField = { name: string; value: string; placeholder: string };

export const filterForm = (action: string, fields: readonly FormField[]): string =>
  `<form method="get" action="${action}">${fields
    .map(
      ({ name, value, placeholder }) =>
        `<input name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`,
    )
    .join("")}<button>Filter</button></form>`;
