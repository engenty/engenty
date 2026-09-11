#!/usr/bin/env node
/**
 * Fail if active guidance re-teaches the retired work model.
 *
 * The 2026-08-25 cutover separated three things the product had collapsed into
 * one: a Routine is a job on a mounted specialist, a Run is the one execution
 * record, and a Task is a work item. Before that, a routine WAS a "standing
 * task" a schedule woke, and the docs, skills and prompts all said so.
 *
 * The runtime was rewritten in a single release, but text is the part that
 * bites twice: an agent greps the repo, finds a confident sentence describing
 * the old model, and rebuilds it. This gate exists so that cannot happen
 * silently — not to police prose in general.
 *
 * WHAT IS EXEMPT, and why:
 *  - `**\/supabase/migrations/**` and `CHANGELOG.md` — immutable history. The
 *    migration that created the standing-task model must keep describing it.
 *  - `docs/wip/**` and `modules/tasks/dev/**` — archived plans, carrying a
 *    SUPERSEDED banner that points at the canonical model.
 *  - This file, and tests that assert the old shape is REJECTED.
 *
 * Run from repo root: node scripts/check-work-vocabulary.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where active guidance lives — prose an agent or a person reads as current. */
const roots = [
  join(root, "docs"),
  join(root, "modules"),
  join(root, "packages"),
  join(root, "apps"),
];

const EXEMPT = [
  /(^|\/)supabase\/migrations\//,
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)docs\/wip\//,
  /(^|\/)modules\/tasks\/dev\//,
  /(^|\/)scripts\/check-work-vocabulary\.mjs$/,
  // The canonical model itself. Its "Retired vocabulary" table has to be able
  // to name what it retires — that is the whole function of the table.
  /(^|\/)docs\/content\/dev\/work-model\.md$/,
  // Generated commit history, same standing as CHANGELOG.md.
  /(^|\/)apps\/ui\/src\/data\/changelog\.json$/,
];

/**
 * A line that says a thing is GONE is the opposite of a line that teaches it.
 *
 * Without this, the only way to write "the standing-task model is retired" is
 * to not write it — which is how the knowledge of a cutover gets lost and the
 * model comes back.
 */
const RETIREMENT_NOTE =
  /\b(retired|superseded|replaces?|replaced|no longer|used to|the old (model|shape)|history|before the cutover|never again|is gone|come back)\b/i;

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
    } else if (/\.(md|mdx|tsx?|json)$/.test(name)) {
      out.push(p);
    }
  }
}

const patterns = [
  {
    hint: "a routine is its own record; a fire starts a Run and creates no Task",
    re: /standing[ _-]task/i,
  },
  {
    hint: "every execution is a Run — a trigger materializes nothing",
    re: /materiali[sz]es? (a|its) task/i,
  },
  {
    hint: "assignment starts a Run whose SUBJECT is the task",
    re: /assignment\s+\*?\*?is\*?\*?\s+(the\s+)?(durable\s+)?dispatch/i,
  },
  {
    hint: "a Routine targets a Workflow, never a Task",
    re: /routine\s*=\s*trigger.*task|a\s+routine\s+is\s+(a|one)\s+standing/i,
  },
  {
    hint: "overlap is decided on the Run, not on a work item's checkout",
    re: /checkout\s+as\s+(a\s+)?(run\s+)?mutex/i,
  },
  {
    hint: "retired tool ids — use workflow_propose / workflows_list / invoke_workflow",
    re: /\btriggers_(create|update|delete|fire|list|get|record_result)\b/,
  },
  {
    hint: "the product noun is Workflow — do not teach domain Action as current",
    re: /Action library|action_propose|\bthe entity is an Action\b/,
  },
];

const files = [];
for (const r of roots) {
  walk(r, files);
}

const bad = [];
for (const f of files) {
  const rel = relative(root, f);
  if (EXEMPT.some((re) => re.test(rel))) {
    continue;
  }
  const lines = readFileSync(f, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    // Look at the neighbourhood, not the line: a comment block that opens with
    // "the old model did X" and explains it over four lines is a retirement
    // note, and demanding the marker on every line would just teach people to
    // stop writing the explanation.
    const window = lines.slice(Math.max(0, i - 4), i + 5).join(" ");
    if (RETIREMENT_NOTE.test(window)) {
      continue;
    }
    for (const { re, hint } of patterns) {
      if (re.test(line)) {
        bad.push(
          `  ${rel}:${i + 1} — ${hint}\n    ${line.trim().slice(0, 140)}`
        );
      }
    }
  }
}

if (bad.length > 0) {
  console.error(
    "Retired work-model vocabulary found in active guidance.\n" +
      "The canonical model is docs/content/dev/work-model.md. If this text is\n" +
      "history rather than guidance, move it under docs/wip/ with a SUPERSEDED\n" +
      "banner instead of rewording it.\n"
  );
  for (const b of bad) {
    console.error(b);
  }
  process.exit(1);
}

console.log("work vocabulary check OK");
