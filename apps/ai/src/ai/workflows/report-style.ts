// The house style an HTML report is stored with: the app's design tokens
// (ember-primitives.css) and the report layer on them (report.css), both from
// @engenty/design-tokens — one source with the app, so a report does not drift
// from it. The store step adds them to the report's <head>; the specialist
// only writes markup with the classes REPORT_STYLE_GUIDE names.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MARKER = "data-engenty-house-style";

let cached: string | null = null;

function houseStyleSheet(): string {
  cached ??= ["ember-primitives.css", "report.css"]
    .map((file) =>
      readFileSync(require.resolve(`@engenty/design-tokens/${file}`), "utf8")
    )
    .join("\n");
  return cached;
}

/** What the brief tells the specialist about the house style. */
export const REPORT_STYLE_GUIDE =
  "The platform adds the house stylesheet: do not write colors, fonts or shadows yourself. Structure with <main>, a <header> (.eyebrow, <h1>, a .meta line), <section>s with <h2>. Components: .card; .grid (wraps cards or stats to the width); .stat with .label, .value (short: a number, price or date — never a sentence), .note for a key figure; .pill with .ok, .warn, .bad or .info for a status; .callout (optionally .ok, .warn, .bad, .info) for what needs attention; tables inside a div.table. Use <strong> for the key term in a sentence. Your own <style> may only add layout.";

/**
 * The document with the house stylesheet first in its <head>, replacing one a
 * previous version carried. A fragment without <head> gets one.
 */
export function withHouseStyle(html: string): string {
  const block = `<style ${MARKER}>\n${houseStyleSheet()}\n</style>`;
  const cleaned = html.replace(
    new RegExp(`<style ${MARKER}>[\\s\\S]*?</style>\\s*`, "g"),
    ""
  );
  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (head) => `${head}\n${block}`);
  }
  if (/<html[^>]*>/i.test(cleaned)) {
    return cleaned.replace(
      /<html[^>]*>/i,
      (open) => `${open}\n<head>\n${block}\n</head>`
    );
  }
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${block}\n</head>\n<body>\n${cleaned}\n</body>\n</html>`;
}
