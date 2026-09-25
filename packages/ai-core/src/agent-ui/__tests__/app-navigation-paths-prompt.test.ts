import { describe, expect, it } from "vitest";
import { buildAppNavigationPathsPromptSection } from "../app-navigation-paths-prompt.js";
import { SPACE_MODULE_URL_ALIASES } from "../space-module-url.js";

describe("buildAppNavigationPathsPromptSection", () => {
  const text = buildAppNavigationPathsPromptSection();

  it("lists canonical Space path patterns", () => {
    expect(text).toContain("`/s/<space_key>`");
    expect(text).toContain("`/s/<space_key>/<module-segment>/…`");
    expect(text).toContain("`/s/<space_key>/data`");
    expect(text).toContain("`/s/<space_key>/settings`");
  });

  it("lists Space chat and agent desk routes", () => {
    expect(text).toContain("`/s/<space_key>/copilot`");
    expect(text).toContain("`/copilot`");
    expect(text).not.toContain("/copilot/chat");
    expect(text).toContain("`/s/<space_key>/agents`");
    expect(text).toContain("`/s/<space_key>/agents/<agentId>`");
    expect(text).toContain("`/s/<space_key>/agents/new`");
  });

  it("routes workflows through the Space and never links the admin area", () => {
    expect(text).toContain("`/s/<space_key>/workflows/<id>`");
    expect(text).toContain("Never link to `/admin/engenty/…`");
  });

  it("does not treat the module id as the Space URL segment", () => {
    expect(text).toContain("do not assume `moduleId === segment`");
    expect(text).toContain("route mirror");
    expect(SPACE_MODULE_URL_ALIASES["knowledge-base"]).toBe("kb");
    expect(text).toContain("`knowledge-base` is `/s/<space_key>/kb/…`");
    expect(text).toContain("Let `navigate` resolve the real route table");
  });
});
