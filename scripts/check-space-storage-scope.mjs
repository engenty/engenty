#!/usr/bin/env node
/**
 * Guardrail: bytes belonging to a space must be rooted in that space.
 *
 * PLAN-spaces.md §1b nests exactly ONE boundary — `tenants/<t>/spaces/<s>/…` —
 * and the property it buys is that a space-scoped run cannot address another
 * space's bytes because no path exists. That guarantee is only as good as its
 * weakest writer: one module keying its uploads at `tenants/<t>/<folder>/…`
 * while its rows carry a `space_id` splits the space in half. The row says
 * space, the bytes say tenant, and a space export, a space delete or a
 * per-space mirror silently misses them.
 *
 * That is not hypothetical. `module_kb.knowledge_bases` gained `space_id` in
 * Phase 4 while its cover media, converted documents and source captures kept
 * writing tenant-rooted keys — found by hand, after the fact. This check exists
 * so the next one is found by CI instead.
 *
 * What it does: every site outside `packages/file-storage` that builds a
 * TENANT-rooted key — via `fileStorageTenantObjectKey()` or by hand-assembling
 * a `tenants/${…}` string — must be classified in
 * `scripts/space-storage-scope-allowlist.json`:
 *
 *   - `tenant-level` — the bytes genuinely belong to the tenant, above any
 *     space (skills, the per-user copilot home, company profile, the storage
 *     routes themselves).
 *   - `debt`         — the owner has space-scoped rows and these bytes have not
 *     followed yet. A recorded finding, not an approval.
 *
 * The self-correcting part: an owner's `space_id` columns are read from its own
 * migrations, so the day a `tenant-level` module gains one, its entries turn
 * into errors and demand reclassification. That is the KB case, caught at the
 * migration instead of six weeks later.
 *
 * Run: `pnpm check:space-storage-scope`. Also asserted by a vitest guardrail
 * (scripts/check-space-storage-scope.test.ts) so it runs with `pnpm test`.
 *
 * Known limits, stated so nobody reads a green run as containment: this is text
 * analysis over two spellings. A key built through a helper that takes the root
 * as a parameter, or assembled from segments joined at runtime, is invisible to
 * it. It is a regression net over the two ways keys are actually written today,
 * not a proof that every byte is where it belongs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "modules", "packages"];
const ALLOWLIST_PATH = "scripts/space-storage-scope-allowlist.json";

/**
 * The builders' own home. `fileStorageTenantObjectKey` is *defined* here and
 * `workWorkspacePrefix` calls it for the global tier on purpose (§1b: the
 * tenant commons stays tenant-level), so scanning it would only ever report
 * itself.
 */
const EXEMPT_PREFIXES = ["packages/file-storage/src/"];

const BUILDER_PATTERN = /fileStorageTenantObjectKey\s*\(/;
/** Hand-assembled key — the spelling that bypasses the builders entirely. */
const LITERAL_PATTERN = /`tenants\/\$\{/;

/** A line that only *talks* about a key is not a line that builds one. */
function isComment(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

function findSourceFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "__tests__" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      findSourceFiles(full, acc);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * The unit that owns both a file's code and its migrations: `modules/<name>` or
 * `apps/<name>`. Classification is per file, but space-ownership is a property
 * of the owner — which is what makes "this module just gained a space_id" a
 * question the check can answer.
 */
function ownerOf(relPath) {
  const match = /^(apps|modules)\/([^/]+)\//.exec(relPath);
  return match ? `${match[1]}/${match[2]}` : null;
}

const spaceScopedCache = new Map();

/** Does this owner store rows that belong to a space? Read from its migrations. */
function ownerIsSpaceScoped(root, owner) {
  if (!owner) {
    return false;
  }
  const cached = spaceScopedCache.get(owner);
  if (cached !== undefined) {
    return cached;
  }
  const migrationsDir = join(root, owner, "supabase", "migrations");
  let files;
  try {
    files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  } catch {
    files = [];
  }
  const scoped = files.some((name) =>
    /\bspace_id\b/.test(readFileSync(join(migrationsDir, name), "utf-8"))
  );
  spaceScopedCache.set(owner, scoped);
  return scoped;
}

function readAllowlist(root) {
  const raw = JSON.parse(readFileSync(join(root, ALLOWLIST_PATH), "utf-8"));
  const byFile = new Map();
  for (const entry of raw.allow ?? []) {
    byFile.set(entry.file, entry);
  }
  return byFile;
}

export function findSpaceStorageScopeViolations(root = ROOT) {
  const allowlist = readAllowlist(root);
  const sites = new Map();

  for (const dir of SCAN_DIRS) {
    for (const file of findSourceFiles(join(root, dir))) {
      const relPath = relative(root, file).split("\\").join("/");
      if (EXEMPT_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
        continue;
      }
      const lines = readFileSync(file, "utf-8").split("\n");
      for (const [index, line] of lines.entries()) {
        if (isComment(line)) {
          continue;
        }
        const kind = BUILDER_PATTERN.test(line)
          ? "builder"
          : LITERAL_PATTERN.test(line)
            ? "literal"
            : null;
        if (!kind) {
          continue;
        }
        const existing = sites.get(relPath);
        if (existing) {
          existing.lines.push(index + 1);
        } else {
          sites.set(relPath, { file: relPath, kind, lines: [index + 1] });
        }
      }
    }
  }

  const violations = [];
  const debt = [];

  for (const site of sites.values()) {
    const entry = allowlist.get(site.file);
    const owner = ownerOf(site.file);
    if (!entry) {
      violations.push({
        ...site,
        owner,
        reason: "unclassified",
        spaceScoped: ownerIsSpaceScoped(root, owner),
      });
      continue;
    }
    // `despiteSpaceScopedOwner` is the escape hatch for the owner that DEFINES
    // spaces: apps/core carries `space_id` in every sense and still writes the
    // tenant root every space hangs off. It must be argued per file, never
    // per owner — otherwise the one module that needs it disarms the check for
    // everything beside it.
    if (
      entry.kind === "tenant-level" &&
      !entry.despiteSpaceScopedOwner &&
      ownerIsSpaceScoped(root, owner)
    ) {
      violations.push({
        ...site,
        owner,
        reason: "owner-gained-space-id",
        spaceScoped: true,
      });
      continue;
    }
    if (entry.kind === "debt") {
      debt.push({ ...site, owner, note: entry.reason });
    }
  }

  const stale = [...allowlist.keys()].filter((file) => !sites.has(file));

  return { debt, sites: [...sites.values()], stale, violations };
}

function main() {
  const { debt, stale, violations } = findSpaceStorageScopeViolations();

  if (debt.length > 0) {
    console.log(
      `check-space-storage-scope: ${debt.length} file(s) hold KNOWN space-storage debt — ` +
        "recorded findings, not approvals:"
    );
    for (const d of debt) {
      console.log(`    · ${d.file} — ${d.note}`);
    }
  }

  if (stale.length > 0) {
    console.error(
      `\ncheck-space-storage-scope: stale entries in ${ALLOWLIST_PATH} — the file no\n` +
        "longer builds a tenant-rooted key. Delete them if fixed, update them if the\n" +
        "code moved:\n"
    );
    for (const file of stale) {
      console.error(`  ✗ ${file}`);
    }
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      "check-space-storage-scope: ok — every tenant-rooted key builder is classified"
    );
    return;
  }

  console.error(
    "check-space-storage-scope: a tenant-rooted storage key must be a deliberate\n" +
      "choice. PLAN-spaces.md §1b nests exactly one boundary; bytes written above it\n" +
      "for data that belongs to a space are invisible to space export, space delete\n" +
      "and per-space mirroring.\n"
  );
  for (const v of violations) {
    if (v.reason === "owner-gained-space-id") {
      console.error(
        `  ✗ ${v.file}:${v.lines.join(",")} — ${v.owner} now stores space-scoped rows,\n` +
          `      but this file is classified "tenant-level". Either move these bytes to\n` +
          '      fileStorageSpaceObjectKey(), or reclassify the entry as "debt" with the\n' +
          "      phase that will move them."
      );
    } else {
      console.error(
        `  ✗ ${v.file}:${v.lines.join(",")} builds a tenant-rooted key and is not classified.`
      );
    }
  }
  console.error(
    "\nIf the bytes belong to a space, build the key with fileStorageSpaceObjectKey()\n" +
      "from @engenty/file-storage. If they genuinely sit above every space, add an\n" +
      `entry to ${ALLOWLIST_PATH} with kind "tenant-level" and say why.`
  );
  process.exit(1);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
