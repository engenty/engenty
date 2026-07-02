#!/usr/bin/env node
/**
 * Fail if packages/ui-core/src still uses @/ imports (reserved for apps/ui).
 * Run from repo root: node scripts/check-ui-core-imports.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "packages", "ui-core", "src");

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, out);
    } else if (/\.(tsx?|mdx)$/.test(name)) {
      out.push(p);
    }
  }
}

const files = [];
walk(srcRoot, files);
const bad = [];
const atSlash = /(?:from|import)\s+["']@\//;

for (const f of files) {
  const s = readFileSync(f, "utf8");
  if (atSlash.test(s)) {
    bad.push(relative(root, f));
  }
}

if (bad.length > 0) {
  console.error(
    "Disallowed @/ imports under packages/ui-core/src (conflicts with app alias). Use relative imports or @engenty/ui-core/... per AGENTS.md.\n"
  );
  for (const f of bad) {
    console.error(`  ${f}`);
  }
  process.exit(1);
}

console.log("ui-core import check OK");
