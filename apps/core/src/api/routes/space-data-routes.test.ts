import type { SpaceDataAdapter } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { resolveVisibleSpaceDataRoots } from "./space-data-routes.js";

function adapter(input: {
  moduleId: string;
  recordScopes?: Array<"all" | "space">;
  root: string;
}): SpaceDataAdapter {
  return {
    label: input.root,
    list: () => Promise.resolve({ entries: [], folders: [] }),
    moduleId: input.moduleId,
    nodeTypes: [],
    read: () => Promise.reject(new Error("not used")),
    recordScopes: input.recordScopes ?? ["all"],
    root: input.root,
  };
}

const contacts = adapter({ moduleId: "contacts", root: "Contacts" });

function moduleMount(input: {
  agentAccess?: "none" | "read" | "write";
  key: string;
  recordScope?: "all" | "space" | null;
}) {
  return {
    agentAccess: input.agentAccess ?? "write",
    recordScope: input.recordScope ?? null,
    resourceKey: input.key,
    resourceType: "module",
  };
}

describe("resolveVisibleSpaceDataRoots", () => {
  it("ignores mounts of other resource kinds", () => {
    // An agent named `contacts` must not mount the contacts MODULE by accident.
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: false,
        mounts: [
          {
            agentAccess: null,
            recordScope: null,
            resourceKey: "contacts",
            resourceType: "agent",
          },
        ],
      })
    ).toEqual([]);
  });

  it("hides a root from an agent when agent_access is none", () => {
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: true,
        mounts: [moduleMount({ agentAccess: "none", key: "contacts" })],
      })
    ).toEqual([]);
  });

  it("hides a root whose mount asks for a narrowing the module cannot express", () => {
    // Widening to "all" would silently overrule the mount.
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: false,
        mounts: [moduleMount({ key: "contacts", recordScope: "space" })],
      })
    ).toEqual([]);
  });

  it("passes a scope the adapter declares straight through", () => {
    const scoped = adapter({
      moduleId: "kb",
      recordScopes: ["all", "space"],
      root: "Knowledge",
    });
    const [entry] = resolveVisibleSpaceDataRoots({
      adapters: [scoped],
      isAutonomous: false,
      mounts: [moduleMount({ key: "kb", recordScope: "space" })],
    });
    expect(entry?.root.recordScope).toBe("space");
  });
});
