import { describe, expect, it } from "vitest";
import type { AiSkillRecord } from "../../lib/admin/ai-runtime-api";
import {
  filterAndSortSkills,
  groupSkills,
  normalizeSkillRecord,
  type SkillCatalogState,
} from "./skills-catalog-state";

function skill(
  input: Partial<AiSkillRecord> & { name: string }
): AiSkillRecord {
  return {
    allowed_tools: [],
    body_markdown: null,
    compatibility: null,
    created_at: "",
    description: input.description ?? null,
    editable: input.editable ?? input.tier === "custom",
    has_tenant_override: false,
    last_seeded_at: null,
    last_synced_at: null,
    license: null,
    metadata: input.metadata ?? { module_id: "engenty-core" },
    metadata_order: [],
    name: input.name,
    owner_id: "",
    owner_kind: input.owner_kind ?? "module",
    record_id: input.name,
    reference_kind: input.reference_kind ?? "module",
    source_kind: input.source_kind ?? "seed",
    source_reference: null,
    tenant_id: null,
    tier: input.tier ?? "managed",
    title: input.title ?? null,
    updated_at: input.updated_at ?? "",
  };
}

const baseState: SkillCatalogState = {
  groupBy: "module",
  moduleFilter: "all",
  originFilter: "all",
  searchQuery: "",
  sortBy: "name",
  sortOrder: "asc",
  tierFilter: "all",
};

describe("skills catalog state", () => {
  it("normalizes source buckets from tier and module metadata", () => {
    expect(normalizeSkillRecord(skill({ name: "voice" })).origin).toBe("core");
    expect(
      normalizeSkillRecord(
        skill({ metadata: { module_id: "contacts" }, name: "contacts-search" })
      ).origin
    ).toBe("module");
    expect(
      normalizeSkillRecord(
        skill({ name: "custom", source_kind: "user", tier: "custom" })
      ).origin
    ).toBe("tenant");
  });

  it("filters by search, tier, origin, and module", () => {
    const skills = [
      normalizeSkillRecord(
        skill({
          description: "Find contacts",
          metadata: { module_id: "contacts" },
          name: "contacts-search",
        })
      ),
      normalizeSkillRecord(
        skill({ name: "tenant-draft", source_kind: "user", tier: "custom" })
      ),
    ];

    expect(
      filterAndSortSkills(skills, {
        ...baseState,
        moduleFilter: "contacts",
        originFilter: "module",
        searchQuery: "find",
        tierFilter: "managed",
      }).map((item) => item.name)
    ).toEqual(["contacts-search"]);
  });

  it("treats coding as a match for skills that talk about code", () => {
    const skills = [
      normalizeSkillRecord(
        skill({
          description: "Run Python or shell scripts in a sandbox",
          name: "sandbox-code-execution",
        })
      ),
      normalizeSkillRecord(
        skill({ description: "Invoice CRUD", name: "invoices-list" })
      ),
    ];

    expect(
      filterAndSortSkills(skills, {
        ...baseState,
        searchQuery: "coding",
      }).map((item) => item.name)
    ).toEqual(["sandbox-code-execution"]);
  });

  it("sorts descending by display name", () => {
    const skills = [
      normalizeSkillRecord(skill({ name: "a-skill", title: "Alpha" })),
      normalizeSkillRecord(skill({ name: "z-skill", title: "Zulu" })),
    ];

    expect(
      filterAndSortSkills(skills, {
        ...baseState,
        sortOrder: "desc",
      }).map((item) => item.name)
    ).toEqual(["z-skill", "a-skill"]);
  });

  it("groups skills by source labels", () => {
    const groups = groupSkills(
      [
        normalizeSkillRecord(skill({ name: "core-skill" })),
        normalizeSkillRecord(
          skill({ name: "custom-skill", source_kind: "user", tier: "custom" })
        ),
      ],
      "source",
      {
        core: "Core",
        custom: "Custom",
        managed: "Managed",
        module: "Module",
        tenant: "Tenant",
        ungrouped: "All",
      }
    );

    expect(groups.map((group) => [group.label, group.skills[0]?.name])).toEqual(
      [
        ["Core", "core-skill"],
        ["Tenant", "custom-skill"],
      ]
    );
  });

  it("returns no groups for an empty filtered result", () => {
    expect(
      groupSkills([], "none", {
        core: "Core",
        custom: "Custom",
        managed: "Managed",
        module: "Module",
        tenant: "Tenant",
        ungrouped: "All",
      })
    ).toEqual([]);
  });
});
