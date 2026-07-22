import { describe, expect, it } from "vitest";
import { AGENT_UI_DOM_REGION_SELECTORS } from "../agent-ui-dom-regions.js";
import { buildAgentUiPageBrief } from "../agent-ui-page-brief.js";

describe("buildAgentUiPageBrief", () => {
  it("returns only defined reserved keys and default DOM entry points", () => {
    expect(
      buildAgentUiPageBrief({
        page_type: "list",
        page_title: "Inbox — all",
        page_description: "  Email inbox list.  ",
        list_search: "",
        list_filters: { lane: "all" },
        list_total: 3,
        list_preview: [{ id: "t1", label: "Hello" }],
      })
    ).toEqual({
      page_type: "list",
      page_title: "Inbox — all",
      page_description: "Email inbox list.",
      list_filters: { lane: "all" },
      list_total: 3,
      list_preview: [{ id: "t1", label: "Hello" }],
      dom_entry_points: {
        app_bar: AGENT_UI_DOM_REGION_SELECTORS["app-bar"],
        sidebar: AGENT_UI_DOM_REGION_SELECTORS.sidebar,
        topbar: AGENT_UI_DOM_REGION_SELECTORS.topbar,
        main: AGENT_UI_DOM_REGION_SELECTORS.main,
        list: AGENT_UI_DOM_REGION_SELECTORS.list,
      },
    });
  });

  it("omits empty filters/preview and includes detail entry point", () => {
    expect(
      buildAgentUiPageBrief({
        page_type: "detail",
        list_filters: {},
        list_preview: [],
      })
    ).toEqual({
      page_type: "detail",
      dom_entry_points: {
        app_bar: AGENT_UI_DOM_REGION_SELECTORS["app-bar"],
        sidebar: AGENT_UI_DOM_REGION_SELECTORS.sidebar,
        topbar: AGENT_UI_DOM_REGION_SELECTORS.topbar,
        main: AGENT_UI_DOM_REGION_SELECTORS.main,
        detail: AGENT_UI_DOM_REGION_SELECTORS.detail,
      },
    });
  });

  it("merges caller dom_entry_points over defaults", () => {
    const brief = buildAgentUiPageBrief({
      page_type: "list",
      dom_entry_points: {
        list: '[data-testid="custom-list"]',
        custom: "#extra",
      },
    });
    expect(brief.dom_entry_points).toMatchObject({
      main: AGENT_UI_DOM_REGION_SELECTORS.main,
      list: '[data-testid="custom-list"]',
      custom: "#extra",
    });
  });
});
