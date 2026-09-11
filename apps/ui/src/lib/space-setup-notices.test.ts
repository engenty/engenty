import { describe, expect, it } from "vitest";
import { spaceSetupNotices } from "./space-setup-notices";

const names = new Map([["knowledge-base", "Knowledge Base"]]);

describe("spaceSetupNotices", () => {
  it("says nothing about a module that is ready", () => {
    expect(
      spaceSetupNotices(
        [{ module_id: "knowledge-base", needs: [], ready: true }],
        names
      )
    ).toEqual([]);
  });

  it("names a module that still needs a tenant setting", () => {
    expect(
      spaceSetupNotices(
        [{ module_id: "knowledge-base", needs: ["ai_gateway"], ready: false }],
        names
      )
    ).toEqual([
      {
        error: null,
        moduleId: "knowledge-base",
        moduleName: "Knowledge Base",
        needs: ["ai_gateway"],
      },
    ]);
  });

  it("carries a failed setup's error and falls back to the module id", () => {
    expect(
      spaceSetupNotices(
        [{ error: "boom", module_id: "files", needs: [], ready: false }],
        names
      )
    ).toEqual([
      { error: "boom", moduleId: "files", moduleName: "files", needs: [] },
    ]);
  });

  it("is empty when core reported nothing", () => {
    expect(spaceSetupNotices(undefined, names)).toEqual([]);
  });
});
