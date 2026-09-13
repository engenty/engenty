#!/usr/bin/env node
/**
 * Drop entries from scripts/space-storage-scope-allowlist.json whose file is
 * not in the given tree, rewriting the file in place.
 *
 * The allowlist classifies each tenant-rooted storage key by path, and its
 * guard asserts the list stays honest — every entry still matches a real site.
 * The open-source snapshot strips whole modules, so an entry under one of them
 * describes a file the published tree does not have: unfixable there, and
 * failing only on the mirror. Filtering here keeps pro's own list strict, which
 * is where a genuinely stale entry has to be caught.
 *
 * Usage: node scripts/strip-absent-allowlist-entries.mjs <tree-root>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWLIST_PATH = "scripts/space-storage-scope-allowlist.json";

const root = process.argv[2];
if (!root) {
  console.error("usage: strip-absent-allowlist-entries.mjs <tree-root>");
  process.exit(1);
}

const file = join(root, ALLOWLIST_PATH);
if (!existsSync(file)) {
  process.exit(0);
}

const allowlist = JSON.parse(readFileSync(file, "utf8"));
const kept = allowlist.allow.filter((entry) =>
  existsSync(join(root, entry.file))
);
if (kept.length === allowlist.allow.length) {
  process.exit(0);
}

for (const entry of allowlist.allow) {
  if (!kept.includes(entry)) {
    console.log(`dropped allowlist entry (not in this tree): ${entry.file}`);
  }
}
allowlist.allow = kept;
// The file escapes non-ASCII, and re-serialising would spell those characters
// out — a whole-file reformat riding along with a one-entry removal. Escape
// them back so the published diff is the dropped entry and nothing else.
const json = JSON.stringify(allowlist, null, 2).replace(
  /[\u0080-\uffff]/g,
  (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
);
writeFileSync(file, `${json}\n`, "utf8");
