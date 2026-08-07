#!/usr/bin/env node
/**
 * Read a package.json on stdin, write it back on stdout with the pro-only
 * plugin slugs removed from `engenty.plugins`.
 *
 * The on-disk sibling (strip-closed-plugins-manifest.mjs) rewrites the working
 * tree, which suits publish-open.sh's cherry-pick flow. publish-open-snapshot.sh
 * builds its tree in a throwaway index and never touches the working tree, so it
 * needs the transform as a pipe instead.
 *
 * Formatting is 2-space + trailing newline, which round-trips the repo's
 * package.json byte-for-byte — so the public repo sees only the plugin removal,
 * not a reformat of the whole file.
 */
import { CLOSED_PLUGIN_SLUGS } from "./lib/closed-plugin-slugs.mjs";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const pkg = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const plugins = pkg?.engenty?.plugins;
if (plugins && typeof plugins === "object" && !Array.isArray(plugins)) {
  for (const slug of CLOSED_PLUGIN_SLUGS) {
    delete plugins[slug];
  }
}

process.stdout.write(`${JSON.stringify(pkg, null, 2)}\n`);
