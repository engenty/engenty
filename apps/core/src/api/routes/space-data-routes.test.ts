/**
 * Mount = grant, asserted at the ADAPTER LAYER (PLAN-space-data.md acceptance 4).
 *
 * Deliberately not a UI test and not an HTTP test: the rule that a module a
 * space has not mounted shows none of its nodes — to humans and to agents — has
 * to hold at the seam every face goes through, or a second face could quietly
 * disagree with the first.
 */
import type { SpaceDataAdapter } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  createBodySchema,
  moveBodySchema,
  resolveVisibleSpaceDataRoots,
  splitSpaceDataPath,
} from "./space-data-routes.js";

function adapter(input: {
  moduleId: string;
  recordScopes?: Array<"all" | "space">;
  root: string;
  rootNodeType?: string;
  writable?: boolean;
}): SpaceDataAdapter {
  return {
    label: input.root,
    list: () => Promise.resolve({ entries: [], folders: [] }),
    moduleId: input.moduleId,
    nodeTypes: [],
    read: () => Promise.reject(new Error("not used")),
    recordScopes: input.recordScopes ?? ["all"],
    root: input.root,
    ...(input.rootNodeType ? { rootNodeType: input.rootNodeType } : {}),
    ...(input.writable === false
      ? {}
      : { write: () => Promise.reject(new Error("not used")) }),
  };
}

const contacts = adapter({ moduleId: "contacts", root: "Contacts" });
const offers = adapter({ moduleId: "offers", root: "Offers" });

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

describe("mount = grant", () => {
  it("shows only the modules the space has mounted", () => {
    const roots = resolveVisibleSpaceDataRoots({
      adapters: [contacts, offers],
      isAutonomous: false,
      mounts: [moduleMount({ key: "contacts" })],
    });
    expect(roots.map((entry) => entry.root.root)).toEqual(["Contacts"]);
  });

  it("shows nothing at all in a space with no module mounts", () => {
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts, offers],
        isAutonomous: false,
        mounts: [],
      })
    ).toEqual([]);
  });

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
});

describe("agent_access is the fourth reader of the mount row", () => {
  it("hides a root from an agent when agent_access is none", () => {
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: true,
        mounts: [moduleMount({ agentAccess: "none", key: "contacts" })],
      })
    ).toEqual([]);
  });

  it("still shows it to a HUMAN — agent_access gates agents, not people", () => {
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: false,
        mounts: [moduleMount({ agentAccess: "none", key: "contacts" })],
      })
    ).toHaveLength(1);
  });

  it("lists for an agent with read access", () => {
    expect(
      resolveVisibleSpaceDataRoots({
        adapters: [contacts],
        isAutonomous: true,
        mounts: [moduleMount({ agentAccess: "read", key: "contacts" })],
      })
    ).toHaveLength(1);
  });
});

describe("record_scope", () => {
  it("defaults an undecided scope to the whole tenant library", () => {
    const [entry] = resolveVisibleSpaceDataRoots({
      adapters: [contacts],
      isAutonomous: false,
      mounts: [moduleMount({ key: "contacts", recordScope: null })],
    });
    expect(entry?.root.recordScope).toBe("all");
  });

  it("HIDES a root whose mount asks for a narrowing the module cannot express", () => {
    // Contacts carry no space_id (PLAN-spaces §1b-bis). Widening to "all" would
    // silently overrule the mount, so the honest answer is nothing.
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

describe("root dto", () => {
  it("reports writability from the adapter, not from the caller", () => {
    const readOnly = adapter({
      moduleId: "reports",
      root: "Reports",
      writable: false,
    });
    const [entry] = resolveVisibleSpaceDataRoots({
      adapters: [readOnly],
      isAutonomous: false,
      mounts: [moduleMount({ key: "reports" })],
    });
    expect(entry?.root.writable).toBe(false);
  });

  it("carries the root's folder type, and omits it when undeclared", () => {
    // The tree keys a module-contributed folder view off this. An absent field
    // is not the same as an empty one: `""` would resolve to the surface
    // `spaces.data.folder:` and let any module claiming that string render
    // every untyped root in the system.
    const typed = adapter({
      moduleId: "contacts",
      root: "Contacts",
      rootNodeType: "contacts.root",
    });
    const [withType] = resolveVisibleSpaceDataRoots({
      adapters: [typed],
      isAutonomous: false,
      mounts: [moduleMount({ key: "contacts" })],
    });
    expect(withType?.root.rootNodeType).toBe("contacts.root");

    const [without] = resolveVisibleSpaceDataRoots({
      adapters: [offers],
      isAutonomous: false,
      mounts: [moduleMount({ key: "offers" })],
    });
    expect(without?.root).not.toHaveProperty("rootNodeType");
  });

  it("sorts roots so the tree does not reorder itself between requests", () => {
    const roots = resolveVisibleSpaceDataRoots({
      adapters: [offers, contacts],
      isAutonomous: false,
      mounts: [
        moduleMount({ key: "offers" }),
        moduleMount({ key: "contacts" }),
      ],
    });
    expect(roots.map((entry) => entry.root.root)).toEqual([
      "Contacts",
      "Offers",
    ]);
  });

  it("shows an alwaysVisible adapter to humans without a mount", () => {
    const pages = {
      ...adapter({ moduleId: "pages", root: "Pages" }),
      alwaysVisible: true,
    };
    const roots = resolveVisibleSpaceDataRoots({
      adapters: [contacts, pages],
      isAutonomous: false,
      mounts: [moduleMount({ key: "contacts" })],
    });
    expect(roots.map((entry) => entry.root.root)).toEqual([
      "Contacts",
      "Pages",
    ]);
  });

  it("shows an alwaysVisible adapter to agents without a mount", () => {
    const pages = {
      ...adapter({ moduleId: "pages", root: "Pages" }),
      alwaysVisible: true,
    };
    const roots = resolveVisibleSpaceDataRoots({
      adapters: [pages],
      isAutonomous: true,
      mounts: [],
    });
    expect(roots.map((entry) => entry.root.root)).toEqual(["Pages"]);
  });
});

describe("path splitting", () => {
  it("separates the root from the adapter-relative rest", () => {
    expect(splitSpaceDataPath("Contacts/People/anna__1.contact.md")).toEqual({
      relativePath: "People/anna__1.contact.md",
      root: "Contacts",
    });
    expect(splitSpaceDataPath("Contacts")).toEqual({
      relativePath: "",
      root: "Contacts",
    });
    expect(splitSpaceDataPath("")).toEqual({ relativePath: "", root: "" });
  });

  it("REFUSES traversal here, not in each adapter", () => {
    // Contacts and offers happen to be safe because both match against a fixed
    // folder list — but that is their business logic, not a boundary. An
    // adapter that maps a path to a storage key would inherit a hole from an
    // author who did not think to check.
    for (const path of [
      "Contacts/../../etc/passwd",
      "Contacts/./secrets",
      "../Offers",
    ]) {
      expect(() => splitSpaceDataPath(path)).toThrow(/not allowed/);
    }
  });
});

describe("structure ops speak the same path language as every listing", () => {
  it("takes a FULL parent path, the root itself included", () => {
    // The caller sends back what a listing handed them. A schema that wanted a
    // root-relative path here would make `Files` and `""` mean the same folder
    // and neither of them look like what the client is holding.
    expect(
      createBodySchema.parse({
        kind: "folder",
        name: "Verträge",
        parent_path: "Files",
      })
    ).toMatchObject({ parent_path: "Files" });
  });

  it("refuses a move that asks for nothing", () => {
    // "Move it, keeping its parent and its name" is a successful no-op, which
    // is the shape that makes a caller believe something moved.
    expect(moveBodySchema.safeParse({ path: "Files/a.txt" }).success).toBe(
      false
    );
  });

  it("accepts a rename as a move that kept its parent", () => {
    expect(
      moveBodySchema.safeParse({ new_name: "b.txt", path: "Files/a.txt" })
        .success
    ).toBe(true);
  });

  it("keeps a bare name from being a path", () => {
    // The name reaches an adapter that is about to mint a path out of it, so
    // an empty or blank one must not survive the schema.
    expect(
      createBodySchema.safeParse({
        kind: "folder",
        name: "   ",
        parent_path: "Files",
      }).success
    ).toBe(false);
  });
});

describe("capabilities are delivered before the click (P3.1)", () => {
  it("reports what the adapter actually implements", () => {
    // The same information a 405 would have carried, sent early — so the tree
    // hides an action instead of offering one that fails.
    const full: SpaceDataAdapter = {
      ...adapter({ moduleId: "files", root: "Files" }),
      createNode: () => Promise.reject(new Error("not used")),
      deleteNode: () => Promise.reject(new Error("not used")),
      moveNode: () => Promise.reject(new Error("not used")),
    };
    const [entry] = resolveVisibleSpaceDataRoots({
      adapters: [full],
      isAutonomous: false,
      mounts: [moduleMount({ key: "files" })],
    });
    expect(entry?.root.capabilities).toEqual({
      canCreate: true,
      canDelete: true,
      canMove: true,
      canWrite: true,
    });
  });

  it("reports a RECORD adapter as unable to create or delete", () => {
    // Contacts leaves both absent on purpose: "new contact" must never look
    // like `touch`. The tree must show that rather than discover it.
    const [entry] = resolveVisibleSpaceDataRoots({
      adapters: [contacts],
      isAutonomous: false,
      mounts: [moduleMount({ key: "contacts" })],
    });
    expect(entry?.root.capabilities).toEqual({
      canCreate: false,
      canDelete: false,
      canMove: false,
      canWrite: true,
    });
  });
});
