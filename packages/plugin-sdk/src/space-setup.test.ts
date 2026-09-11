import { describe, expect, it } from "vitest";
import {
  isBaselineSpaceMount,
  missingBaselineMounts,
  missingMountDependencies,
  moduleIdFromRequirement,
  moduleMountDependents,
  moduleMountRequiresFromPlugins,
  SPACE_BASELINE_MOUNTS,
  SPACE_TEMPLATES,
  spaceMountKey,
  spaceTemplateMounts,
} from "./space-setup.js";

describe("missingBaselineMounts", () => {
  it("reports every baseline entry an empty set omits", () => {
    expect(missingBaselineMounts([]).map(spaceMountKey)).toEqual(
      SPACE_BASELINE_MOUNTS.map(spaceMountKey)
    );
  });

  it("reports nothing once the baseline is present", () => {
    expect(missingBaselineMounts([...SPACE_BASELINE_MOUNTS])).toEqual([]);
  });

  it("catches a set that drops exactly one baseline entry", () => {
    // The shape a hand-rolled POST takes: everything the dialog would have sent
    // minus the checkbox it could not have unchecked.
    const desired = SPACE_BASELINE_MOUNTS.filter(
      (mount) => mount.resourceKey !== "engenty.copilot"
    );
    expect(missingBaselineMounts(desired).map(spaceMountKey)).toEqual([
      "agent:engenty.copilot",
    ]);
  });

  it("does not accept a same-key mount of a different kind as the baseline", () => {
    // `module:engenty.copilot` is not `agent:engenty.copilot`; identity is the
    // pair, matching the table's primary key.
    const desired = SPACE_BASELINE_MOUNTS.map((mount) => ({
      resourceKey: mount.resourceKey,
      resourceType: "skill" as const,
    }));
    expect(missingBaselineMounts(desired)).toHaveLength(
      SPACE_BASELINE_MOUNTS.length
    );
  });
});

describe("isBaselineSpaceMount", () => {
  it("recognises the baseline and nothing else", () => {
    expect(
      isBaselineSpaceMount({
        resourceKey: "engenty.copilot",
        resourceType: "agent",
      })
    ).toBe(true);
    expect(
      isBaselineSpaceMount({ resourceKey: "offers", resourceType: "module" })
    ).toBe(false);
    // Planning is a choice, not a mandate.
    expect(
      isBaselineSpaceMount({ resourceKey: "tasks", resourceType: "module" })
    ).toBe(false);
  });
});

describe("SPACE_TEMPLATES", () => {
  it("every template yields a space that can run a chat turn", () => {
    // Template recommendations still expand to a valid full set for API
    // consumers. The wizard starts from baseline plus featured modules.
    for (const template of SPACE_TEMPLATES) {
      expect(
        missingBaselineMounts(spaceTemplateMounts(template)),
        `${template.id} is missing baseline mounts`
      ).toEqual([]);
    }
  });

  it("has unique ids and no duplicate mounts within a template", () => {
    expect(new Set(SPACE_TEMPLATES.map((t) => t.id)).size).toBe(
      SPACE_TEMPLATES.length
    );
    for (const template of SPACE_TEMPLATES) {
      const keys = spaceTemplateMounts(template).map(spaceMountKey);
      expect(new Set(keys).size, `${template.id} repeats a mount`).toBe(
        keys.length
      );
    }
  });

  it("declares agent_access on every module mount it adds", () => {
    // A module mount with no agent_access is rejected by the database CHECK, so
    // a template that omitted it would fail only at apply time.
    for (const template of SPACE_TEMPLATES) {
      for (const mount of template.mounts) {
        if (mount.resourceType !== "module") {
          continue;
        }
        expect(
          mount.agentAccess,
          `${template.id}/${mount.resourceKey}`
        ).toBeDefined();
        // And says nothing about `recordScope`: no reader consults it, and a
        // template that invented one would be deciding on behalf of a feature
        // that does not exist yet.
        expect(
          mount.recordScope,
          `${template.id}/${mount.resourceKey}`
        ).toBeUndefined();
      }
    }
  });

  it("keeps the featured recommendation set small and inside the template", () => {
    for (const template of SPACE_TEMPLATES) {
      const mountKeys = new Set(template.mounts.map(spaceMountKey));
      expect(
        template.featuredMountKeys.length,
        `${template.id} overloads its featured list`
      ).toBeLessThanOrEqual(3);
      for (const key of template.featuredMountKeys) {
        expect(
          mountKeys.has(key),
          `${template.id} features unknown ${key}`
        ).toBe(true);
      }
    }
  });

  it("does not feature a baseline mount — those are already in every space", () => {
    const baselineKeys = new Set(SPACE_BASELINE_MOUNTS.map(spaceMountKey));
    for (const template of SPACE_TEMPLATES) {
      for (const key of template.featuredMountKeys) {
        expect(
          baselineKeys.has(key),
          `${template.id} features baseline ${key}`
        ).toBe(false);
      }
    }
  });

  it("does not feature agents — those follow the modules they belong to", () => {
    for (const template of SPACE_TEMPLATES) {
      for (const key of template.featuredMountKeys) {
        expect(
          key.startsWith("module:"),
          `${template.id} features ${key}`
        ).toBe(true);
      }
    }
  });

  it("includes a blank starting point that adds nothing beyond the baseline", () => {
    const blank = SPACE_TEMPLATES.find((template) => template.id === "blank");
    expect(blank).toBeDefined();
    expect(blank?.featuredMountKeys).toEqual([]);
    expect(blank?.mounts).toEqual([]);
    expect(spaceTemplateMounts(blank!).map(spaceMountKey)).toEqual(
      SPACE_BASELINE_MOUNTS.map(spaceMountKey)
    );
  });

  it("never grants a connection implicitly", () => {
    // Templates preselect apps. A connector reaches a third-party
    // account, so mounting one is a decision someone makes on purpose — not
    // something a starting point does on their behalf.
    for (const template of SPACE_TEMPLATES) {
      expect(
        template.mounts.filter((mount) => mount.resourceType === "connection"),
        `${template.id} preselects a connector`
      ).toEqual([]);
    }
  });
});

describe("spaceTemplateMounts", () => {
  it("lets a template override a baseline entry rather than duplicating it", () => {
    const merged = spaceTemplateMounts({
      description: "",
      featuredMountKeys: [],
      id: "probe",
      mounts: [
        {
          agentAccess: "write",
          recordScope: "all",
          resourceKey: "engenty-copilot",
          resourceType: "module",
        },
      ],
      name: "Probe",
    });
    const copilot = merged.filter(
      (mount) => spaceMountKey(mount) === "module:engenty-copilot"
    );
    expect(copilot).toHaveLength(1);
    expect(copilot[0]?.agentAccess).toBe("write");
  });
});

describe("module mount dependencies", () => {
  const plugins = [
    { id: "tasks", kind: "module", requires: [] },
    { id: "projects", kind: "module", requires: ["module.tasks"] },
    {
      id: "time-tracking",
      kind: "module",
      requires: ["module.projects", "module.tasks", "service.clock"],
    },
    { id: "some-package", kind: "package", requires: ["module.tasks"] },
  ];
  const requires = moduleMountRequiresFromPlugins(plugins);
  const mount = (resourceKey: string) => ({
    resourceKey,
    resourceType: "module" as const,
  });

  it("reads only `module.<id>` requirements, and only off modules", () => {
    expect(moduleIdFromRequirement("module.tasks")).toBe("tasks");
    expect(moduleIdFromRequirement("module.tasks.read")).toBeNull();
    expect(moduleIdFromRequirement("service.clock")).toBeNull();
    expect([...requires.keys()].sort()).toEqual(["projects", "time-tracking"]);
    expect(requires.get("time-tracking")).toEqual(["projects", "tasks"]);
  });

  it("names the pair that is missing, one per link", () => {
    expect(missingMountDependencies([mount("projects")], requires)).toEqual([
      { moduleId: "projects", requires: "tasks" },
    ]);
    expect(
      missingMountDependencies([mount("time-tracking")], requires)
    ).toEqual([
      { moduleId: "time-tracking", requires: "projects" },
      { moduleId: "time-tracking", requires: "tasks" },
    ]);
    expect(
      missingMountDependencies(
        [mount("projects"), mount("tasks"), mount("offers")],
        requires
      )
    ).toEqual([]);
  });

  it("finds what removing a module would break", () => {
    const mounted = [mount("tasks"), mount("projects"), mount("offers")];
    expect(moduleMountDependents("tasks", mounted, requires)).toEqual([
      "projects",
    ]);
    expect(moduleMountDependents("offers", mounted, requires)).toEqual([]);
  });
});
