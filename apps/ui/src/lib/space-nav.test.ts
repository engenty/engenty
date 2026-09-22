import { describe, expect, it } from "vitest";
import {
  SPACE_DATA_SEGMENT,
  spaceNavLevel,
  spaceSectionFor,
  spaceTabModuleId,
} from "./space-nav";

const PLAN_TAB = { id: "plan", pluginId: "tasks" };

describe("spaceTabModuleId", () => {
  it("defaults to the plugin id", () => {
    expect(spaceTabModuleId({ pluginId: "tasks" })).toBe("tasks");
  });

  it("lets a plugin open a different module id", () => {
    expect(spaceTabModuleId({ moduleId: "tasks", pluginId: "plan-ui" })).toBe(
      "tasks"
    );
  });
});

describe("which section the URL is in", () => {
  it("reads Data from the SEGMENT, because Data is not a module", () => {
    expect(spaceSectionFor({ segment: SPACE_DATA_SEGMENT }, [])).toBe("data");
    expect(spaceSectionFor({ moduleId: undefined, segment: "data" }, [])).toBe(
      "data"
    );
  });

  it("reads a contributed tab from the module it opens", () => {
    expect(
      spaceSectionFor({ moduleId: "tasks", segment: "tasks" }, [PLAN_TAB])
    ).toBe("plan");
  });

  it("falls back to Work when no plugin claimed the module", () => {
    expect(spaceSectionFor({}, [])).toBe("work");
    expect(
      spaceSectionFor({ moduleId: "contacts", segment: "contacts" }, [PLAN_TAB])
    ).toBe("work");
    expect(
      spaceSectionFor(
        { moduleId: "knowledge-base", segment: "knowledge-base" },
        [PLAN_TAB]
      )
    ).toBe("work");
  });

  it("keeps the inbox on Work — it is the dashboard's list, not a tab", () => {
    expect(
      spaceSectionFor({ moduleId: undefined, segment: "notifications" }, [
        PLAN_TAB,
      ])
    ).toBe("work");
  });
});

describe("which level the sidebar shows", () => {
  it("keeps a contributed space tab at the space level — its TAB is the navigation", () => {
    expect(spaceNavLevel("tasks", [PLAN_TAB])).toBe("space");
  });

  it("follows you INTO a module opened from the Work list", () => {
    expect(spaceNavLevel("contacts", [PLAN_TAB])).toBe("module");
    expect(spaceNavLevel("knowledge-base", [PLAN_TAB])).toBe("module");
  });

  it("stays at the space level where no module is open", () => {
    expect(spaceNavLevel(undefined, [PLAN_TAB])).toBe("space");
  });
});
