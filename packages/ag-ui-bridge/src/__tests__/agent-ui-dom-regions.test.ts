import { describe, expect, it } from "vitest";
import {
  AGENT_UI_DOM_REGION_SELECTORS,
  buildDefaultDomEntryPoints,
  mergeDomEntryPoints,
} from "../agent-ui-dom-regions.js";

describe("buildDefaultDomEntryPoints", () => {
  it("always includes shell regions", () => {
    expect(buildDefaultDomEntryPoints()).toEqual({
      app_bar: AGENT_UI_DOM_REGION_SELECTORS["app-bar"],
      sidebar: AGENT_UI_DOM_REGION_SELECTORS.sidebar,
      topbar: AGENT_UI_DOM_REGION_SELECTORS.topbar,
      main: AGENT_UI_DOM_REGION_SELECTORS.main,
    });
  });

  it("adds list for list pages and detail for detail pages", () => {
    expect(buildDefaultDomEntryPoints("list").list).toBe(
      AGENT_UI_DOM_REGION_SELECTORS.list
    );
    expect(buildDefaultDomEntryPoints("detail").detail).toBe(
      AGENT_UI_DOM_REGION_SELECTORS.detail
    );
  });
});

describe("mergeDomEntryPoints", () => {
  it("overrides and extends defaults", () => {
    const defaults = buildDefaultDomEntryPoints("list");
    expect(
      mergeDomEntryPoints(defaults, {
        list: "#custom",
        extra: ".x",
        blank: "  ",
      })
    ).toMatchObject({
      main: defaults.main,
      list: "#custom",
      extra: ".x",
    });
  });
});
