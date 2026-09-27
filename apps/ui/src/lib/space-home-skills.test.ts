import { describe, expect, it } from "vitest";
import type { SpaceCatalogSkill } from "@/lib/api/spaces-client";
import { groupSpaceHomeSkills } from "./space-home-skills";

const skill = (
  name: string,
  overrides: Partial<SpaceCatalogSkill> = {}
): SpaceCatalogSkill => ({
  description: "",
  name,
  tier: "managed",
  ...overrides,
});

// Fails if: a module's skills are listed in a space without that module (the
// overlisting this box replaces); a library pack nobody added shows up; the
// platform playbooks every run sees go missing; a tenant skill on the space
// lands in the library folder, or one not on it reads as in use.
describe("groupSpaceHomeSkills", () => {
  const catalog = [
    skill("kb-ingest", {
      engenty_modules: ["knowledge-base"],
      source: "knowledge-base",
      title: "KB ingest workflow",
    }),
    skill("contacts-search", {
      engenty_modules: ["contacts"],
      source: "contacts",
    }),
    skill("show-records", { source: "builtin" }),
    skill("docx", { category: "productivity", source: "library" }),
    skill("canvas-design", { category: "design", source: "library" }),
    skill("triage", { source: "upload", tier: "custom" }),
    skill("weekly-report", { source: "skills_sh", tier: "custom" }),
  ];

  const grouped = groupSpaceHomeSkills({
    catalog,
    mountedModules: new Set(["knowledge-base"]),
    mountedSkills: new Set(["docx", "triage"]),
    moduleNames: new Map([["knowledge-base", "Wissensdatenbank"]]),
  });
  const folder = (id: string) =>
    grouped.folders
      .find((candidate) => candidate.id === id)
      ?.skills.map((entry) => entry.name);

  it("lists the space's own tenant skills on top", () => {
    expect(grouped.own.map((entry) => entry.name)).toEqual(["triage"]);
  });

  it("groups by origin: mounted modules, then engenty, then the tenant", () => {
    expect(grouped.folders.map((entry) => [entry.kind, entry.label])).toEqual([
      ["module", "Wissensdatenbank"],
      ["engenty", null],
      ["tenant", null],
    ]);
    expect(folder("knowledge-base")).toEqual(["kb-ingest"]);
    expect(folder("engenty")).toEqual(["docx", "show-records"]);
    expect(folder("tenant")).toEqual(["weekly-report"]);
  });
});
