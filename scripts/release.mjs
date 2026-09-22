#!/usr/bin/env node
/**
 * release.mjs — interactive local release cutter for Engenty.
 *
 * Reads Conventional Commits since the last tag via git-cliff, shows the
 * compact changelog, lets you edit it, asks patch/minor/major, then writes
 * CHANGELOG.md + changelog.json and (unless --changelog) bumps
 * package.json, commits, and tags vX.Y.Z. It does NOT push, build, or deploy
 * — those stay separate, on purpose.
 *
 *   pnpm release                  # full: changelog + version bump + commit + tag
 *   pnpm release --changelog # just draft/write the changelog, nothing else
 *   pnpm release --help
 *
 * git-cliff owns parsing + the compact format (see cliff.toml). This script is
 * only the interactive layer around it.
 */

// biome-ignore-all lint/performance/useTopLevelRegex: one-shot CLI
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: interactive flow reads clearest inline

import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const PKG = path.join(ROOT, "package.json");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const CHANGELOG_JSON = path.join(ROOT, "changelog.json");
const CHANGELOG_ONLY = process.argv.includes("--changelog");

// ── tiny TUI ─────────────────────────────────────────────────────────────────
const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (n) => (s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const c = {
  b: col(1),
  dim: col(2),
  red: col(31),
  green: col(32),
  yellow: col(33),
  cyan: col(36),
  gray: col(90),
};
const out = (s = "") => process.stdout.write(`${s}\n`);
const die = (m) => {
  out(`\n${c.red("✖")} ${m}`);
  process.exit(1);
};

async function select(label, options) {
  emitKeypressEvents(process.stdin);
  let i = 0;
  const draw = (first) => {
    if (!first) {
      process.stdout.write(`\x1b[${options.length}A`);
    }
    for (let j = 0; j < options.length; j++) {
      process.stdout.write("\r\x1b[K");
      const o = options[j];
      out(
        j === i
          ? `  ${c.cyan("❯")} ${c.b(o.label)}${o.hint ? c.dim(`  ${o.hint}`) : ""}`
          : `    ${c.gray(o.label)}${o.hint ? c.dim(`  ${o.hint}`) : ""}`
      );
    }
  };
  out(`\n${c.b(label)}`);
  draw(true);
  return await new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const onKey = (_s, key) => {
      if (!key) {
        return;
      }
      if (key.ctrl && key.name === "c") {
        process.exit(130);
      } else if (key.name === "up" || key.name === "k") {
        i = (i - 1 + options.length) % options.length;
        draw();
      } else if (key.name === "down" || key.name === "j") {
        i = (i + 1) % options.length;
        draw();
      } else if (key.name === "return") {
        process.stdin.removeListener("keypress", onKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        resolve(options[i].value);
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

// ── git-cliff + git plumbing ─────────────────────────────────────────────────
let CLIFF = null;
function resolveCliff() {
  for (const probe of [["git-cliff"], ["pnpm", "exec", "git-cliff"]]) {
    try {
      execFileSync(probe[0], [...probe.slice(1), "--version"], {
        stdio: "ignore",
      });
      return probe;
    } catch {
      // try next
    }
  }
  out(c.dim("  git-cliff not installed locally — using `pnpm dlx git-cliff`"));
  return ["pnpm", "dlx", "git-cliff"];
}
function cliff(args) {
  CLIFF = CLIFF ?? resolveCliff();
  return execFileSync(
    CLIFF[0],
    [...CLIFF.slice(1), "--config", "cliff.toml", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      // `--context` emits the full structured JSON of every commit since the
      // last tag, which blows past execFileSync's 1 MB default and throws
      // ENOBUFS on repos with long histories. Give it plenty of room.
      maxBuffer: 256 * 1024 * 1024,
    }
  );
}
const git = (args) =>
  execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();

function bump(version, level) {
  const [a, b, d] = version.replace(/^v/, "").split(".").map(Number);
  if (level === "major") {
    return `${a + 1}.0.0`;
  }
  if (level === "minor") {
    return `${a}.${b + 1}.0`;
  }
  return `${a}.${b}.${d + 1}`;
}

function openEditor(text) {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const file = path.join(tmpdir(), `engenty-release-${Date.now()}.md`);
  writeFileSync(file, text, "utf8");
  const r = spawnSync(editor, [file], { stdio: "inherit" });
  if (r.status !== 0) {
    out(c.yellow("  editor exited non-zero — keeping the draft as-is"));
  }
  return readFileSync(file, "utf8").trimEnd();
}

function prependToChangelog(block) {
  const md = existsSync(CHANGELOG)
    ? readFileSync(CHANGELOG, "utf8")
    : "# Changelog\n";
  const marker = md.search(/^## \[/m);
  const [head, rest] =
    marker === -1
      ? [md.trimEnd(), ""]
      : [md.slice(0, marker).trimEnd(), md.slice(marker)];
  writeFileSync(
    CHANGELOG,
    `${head}\n\n${block.trim()}\n\n${rest}`.replace(/\n{3,}/g, "\n\n"),
    "utf8"
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
function help() {
  out(`
${c.b("pnpm release")} — cut a release from Conventional Commits (via git-cliff)

  pnpm release                   full: changelog + bump package.json + commit + tag
  pnpm release --changelog  only draft/write CHANGELOG.md, no bump/commit/tag
  pnpm release --help

Never pushes, builds, or deploys — do those separately.
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    help();
    return;
  }
  if (!existsSync(path.join(ROOT, "cliff.toml"))) {
    die("cliff.toml not found at repo root.");
  }

  const current = JSON.parse(readFileSync(PKG, "utf8")).version || "0.0.0";
  let lastTag = "";
  try {
    lastTag = git("describe --tags --abbrev=0");
  } catch {
    lastTag = "";
  }
  out(
    `${c.dim("current")} ${c.b(`v${current}`)}   ${c.dim("last tag")} ${c.b(lastTag || "(none)")}${CHANGELOG_ONLY ? c.yellow("   [changelog]") : ""}`
  );

  // Unreleased context — bail if nothing to release.
  const ctx = JSON.parse(cliff(["--unreleased", "--context"]));
  const commits = ctx.flatMap((r) => r.commits || []);
  if (commits.length === 0) {
    die(
      "No unreleased Conventional Commits since the last tag. Nothing to release."
    );
  }
  out(`\n${c.b("Unreleased changes:")}`);
  out(
    cliff(["--unreleased", "--tag", "vNEXT", "--strip", "all"])
      .replace(/^## .*$/m, "")
      .trimEnd()
  );

  // Suggested bump from git-cliff, then let the user choose.
  let suggested = "patch";
  try {
    const next = cliff(["--bumped-version"]).trim().replace(/^v/, "");
    const [a, b] = current.split(".").map(Number);
    const [na, nb] = next.split(".").map(Number);
    suggested = na > a ? "major" : nb > b ? "minor" : "patch";
  } catch {
    // keep default
  }
  const levels = ["patch", "minor", "major"];
  // Non-interactive path (automation/CI): RELEASE_BUMP=patch|minor|major
  // skips the picker and accepts the rendered entry as-is.
  const envBump = process.env.RELEASE_BUMP;
  if (envBump && !levels.includes(envBump)) {
    die(`RELEASE_BUMP must be one of: ${levels.join(", ")}`);
  }
  const ordered = [suggested, ...levels.filter((l) => l !== suggested)];
  const level =
    envBump ??
    (await select(
      `Version bump  ${c.dim(`(suggested: ${suggested})`)}`,
      ordered.map((l) => ({
        label: `${l.padEnd(6)} → v${bump(current, l)}`,
        value: l,
        hint: l === suggested ? "suggested" : "",
      }))
    ));
  const version = bump(current, level);
  const tag = `v${version}`;

  // Render the release block, offer to edit it.
  let block = cliff(["--unreleased", "--tag", tag, "--strip", "all"]).trim();
  const choice = envBump
    ? "accept"
    : await select(`Release ${c.b(tag)} — the entry below`, [
        { label: "Accept as-is", value: "accept" },
        {
          label: `Edit in $EDITOR (${process.env.EDITOR || "vi"})`,
          value: "edit",
        },
        { label: "Cancel", value: "cancel" },
      ]);
  if (choice === "cancel") {
    die("Cancelled — nothing written.");
  }
  if (choice === "edit") {
    block = openEditor(block);
  }

  // Write changelog + structured JSON + slim UI copy for About → Changelog.
  // Stamp the new tag onto cliff's still-unreleased context section — the
  // annotated tag does not exist yet, so plain `--context` would leave these
  // commits under "Unreleased" in the About dialog.
  prependToChangelog(block);
  const context = JSON.parse(cliff(["--context"]));
  const stampedAt = Math.floor(Date.now() / 1000);
  for (const release of context) {
    if (release.version == null) {
      release.version = tag;
      release.timestamp = stampedAt;
    }
  }
  writeFileSync(CHANGELOG_JSON, `${JSON.stringify(context)}\n`, "utf8");
  execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "write-about-data.mjs"), "--changelog"],
    {
      cwd: ROOT,
      stdio: "inherit",
    }
  );
  out(
    `\n${c.green("✔")} CHANGELOG.md + changelog.json written for ${c.b(tag)}`
  );

  if (CHANGELOG_ONLY) {
    out(
      c.dim(
        "  --changelog: no version bump, commit, or tag. Review, then run `pnpm release`."
      )
    );
    return;
  }

  // Catch the same gates CI's verify job runs before we mint a tag that
  // would otherwise ship red. Shell-chrome is cheap and has already bitten
  // a tagged release; expand here if other local gates stay this fast.
  out(`\n${c.dim("preflight")} pnpm check:shell-chrome`);
  try {
    execSync("pnpm check:shell-chrome", { cwd: ROOT, stdio: "inherit" });
  } catch {
    die(
      "check:shell-chrome failed — fix the reported patterns, then re-run `pnpm release`."
    );
  }

  // Bump, commit, tag.
  const pkg = JSON.parse(readFileSync(PKG, "utf8"));
  pkg.version = version;
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  git(
    "add package.json CHANGELOG.md changelog.json apps/ui/src/data/changelog.json"
  );
  execSync(`git commit -m "chore(release): ${tag}"`, {
    cwd: ROOT,
    stdio: "inherit",
  });
  // Annotated (not lightweight): `git push --follow-tags` only pushes annotated
  // tags, so the recommended push below carries the tag with the commit.
  git(`tag -a ${tag} -m "chore(release): ${tag}"`);
  out(`\n${c.green("✔")} Released ${c.b(tag)} locally. Nothing pushed yet.`);
  out(c.dim("  1. Push the commit only:  git push origin main"));
  out(c.dim("  2. Wait until CI verify is green on that commit."));
  out(c.dim(`  3. Then ship:  git push origin ${tag}`));
  out(
    c.dim(
      `  → pushing the ${tag} tag triggers the image build + Coolify deploy (build-images.yml).`
    )
  );
  out(
    c.dim(
      "  Do not use --follow-tags until verify has passed — a red CI on the release commit still ships."
    )
  );
}

main().catch((e) => die(e?.message || String(e)));
