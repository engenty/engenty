import { describe, expect, it } from "vitest";
import {
  capabilityModuleIds,
  isModuleSkill,
  relatedConnectionIds,
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

describe("relatedConnectionIds", () => {
  it("offers file connectors when Knowledge Base is mounted", () => {
    const ids = relatedConnectionIds(new Set(["knowledge-base"]), [
      {
        connectorId: "local-files",
        hasFiles: true,
        id: "conn-folder",
        name: "Documents",
      },
      {
        connectorId: "google-drive",
        hasFiles: true,
        id: "connector:google-drive",
        name: "Google Drive",
      },
      {
        connectorId: "google-gmail",
        hasFiles: false,
        id: "conn-mail",
        name: "Gmail",
      },
    ]);
    expect([...ids].sort()).toEqual(["conn-folder", "connector:google-drive"]);
  });

  it("matches known file connectors even when hasFiles is missing", () => {
    const ids = relatedConnectionIds(new Set(["knowledge-base"]), [
      {
        connectorId: "local-files",
        id: "connector:local-files",
        name: "Local Files",
      },
    ]);
    expect([...ids]).toEqual(["connector:local-files"]);
  });

  it("offers mail connectors when Inbox is mounted", () => {
    const ids = relatedConnectionIds(new Set(["inbox"]), [
      {
        connectorId: "google-gmail",
        hasFiles: false,
        id: "conn-mail",
        name: "Work Gmail",
      },
      {
        connectorId: "local-files",
        hasFiles: true,
        id: "conn-folder",
        name: "Documents",
      },
    ]);
    expect([...ids]).toEqual(["conn-mail"]);
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

describe("capabilityModuleIds", () => {
  it("drops baseline modules so Files does not recommend Drive on every space", () => {
    const ids = capabilityModuleIds(
      [
        { resourceKey: "files", resourceType: "module" },
        { resourceKey: "knowledge-base", resourceType: "module" },
        { resourceKey: "tasks", resourceType: "module" },
      ],
      new Set(["module:files", "module:tasks"])
    );
    expect([...ids]).toEqual(["knowledge-base"]);
  });
});
