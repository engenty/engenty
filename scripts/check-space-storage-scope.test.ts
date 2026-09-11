import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs guardrail script, no type declarations
import { findSpaceStorageScopeViolations } from "./check-space-storage-scope.mjs";

/**
 * Runs the space-storage boundary guardrail as part of `pnpm test`, so a new
 * tenant-rooted key for space-scoped data fails locally rather than only in CI.
 */
describe("check-space-storage-scope", () => {
  const result = findSpaceStorageScopeViolations();

  it("classifies every tenant-rooted key builder", () => {
    const described = result.violations.map(
      (v: { file: string; lines: number[]; reason: string }) =>
        `${v.file}:${v.lines.join(",")} (${v.reason})`
    );
    expect(described).toEqual([]);
  });

  it("keeps the allowlist honest — every entry still matches a real site", () => {
    expect(result.stale).toEqual([]);
  });
});

/**
 * The repo carries no unclassified tenant-rooted keys, which is the point — but
 * it means the assertions above pass whether the scan works or has quietly
 * stopped finding anything. This ran against the real knowledge-base split
 * until Phase 6 re-rooted those bytes; with the debt paid, the mechanism needs
 * a fixture of its own rather than a bug to point at.
 */
describe("check-space-storage-scope: the scan still fires", () => {
  const root = mkdtempSync(join(tmpdir(), "space-storage-scope-"));

  function write(relPath: string, contents: string): void {
    const full = join(root, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }

  // A module whose ROWS know about spaces (its migration mentions space_id)
  // while its BYTES still key at the tenant root — the exact drift the guard
  // exists to catch, reproduced in miniature.
  write(
    "modules/widgets/supabase/migrations/0001_widgets.sql",
    "alter table module_widgets.widgets add column space_id uuid;"
  );
  write(
    "modules/widgets/src/media.ts",
    [
      "import { fileStorageTenantObjectKey } from '@engenty/file-storage';",
      "export const key = (t: string) =>",
      "  fileStorageTenantObjectKey(t, 'widgets', 'cover.png');",
    ].join("\n")
  );
  // A hand-assembled key: the spelling that bypasses the builders entirely.
  write(
    "modules/gadgets/supabase/migrations/0001_gadgets.sql",
    "alter table module_gadgets.gadgets add column space_id uuid;"
  );
  write(
    "modules/gadgets/src/media.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture of the scanned anti-pattern
    "export const key = (t: string) => `tenants/${t}/gadgets/cover.png`;"
  );
  write("scripts/space-storage-scope-allowlist.json", '{"allow":[]}');

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const fixture = findSpaceStorageScopeViolations(root);
  const files = fixture.violations.map((v: { file: string }) => v.file);

  it("catches a builder call outside the allowlist", () => {
    expect(files).toContain("modules/widgets/src/media.ts");
  });

  it("catches a hand-written tenants/… template-literal key too", () => {
    expect(files).toContain("modules/gadgets/src/media.ts");
  });

  it("reports the owner as space-scoped, which is what makes it a finding", () => {
    // The escalation rule: a tenant-level key is only wrong once its owner has
    // space-scoped rows. That inference is read from the owner's OWN
    // migrations, so it keeps working as modules gain `space_id` later.
    expect(
      fixture.violations.every((v: { spaceScoped: boolean }) => v.spaceScoped)
    ).toBe(true);
  });
});
