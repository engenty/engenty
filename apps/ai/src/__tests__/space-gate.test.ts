import { describe, expect, it } from "vitest";
import {
  checkOperationAgainstSpace,
  isModuleVisibleInSpace,
  isToolVisibleInSpace,
  type SpaceGateSurface,
  spaceScopeNote,
} from "../../ai/tools/engenty-tools/lib/space-gate.js";

/** Mounts tasks + contacts (read-only), and Gmail but not Drive. */
const marketing: SpaceGateSurface = {
  allConnectorPrefixes: new Set(["gmail", "gdrive", "gcal", "g"]),
  connectorPrefixes: new Set(["gmail"]),
  moduleIds: new Set(["tasks", "contacts"]),
  readOnlyModuleIds: new Set(["contacts"]),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

describe("space gate", () => {
  it("allows an operation from a module the space mounts", () => {
    expect(
      checkOperationAgainstSpace({
        moduleId: "tasks",
        operationId: "tasks_create",
        readOnly: false,
        space: marketing,
      })
    ).toBeNull();
  });

  it("refuses an operation from a module the space does not mount", () => {
    const refusal = checkOperationAgainstSpace({
      moduleId: "offers",
      operationId: "offers_list",
      readOnly: true,
      space: marketing,
    });
    expect(refusal?.error).toBe("module_not_in_space");
    // The message has to read as a fact about the world, not a transient
    // failure — otherwise the model retries it.
    expect(refusal?.message).toContain("do not retry");
  });

  it("refuses a WRITE into a read-only mount but allows the read", () => {
    expect(
      checkOperationAgainstSpace({
        moduleId: "contacts",
        operationId: "contacts_list",
        readOnly: true,
        space: marketing,
      })
    ).toBeNull();
    expect(
      checkOperationAgainstSpace({
        moduleId: "contacts",
        operationId: "contacts_update",
        readOnly: false,
        space: marketing,
      })?.error
    ).toBe("space_read_only");
  });

  it("never gates platform tools", () => {
    // Artifacts, the catalog itself: the agent's own faculties, not a
    // module a space mounts. Gating these would break chat inside every space.
    for (const moduleId of [undefined, "core", "engenty-core"]) {
      expect(
        checkOperationAgainstSpace({
          operationId: "artifact_write",
          readOnly: false,
          space: marketing,
          ...(moduleId ? { moduleId } : {}),
        })
      ).toBeNull();
    }
  });

  it("allows everything when the run has no space", () => {
    // No space resolved is intentional tenant-global, not a denial: the
    // surface narrows what a run may reach and never widens it.
    expect(
      checkOperationAgainstSpace({
        moduleId: "offers",
        operationId: "offers_delete",
        readOnly: false,
        space: null,
      })
    ).toBeNull();
  });

  it("refuses module and connector work when the Space is unresolved", () => {
    const unresolved = {
      claimed_space_id: marketing.spaceId,
      kind: "unresolved" as const,
      reason: "not_found" as const,
    };
    const refusal = checkOperationAgainstSpace({
      moduleId: "tasks",
      operationId: "tasks_list",
      readOnly: true,
      space: unresolved,
    });
    expect(refusal?.error).toBe("space_context_unresolved");
    expect(refusal?.message).toContain("do not retry");
    expect(
      checkOperationAgainstSpace({
        moduleId: "connections-google",
        operationId: "gmail_search_threads",
        readOnly: true,
        space: unresolved,
      })?.error
    ).toBe("space_context_unresolved");
    expect(isModuleVisibleInSpace("tasks", unresolved)).toBe(false);
    expect(isModuleVisibleInSpace("core", unresolved)).toBe(true);
    expect(
      isToolVisibleInSpace(
        { moduleId: "tasks", operationId: "tasks_list" },
        unresolved
      )
    ).toBe(false);
  });

  it("still allows platform tools when the Space is unresolved", () => {
    const unresolved = {
      claimed_space_id: marketing.spaceId,
      kind: "unresolved" as const,
      reason: "unavailable" as const,
    };
    expect(
      checkOperationAgainstSpace({
        operationId: "artifact_write",
        readOnly: false,
        space: unresolved,
      })
    ).toBeNull();
  });

  it("hides unmounted modules from the catalog but keeps read-only ones", () => {
    expect(isModuleVisibleInSpace("offers", marketing)).toBe(false);
    expect(isModuleVisibleInSpace("contacts", marketing)).toBe(true);
    expect(isModuleVisibleInSpace("core", marketing)).toBe(true);
    expect(isModuleVisibleInSpace("offers", null)).toBe(true);
  });
});

describe("connector mounts (C3b)", () => {
  it("allows a mounted connector and refuses an unmounted one", () => {
    expect(
      checkOperationAgainstSpace({
        moduleId: "connections-google",
        operationId: "gmail_search_threads",
        readOnly: true,
        space: marketing,
      })
    ).toBeNull();
    const refusal = checkOperationAgainstSpace({
      moduleId: "connections-google",
      operationId: "gdrive_files_list",
      readOnly: true,
      space: marketing,
    });
    expect(refusal?.error).toBe("connector_not_in_space");
  });

  it("decides per CONNECTOR, not per provider module", () => {
    // Gmail and Drive ship in the same module. If the module decided, mounting
    // Gmail would hand the space all of Google — the reason the connector
    // check runs before the module check and instead of it.
    expect(isModuleVisibleInSpace("connections-google", marketing)).toBe(false);
    expect(
      isToolVisibleInSpace(
        { moduleId: "connections-google", operationId: "gmail_search_threads" },
        marketing
      )
    ).toBe(true);
  });

  it("matches the LONGEST prefix so a short one cannot swallow another", () => {
    // A connector whose prefix is a prefix of another's ("g" vs "gmail") must
    // not claim its operations — that would silently mis-attribute the mount.
    expect(
      checkOperationAgainstSpace({
        moduleId: "connections-google",
        operationId: "gmail_send",
        readOnly: false,
        space: marketing,
      })
    ).toBeNull();
  });

  it("keeps the connections plumbing reachable once a connector is mounted", () => {
    // A space with Gmail but without the connections module would otherwise be
    // able to call Gmail and unable to ask which account to call it with.
    expect(
      checkOperationAgainstSpace({
        moduleId: "connections",
        operationId: "connections_catalog",
        readOnly: true,
        space: marketing,
      })
    ).toBeNull();
  });

  it("closes the plumbing again when the space mounts no connector", () => {
    const noConnectors: SpaceGateSurface = {
      ...marketing,
      connectorPrefixes: new Set(),
    };
    expect(
      checkOperationAgainstSpace({
        moduleId: "connections",
        operationId: "connections_catalog",
        readOnly: true,
        space: noConnectors,
      })?.error
    ).toBe("module_not_in_space");
  });
});

describe("space scope note", () => {
  it("names the mounted apps so the model does not invent a reason", () => {
    // Observed live before this existed: asked for offers in a space that does
    // not mount them, the copilot searched, got only the mounted module back,
    // and reported "the offers module has no read tool registered" — confident
    // and wrong, because nothing in the result said anything was removed.
    const note = spaceScopeNote(marketing);
    expect(note).toContain("contacts, tasks");
    expect(note).toContain("not part of this space");
  });

  it("is absent outside any space", () => {
    expect(spaceScopeNote(null)).toBeNull();
  });

  it("tells the model not to do module work when the Space is unresolved", () => {
    const note = spaceScopeNote({
      claimed_space_id: marketing.spaceId,
      kind: "unresolved",
      reason: "forbidden",
    });
    expect(note).toContain("could not be resolved");
    expect(note).toContain("Do not perform module work");
  });
});
