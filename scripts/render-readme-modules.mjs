#!/usr/bin/env node
/**
 * Render README.md's module tables from `engenty.plugins` + each module's
 * `engenty.plugin.json`.
 *
 * The table used to be hand-written, and said what was true when someone last
 * looked: it listed Time Tracking, which the open tree does not ship, and left
 * out nine modules that it does. A reader takes that table for the feature
 * list, so it has to come from the same place the product does.
 *
 * What is rendered, and from which manifest field:
 * - two groups, **Core** and **Commercial**, by `category`;
 * - inside a group, a module that exists for other modules — `placement:
 *   "settings"` and it `requires` a listed module, or a listed space module
 *   `requires` it — is a sub-module row under the same table, naming what it
 *   extends or serves;
 * - `emoji` sits before the name; `stability: "experimental"` leaves the module out.
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
  if (active.has(manifest.id) && manifest.stability !== "experimental") {
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

const byId = new Map(modules.map((m) => [m.id, m]));
const byName = (a, b) => a.name.localeCompare(b.name);
// Hard dependencies only: `optional` is a hint the module can use another
// when present (Team can link people to Projects), not what it is for.
const dependencyIds = (manifest) =>
  (manifest.requires ?? [])
    .filter((cap) => cap.startsWith("module.") && cap.split(".").length === 2)
    .map((cap) => cap.slice("module.".length))
    .filter((id) => byId.has(id));

/** What a settings module is for: the modules it extends, or those that need it. */
function subModuleRelation(manifest) {
  if (manifest.placement !== "settings") {
    return null;
  }
  const extendsIds = dependencyIds(manifest);
  if (extendsIds.length > 0) {
    return { ids: extendsIds, verb: "extends" };
  }
  const usedBy = modules
    .filter(
      (other) =>
        other.placement !== "settings" &&
        dependencyIds(other).includes(manifest.id)
    )
    .map((other) => other.id);
  return usedBy.length > 0 ? { ids: usedBy, verb: "used by" } : null;
}

const withEmoji = (manifest, label) =>
  manifest.emoji ? `${manifest.emoji} ${label}` : label;

const GROUPS = [
  {
    title: "Core",
    matches: (manifest) => manifest.category !== "commercial",
  },
  {
    title: "Commercial",
    matches: (manifest) => manifest.category === "commercial",
  },
];

const lines = [];
for (const group of GROUPS) {
  const members = modules.filter(group.matches).sort(byName);
  if (members.length === 0) {
    continue;
  }
  const main = members.filter((m) => !subModuleRelation(m));
  const subs = members.filter((m) => subModuleRelation(m));
  lines.push(
    "",
    `### ${group.title}`,
    "",
    "| Module | What it does |",
    "|--------|--------------|"
  );
  for (const manifest of main) {
    lines.push(
      `| ${withEmoji(manifest, `**${manifest.name}**`)} | ${manifest.description} |`
    );
  }
  for (const manifest of subs) {
    const relation = subModuleRelation(manifest);
    const names = relation.ids.map((id) => byId.get(id).name).join(", ");
    lines.push(
      `| ↳ ${withEmoji(manifest, manifest.name)} | ${manifest.description} — ${relation.verb} ${names} |`
    );
  }
}
// A provider's name carries its parent as a prefix ("Connections — GitHub");
// under the parent's own heading that prefix is noise.
for (const [parent, providers] of [...providersByParent].sort()) {
  const parentManifest = byId.get(parent);
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
const rendered = `${readme.slice(0, before + START.length)}${lines.join("\n")}\n${readme.slice(after)}`;
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
