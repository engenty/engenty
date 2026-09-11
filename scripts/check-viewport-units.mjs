#!/usr/bin/env node
/**
 * Fail if UI source reintroduces `100vh` / `h-screen` / `min-h-screen`.
 *
 * On iOS `100vh` is the LARGE viewport: a full-height layout sits under the
 * URL bar, and with the keyboard open the composer is pushed off-screen. Use
 * the dynamic viewport instead — `h-dvh`, `min-h-dvh`, `calc(100dvh - …)` —
 * which is identical on desktop and correct on mobile.
 *
 * Run from repo root: node scripts/check-viewport-units.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  join(root, "apps", "ui", "src"),
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

// `auth-screen-layout` (a real module path) contains the substring `h-screen`,
// so both class patterns need non-word boundaries on each side.
const patterns = [
  { hint: "use min-h-dvh", re: /(?<![\w-])min-h-screen(?![\w-])/ },
  { hint: "use h-dvh", re: /(?<![\w-])h-screen(?![\w-])/ },
  { hint: "use 100dvh", re: /(?<![\w-])100vh(?![\w])/ },
];

const bad = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    for (const { re, hint } of patterns) {
      if (re.test(line)) {
        bad.push(
          `  ${relative(root, f)}:${i + 1} — ${hint}\n    ${line.trim()}`
        );
      }
    }
  }
}

if (bad.length > 0) {
  console.error(
    "Static viewport units found. iOS treats 100vh as the large viewport, so these break the mobile layout when the URL bar or keyboard is visible.\n"
  );
  for (const b of bad) {
    console.error(b);
  }
  process.exit(1);
}

console.log("viewport unit check OK");
