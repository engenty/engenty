#!/usr/bin/env node
/**
 * Fail if UI source reintroduces a shell-chrome pattern the design retired
 * (docs/agent/DESIGN.md → "Shell chrome rules").
 *
 * - `border-border/NN`, `divide-border/NN`: there are exactly two line tokens,
 *   `border-border` and `border-border-soft`. Free-hand alpha is how nine greys
 *   ended up on one screen.
 * - `topbarChrome: "contentBlend"`: gone. Blended is the default; `"band"` is
 *   the only opt-in.
 * - A hairline on a shell edge: the app bar has no `border-r`/`border-t`, the
 *   topbar and the secondary-column header have no `border-b`. Layout columns
 *   separate by surface step and the column's ambient shadow, never by a line.
 * - `--hairline` / `--hairline-2`: deleted tokens; use `--border-soft`.
 *
 * Run from repo root: node scripts/check-shell-chrome.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  join(root, "apps", "ui", "src"),
  join(root, "apps", "manage", "src"),
  join(root, "packages"),
  join(root, "modules"),
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) {
      continue;
    }
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(tsx?|css)$/.test(name)) {
      out.push(p);
    }
  }
}

const files = [];
for (const r of roots) {
  walk(r, files);
}

/** Patterns forbidden everywhere under the roots. */
const everywhere = [
  {
    hint: "use border-border or border-border-soft",
    re: /(?<![\w-])(?:divide|border(?:-[trblxyse])?)-border\/\d+(?![\w-])/,
  },
  {
    hint: 'blended is the default; opt into topbarChrome: "band" if a page needs a strip',
    re: /topbarChrome(?::\s*|=)"contentBlend"/,
  },
  {
    hint: "token deleted; use var(--border-soft)",
    re: /--hairline(?:-2)?(?![\w-])/,
  },
];

/**
 * Shell edges that must stay lineless, keyed by file. The class is checked as
 * a whole token so `border-r` does not match `border-ring` or `rounded-r`.
 */
const shellEdges = [
  {
    file: "packages/app-shell/src/components/app-sidebar.tsx",
    // `border-sidebar-border` itself stays legal here: the extended rail's
    // search field is furniture inside the bar, not its edge.
    classes: ["border-r", "border-t"],
    hint: "the app bar separates by surface step, not by a line",
  },
  {
    file: "packages/app-shell/src/components/app-topbar.tsx",
    classes: ["border-b"],
    hint: "the topbar is part of the page; even the band has no line",
  },
  {
    file: "packages/app-shell/src/components/app-layout/module-secondary-nav-column-shell.tsx",
    classes: ["border-b"],
    hint: "the column header is furniture on the column's surface",
  },
  {
    file: "packages/app-shell/src/components/app-layout/module-secondary-nav-panel.tsx",
    classes: ["border-t"],
    hint: "the column footer is one --shell-footer row, no rule above it",
  },
];

const bad = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    for (const { re, hint } of everywhere) {
      if (re.test(line)) {
        bad.push(
          `  ${relative(root, f)}:${i + 1} — ${hint}\n    ${line.trim()}`
        );
      }
    }
  }
}

for (const { file, classes, hint } of shellEdges) {
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    bad.push(`  ${file} — shell file missing; update check-shell-chrome.mjs`);
    continue;
  }
  const lines = text.split("\n");
  for (const cls of classes) {
    // Only class strings count — a comment naming the class it removed is fine.
    const re = new RegExp(`["'\`\\s]${cls.replace(/-/g, "\\-")}(?=["'\`\\s])`);
    for (const [i, line] of lines.entries()) {
      if (line.trimStart().startsWith("//")) {
        continue;
      }
      if (re.test(line)) {
        bad.push(`  ${file}:${i + 1} — ${hint} (${cls})\n    ${line.trim()}`);
      }
    }
  }
}

if (bad.length > 0) {
  console.error(
    `check-shell-chrome: ${bad.length} retired shell-chrome pattern(s):\n${bad.join("\n")}`
  );
  process.exit(1);
}
console.log(`check-shell-chrome: ok (${files.length} files)`);
