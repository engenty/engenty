#!/usr/bin/env node
/**
 * Render README.md's module table from `engenty.plugins` + each module's
 * `engenty.plugin.json`.
 *
 * The table used to be hand-written, and said what was true when someone last
 * looked: it listed Time Tracking, which the open tree does not ship, and left
 * out nine modules that it does. A reader takes that table for the feature
 * list, so it has to come from the same place the product does.
 *
 * `--root` renders another workspace's README — the open-source snapshot
 * publishes a tree with fewer modules, and pro's table would advertise the
 * closed ones. Same reason `engenty env example` takes one.
 *
 * Usage: node scripts/render-readme-modules.mjs [--check|--write] [--root <dir>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";

const START = "<!-- modules:start -->";
const END = "<!-- modules:end -->";

const args = process.argv.slice(2);
const check = args.includes("--check");
const rootIndex = args.indexOf("--root");
const root = rootIndex === -1 ? process.cwd() : args[rootIndex + 1];

const active = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8"))?.engenty
      ?.plugins ?? {}
  )
);

const modules = [];
const providersByParent = new Map();
for await (const rel of glob("modules/*/engenty.plugin.json", { cwd: root })) {
  const manifest = JSON.parse(readFileSync(join(root, rel), "utf8"));
  if (active.has(manifest.id)) {
    modules.push(manifest);
  }
}
for await (const rel of glob("modules/*/providers/*/engenty.plugin.json", {
  cwd: root,
})) {
  const manifest = JSON.parse(readFileSync(join(root, rel), "utf8"));
  if (!active.has(manifest.id)) {
    continue;
  }
  const parent = rel.split("/")[1];
  providersByParent.set(parent, [
    ...(providersByParent.get(parent) ?? []),
    manifest,
  ]);
}

const byName = (a, b) => a.name.localeCompare(b.name);
const lines = ["| Module | What it does |", "|--------|--------------|"];
for (const manifest of [...modules].sort(byName)) {
  lines.push(`| ${manifest.name} | ${manifest.description} |`);
}

// A provider's name carries its parent as a prefix ("Connections — GitHub");
// under the parent's own heading that prefix is noise.
for (const [parent, providers] of [...providersByParent].sort()) {
  const parentManifest = modules.find((m) => m.id === parent);
  if (!parentManifest) {
    continue;
  }
  const names = [...providers]
    .sort(byName)
    .map((p) => p.name.replace(/^.*—\s*/, ""));
  lines.push("", `**${parentManifest.name}** providers: ${names.join(", ")}.`);
}

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const before = readme.indexOf(START);
const after = readme.indexOf(END);
if (before === -1 || after === -1) {
  console.error(`README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const rendered = `${readme.slice(0, before + START.length)}\n${lines.join("\n")}\n${readme.slice(after)}`;
if (rendered === readme) {
  if (!check) {
    console.log("README module table matches engenty.plugins.");
  }
  process.exit(0);
}
if (check) {
  console.error(
    "README.md's module table drifted from engenty.plugins — run: pnpm readme:modules:write"
  );
  process.exit(1);
}
writeFileSync(readmePath, rendered, "utf8");
console.log(`Wrote ${readmePath}`);
