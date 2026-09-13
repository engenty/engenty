#!/usr/bin/env node
/**
 * Reconcile the docs site with the tree it is published in.
 *
 * `docs/content/**\/meta.json` lists its pages by name and the index pages link
 * to them by route, so removing a page that documents a closed module leaves a
 * nav entry and a bullet pointing at nothing. Run against a materialized
 * snapshot (see publish-open-snapshot.sh), this drops both, and refuses when a
 * dangling link survives that no mechanical rule should rewrite — prose. Fix
 * those in the source tree, where both the pro and the open reader see them.
 *
 * Usage: node scripts/strip-closed-doc-nav.mjs <tree-dir>
 * Prints the repo-relative path of every file it rewrote, one per line.
 */
import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.join("docs", "content");
/** Site routes are rooted at the section directories under docs/content. */
const ROUTE_PREFIXES = ["/user/", "/dev/", "/setup/", "/roadmap/"];
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, visit);
    } else {
      visit(full);
    }
  }
}

/**
 * The files a site route can be served by, or null when the link is not one:
 * a section route like `/user/modules` is the directory's index page.
 */
function resolveRoute(root, href) {
  const [route] = href.split("#");
  if (!ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    return null;
  }
  const base = path.join(root, CONTENT_DIR, route.replace(/\/$/, ""));
  return [`${base}.md`, path.join(base, "index.md")];
}

function isDangling(root, href) {
  const targets = resolveRoute(root, href);
  if (targets === null) {
    return false;
  }
  return !targets.some((target) => fs.existsSync(target));
}

function hrefsIn(line) {
  return [...line.matchAll(MARKDOWN_LINK_RE)].map((match) => match[1]);
}

function stripNavEntries(root, file, rewritten) {
  const meta = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!Array.isArray(meta.pages)) {
    return;
  }
  const dir = path.dirname(file);
  const kept = meta.pages.filter(
    (page) =>
      typeof page !== "string" ||
      page.startsWith("...") ||
      fs.existsSync(path.join(dir, `${page}.md`)) ||
      fs.existsSync(path.join(dir, page, "index.md")) ||
      fs.existsSync(path.join(dir, page))
  );
  if (kept.length === meta.pages.length) {
    return;
  }
  meta.pages = kept;
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  rewritten.add(path.relative(root, file));
}

/**
 * A list item that exists only to link a page the tree does not have is the
 * index-page half of the same removal. Anything else — a link inside a
 * sentence — is left for the refusal below to report.
 */
function stripDeadListItems(root, file, rewritten) {
  const original = fs.readFileSync(file, "utf-8");
  const kept = original.split("\n").filter((line) => {
    if (!/^\s*[-*]\s/.test(line)) {
      return true;
    }
    const hrefs = hrefsIn(line);
    return hrefs.length === 0 || !hrefs.every((href) => isDangling(root, href));
  });
  const next = kept.join("\n");
  if (next === original) {
    return;
  }
  fs.writeFileSync(file, next, "utf-8");
  rewritten.add(path.relative(root, file));
}

function reportSurvivors(root) {
  const survivors = [];
  walk(path.join(root, CONTENT_DIR), (file) => {
    if (!file.endsWith(".md")) {
      return;
    }
    const lines = fs.readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, index) => {
      for (const href of hrefsIn(line)) {
        if (isDangling(root, href)) {
          survivors.push(
            `${path.relative(root, file)}:${index + 1} -> ${href}`
          );
        }
      }
    });
  });
  return survivors;
}

function main() {
  const root = path.resolve(process.argv[2] ?? ".");
  const contentDir = path.join(root, CONTENT_DIR);
  if (!fs.existsSync(contentDir)) {
    return;
  }

  const rewritten = new Set();
  walk(contentDir, (file) => {
    if (path.basename(file) === "meta.json") {
      stripNavEntries(root, file, rewritten);
    }
  });
  walk(contentDir, (file) => {
    if (file.endsWith(".md")) {
      stripDeadListItems(root, file, rewritten);
    }
  });

  const survivors = reportSurvivors(root);
  if (survivors.length > 0) {
    process.stderr.write(
      `docs links point at pages this tree does not have:\n${survivors.join("\n")}\n` +
        "Rewrite them in the source tree — a link inside prose is not something to strip mechanically.\n"
    );
    process.exit(1);
  }

  for (const file of [...rewritten].sort()) {
    process.stdout.write(`${file}\n`);
  }
}

main();
