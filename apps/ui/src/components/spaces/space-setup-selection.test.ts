import { describe, expect, it } from "vitest";
import {
  closeModuleDependencies,
  DEFAULT_MODULE_ACCESS,
  moduleRequiredBy,
  moduleRequiresFromItems,
  pendingRemovals,
  selectionFromDeclarations,
  selectionFromMounts,
  selectionToPayload,
  setModuleAccess,
  spaceKeyFromName,
  toggleModuleSelection,
  toggleSelection,
} from "./space-setup-selection";

describe("toggleSelection", () => {
  it("grants write for a module a human just added", () => {
    // Adding a module is a choice to work with it, including its engentys.
    // Tighten to look-up-only from Details. See DEFAULT_MODULE_ACCESS.
    const selection = toggleSelection(
      new Map(),
      { resourceKey: "offers", resourceType: "module" },
      true
    );
    expect(selection.get("module:offers")?.agentAccess).toBe("write");
    expect(DEFAULT_MODULE_ACCESS).toBe("write");
  });

  it("gives non-module kinds no access level at all", () => {
    const selection = toggleSelection(
      new Map(),
      { resourceKey: "custom.researcher", resourceType: "agent" },
      true
    );
    expect(selection.get("agent:custom.researcher")).toEqual({
      resourceKey: "custom.researcher",
      resourceType: "agent",
    });
  });

  it("unticking removes the entry", () => {
    const on = toggleSelection(
      new Map(),
      { resourceKey: "offers", resourceType: "module" },
      true
    );
    const off = toggleSelection(
      on,
      { resourceKey: "offers", resourceType: "module" },
      false
    );
    expect(off.size).toBe(0);
  });

  it("does not mutate the previous selection", () => {
    const before = new Map();
    toggleSelection(before, { resourceKey: "x", resourceType: "skill" }, true);
    expect(before.size).toBe(0);
  });
});

describe("selectionFromMounts", () => {
  it("keeps a module mounted with no access at 'none' when editing", () => {
    // The opposite default from a fresh tick, and deliberately so: an existing
    // row's level is a decision someone made, and reopening the dialog must not
    // quietly promote it to read.
    const selection = selectionFromMounts([
      { agentAccess: "none", resourceKey: "secrets", resourceType: "module" },
    ]);
    expect(selection.get("module:secrets")?.agentAccess).toBe("none");
  });
});

describe("selectionFromDeclarations", () => {
  it("carries a template's declared access level through unchanged", () => {
    const selection = selectionFromDeclarations([
      { agentAccess: "write", resourceKey: "offers", resourceType: "module" },
      { resourceKey: "engenty.copilot", resourceType: "agent" },
    ]);
    expect(selection.get("module:offers")?.agentAccess).toBe("write");
    expect(selection.get("agent:engenty.copilot")?.agentAccess).toBeUndefined();
  });
});

describe("setModuleAccess", () => {
  it("changes only the named module", () => {
    const selection = selectionFromDeclarations([
      { agentAccess: "write", resourceKey: "offers", resourceType: "module" },
      { agentAccess: "write", resourceKey: "invoices", resourceType: "module" },
    ]);
    const next = setModuleAccess(selection, "offers", "none");
    expect(next.get("module:offers")?.agentAccess).toBe("none");
    expect(next.get("module:invoices")?.agentAccess).toBe("write");
  });

  it("ignores a module that is not selected", () => {
    const selection = new Map();
    expect(setModuleAccess(selection, "offers", "write")).toBe(selection);
  });
});

describe("pendingRemovals", () => {
  it("names what a save would unmount", () => {
    const selection = selectionFromDeclarations([
      { agentAccess: "read", resourceKey: "tasks", resourceType: "module" },
    ]);
    expect(
      pendingRemovals(selection, [
        { resourceKey: "tasks", resourceType: "module" },
        { resourceKey: "offers", resourceType: "module" },
        { resourceKey: "slack", resourceType: "plugin" },
      ])
    ).toEqual([
      { resourceKey: "offers", resourceType: "module" },
      { resourceKey: "slack", resourceType: "plugin" },
    ]);
  });

  it("does not count an access-level change as a removal", () => {
    // Downgrading write→read rewrites the row; the warning is about mounts that
    // disappear, and crying wolf on an edit would train people to ignore it.
    const selection = selectionFromDeclarations([
      { agentAccess: "read", resourceKey: "tasks", resourceType: "module" },
    ]);
    expect(
      pendingRemovals(selection, [
        { resourceKey: "tasks", resourceType: "module" },
      ])
    ).toEqual([]);
  });
});

describe("selectionToPayload", () => {
  it("emits the wire shape the create and edit endpoints share", () => {
    const payload = selectionToPayload(
      selectionFromDeclarations([
        { agentAccess: "write", resourceKey: "offers", resourceType: "module" },
        { resourceKey: "custom.researcher", resourceType: "agent" },
      ])
    );
    expect(payload).toEqual([
      {
        agent_access: "write",
        resource_key: "offers",
        resource_type: "module",
      },
      { resource_key: "custom.researcher", resource_type: "agent" },
    ]);
  });

  it("does not decide a module's record scope", () => {
    // It used to send `"space"` for every module, which is false for the ones
    // people mount — offers is one tenant-wide book a space borrows. Absent
    // means undecided, and undecided is the truth until something reads it.
    const payload = selectionToPayload(
      selectionFromDeclarations([
        { agentAccess: "write", resourceKey: "offers", resourceType: "module" },
      ])
    );
    expect(payload[0]).not.toHaveProperty("record_scope");
  });

  it("never sends module-only fields on another kind", () => {
    // The mirror CHECK in the database rejects them, so this would 400 the save.
    const payload = selectionToPayload(
      selectionFromDeclarations([
        { resourceKey: "google-gmail", resourceType: "plugin" },
      ])
    );
    expect(payload[0]).not.toHaveProperty("agent_access");
    expect(payload[0]).not.toHaveProperty("record_scope");
  });
});

describe("spaceKeyFromName", () => {
  it("produces a key the database's format CHECK accepts", () => {
    const pattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
    for (const name of [
      "Kunde Müller GmbH",
      "Forschung & Entwicklung",
      "  Marketing  ",
      "Straße 1",
      "Ünïcödé",
    ]) {
      expect(spaceKeyFromName(name), name).toMatch(pattern);
    }
  });

  it("transliterates German umlauts rather than dropping them", () => {
    expect(spaceKeyFromName("Kunde Müller GmbH")).toBe("kunde-mueller-gmbh");
    expect(spaceKeyFromName("Straße 1")).toBe("strasse-1");
  });

  it("returns an empty key for a name with nothing usable, so save stays disabled", () => {
    expect(spaceKeyFromName("!!!")).toBe("");
    expect(spaceKeyFromName("   ")).toBe("");
  });

  it("truncates without leaving a trailing dash", () => {
    const key = spaceKeyFromName(`${"a".repeat(62)} b`);
    expect(key.length).toBeLessThanOrEqual(63);
    expect(key.endsWith("-")).toBe(false);
  });
});

describe("module dependencies", () => {
  const requires = moduleRequiresFromItems([
    { id: "tasks" },
    { id: "projects", requires: ["tasks"] },
    { id: "time-tracking", requires: ["projects", "tasks"] },
    { id: "offers", requires: [] },
  ]);
  const keys = (selection: Map<string, unknown>) =>
    [...selection.keys()].sort();

  it("ticking a module pulls in what it requires, transitively", () => {
    const selection = toggleModuleSelection(
      new Map(),
      "time-tracking",
      true,
      requires
    );
    expect(keys(selection)).toEqual([
      "module:projects",
      "module:tasks",
      "module:time-tracking",
    ]);
    // Pulled-in modules get the same grant a hand-added one would.
    expect(selection.get("module:tasks")?.agentAccess).toBe(
      DEFAULT_MODULE_ACCESS
    );
  });

  it("unticking a module takes out what requires it, transitively", () => {
    const full = toggleModuleSelection(
      toggleModuleSelection(new Map(), "time-tracking", true, requires),
      "offers",
      true,
      requires
    );
    expect(keys(toggleModuleSelection(full, "tasks", false, requires))).toEqual(
      ["module:offers"]
    );
  });

  it("names the direct dependents that keep a module in place", () => {
    const full = toggleModuleSelection(
      new Map(),
      "time-tracking",
      true,
      requires
    );
    expect(moduleRequiredBy(full, "tasks", requires).sort()).toEqual([
      "projects",
      "time-tracking",
    ]);
    expect(moduleRequiredBy(full, "time-tracking", requires)).toEqual([]);
  });

  it("closes a set that a template left open, and leaves a closed one alone", () => {
    const open = toggleSelection(
      new Map(),
      { resourceKey: "projects", resourceType: "module" },
      true
    );
    const closed = closeModuleDependencies(open, requires);
    expect(keys(closed)).toEqual(["module:projects", "module:tasks"]);
    expect(closeModuleDependencies(closed, requires)).toBe(closed);
  });
});
