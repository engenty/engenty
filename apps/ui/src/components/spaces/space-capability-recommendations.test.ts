import { describe, expect, it } from "vitest";
import {
  isModuleSkill,
  relatedSkillIds,
  syncSpaceSkills,
} from "./space-capability-recommendations";
import { selectionFromDeclarations } from "./space-setup-selection";

describe("relatedSkillIds", () => {
  it("matches knowledge-base skills by prefix and by module tag", () => {
    const ids = relatedSkillIds(new Set(["knowledge-base", "contacts"]), [
      { id: "kb-search-and-retrieve" },
      { id: "contacts-search-and-retrieve" },
      { id: "custom-researcher", modules: ["knowledge-base"] },
      { id: "sandbox-code-execution" },
    ]);
    expect([...ids].sort()).toEqual([
      "contacts-search-and-retrieve",
      "custom-researcher",
      "kb-search-and-retrieve",
    ]);
  });
});

describe("syncSpaceSkills", () => {
  const skills = [
    { id: "kb-search-and-retrieve" },
    { id: "contacts-search-and-retrieve" },
    { id: "enhance-contact", modules: ["contacts"] },
    { id: "sandbox-code-execution" },
  ];
  const known = new Set(["contacts", "knowledge-base", "tasks"]);

  it("mounts every skill that belongs to a chosen module", () => {
    const selection = syncSpaceSkills(
      selectionFromDeclarations([
        {
          resourceKey: "contacts",
          resourceType: "module",
          agentAccess: "write",
        },
        {
          resourceKey: "knowledge-base",
          resourceType: "module",
          agentAccess: "write",
        },
      ]),
      skills,
      known
    );
    expect(selection.has("skill:kb-search-and-retrieve")).toBe(true);
    expect(selection.has("skill:contacts-search-and-retrieve")).toBe(true);
    expect(selection.has("skill:enhance-contact")).toBe(true);
    expect(selection.has("skill:sandbox-code-execution")).toBe(false);
  });

  it("drops module skills when the module is removed, and keeps extras", () => {
    const withContacts = syncSpaceSkills(
      selectionFromDeclarations([
        {
          resourceKey: "contacts",
          resourceType: "module",
          agentAccess: "write",
        },
        { resourceKey: "sandbox-code-execution", resourceType: "skill" },
      ]),
      skills,
      known
    );
    expect(withContacts.has("skill:contacts-search-and-retrieve")).toBe(true);
    expect(withContacts.has("skill:sandbox-code-execution")).toBe(true);

    const withoutContacts = syncSpaceSkills(
      selectionFromDeclarations([
        { resourceKey: "sandbox-code-execution", resourceType: "skill" },
      ]),
      skills,
      known
    );
    expect(withoutContacts.has("skill:contacts-search-and-retrieve")).toBe(
      false
    );
    expect(withoutContacts.has("skill:sandbox-code-execution")).toBe(true);
  });
});

describe("isModuleSkill", () => {
  it("treats prefixed and tagged skills as belonging to a module", () => {
    const known = new Set(["contacts", "knowledge-base"]);
    expect(isModuleSkill({ id: "kb-ingest" }, known)).toBe(true);
    expect(
      isModuleSkill({ id: "enhance-contact", modules: ["contacts"] }, known)
    ).toBe(true);
    expect(isModuleSkill({ id: "sandbox-code-execution" }, known)).toBe(false);
    expect(
      isModuleSkill(
        { id: "xlsx", source: "library", modules: ["library"] },
        known
      )
    ).toBe(false);
  });
});
