import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  formatAgentUiStateHarnessInstructions,
  resolveCurrentPageModule,
  resolveCurrentPageSpaceKey,
} from "../agent-prompt-context-from-ui.js";

function makeSnapshot(
  overrides: Partial<AgentUiStateSnapshotV1> = {}
): AgentUiStateSnapshotV1 {
  return {
    observed_at: new Date().toISOString(),
    route: {
      module_id: "tasks",
      pathname: "/mdl/tasks/task-1",
      route_key: "detail",
    },
    sequence: 1,
    shell: { copilot_open: true },
    snapshot_id: "snap-1",
    version: 1,
    ...overrides,
  };
}

describe("resolveCurrentPageModule", () => {
  it("matches /mdl/<module> when selection is absent", () => {
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: {
            module_id: "inbox",
            pathname: "/mdl/inbox",
            route_key: "list",
          },
          selection: undefined,
        })
      )
    ).toBe("inbox");
  });

  it("still matches legacy /module/<module>", () => {
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: {
            module_id: "tasks",
            pathname: "/module/tasks",
            route_key: "list",
          },
          selection: undefined,
        })
      )
    ).toBe("tasks");
  });
});

describe("formatAgentUiStateHarnessInstructions", () => {
  it("includes pathname and page module for copilot host routes", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({
        route: {
          module_id: "engenty-copilot",
          pathname: "/mdl/team/019e6a28-cdbc-79c9-8b96-47688bdabec3",
          route_key: "chat",
        },
        selection: {
          entity_id: "019e6a28-cdbc-79c9-8b96-47688bdabec3",
          entity_type: "team",
        },
      })
    );

    expect(text).toContain(
      "pathname: /mdl/team/019e6a28-cdbc-79c9-8b96-47688bdabec3"
    );
    expect(text).toContain("page_module: team");
    expect(text).toContain("Do not claim you cannot see the current URL");
  });

  it("renders Current page brief keys and remaining page payload", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({
        route: {
          module_id: "inbox",
          pathname: "/mdl/inbox",
          route_key: "list",
        },
        page: {
          page_type: "list",
          page_title: "Inbox — unhandled",
          page_description: "Email inbox list filtered to unhandled.",
          list_search: "invoice",
          list_filters: { lane: "unhandled", account: "conn-1" },
          list_total: 12,
          dom_entry_points: {
            app_bar: '[data-engenty-region="app-bar"]',
            main: '[data-engenty-region="main"]',
            list: '[data-engenty-region="list"]',
          },
          inbox_threads_preview: [
            { id: "t1", subject: "Q4 invoice", from: "ap@acme.com" },
          ],
        },
      })
    );

    expect(text).toContain("Current page:");
    expect(text).toContain("- page_type: list");
    expect(text).toContain("- page_title: Inbox — unhandled");
    expect(text).toContain("- list_search: invoice");
    expect(text).toContain('"lane":"unhandled"');
    expect(text).toContain("- list_total: 12");
    expect(text).toContain("- dom_entry_points:");
    expect(text).toContain("data-engenty-region");
    expect(text).toContain('\\"list\\"');
    expect(text).toContain("- inbox_threads_preview:");
    expect(text).toContain("Q4 invoice");
  });

  it("omits Current page when page is empty", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({ page: {} })
    );
    expect(text).not.toContain("Current page:");
  });

  it("renders described app_context entries (Ch.7)", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({
        app_context: [
          {
            description: "The document the user is editing",
            value: { id: "d1", title: "Q4 plan" },
          },
          { description: "Active filter", value: "open" },
        ],
      })
    );

    expect(text).toContain(
      "What the user is looking at (app-provided context):"
    );
    expect(text).toContain(
      '- The document the user is editing: {"id":"d1","title":"Q4 plan"}'
    );
    // String values render verbatim (no JSON quoting).
    expect(text).toContain("- Active filter: open");
  });

  it("omits the app_context section when there are no entries", () => {
    const text = formatAgentUiStateHarnessInstructions(makeSnapshot());
    expect(text).not.toContain("app-provided context");
  });

  it("renders shared state with the set_state hint (Ch.6)", () => {
    const text = formatAgentUiStateHarnessInstructions(
      makeSnapshot({ shared: { plan: { steps: ["a"] }, filter: "open" } })
    );
    expect(text).toContain("use the `set_state` tool to update a key");
    expect(text).toContain('- plan: {"steps":["a"]}');
    expect(text).toContain('- filter: "open"');
  });

  it("omits the shared-state section when empty", () => {
    expect(
      formatAgentUiStateHarnessInstructions(makeSnapshot({ shared: {} }))
    ).not.toContain("set_state");
  });

  it("includes the canonical navigation section so text runtime receives it", () => {
    const text = formatAgentUiStateHarnessInstructions(makeSnapshot());
    expect(text).toContain("## App navigation paths (canonical)");
    expect(text).toContain("`/s/<space_key>/<module-segment>/…`");
    expect(text).toContain("do not assume `moduleId === segment`");
  });
});

describe("module and space resolution inside a space", () => {
  // PLAN-spaces.md Phase 5a mirrors every module route at `/s/<key>/<module>`,
  // so once the space is the entry point a module page's pathname no longer
  // starts with `/mdl/`. This resolver is what tells the agent which module the
  // user is looking at — anchored on `/mdl/` it resolved NOTHING in a space, so
  // the copilot had no page prompt and no skill hint, and answered "where am
  // I?" by asking the user which page they were on.
  it("resolves the module from a space-mirrored path", () => {
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: {
            module_id: "",
            pathname: "/s/company/engenty-copilot/chat/abc",
            route_key: "chat",
          },
        })
      )
    ).toBe("engenty-copilot");
  });

  it("still resolves the legacy /mdl and /module shapes", () => {
    for (const [pathname, expected] of [
      ["/mdl/tasks/task-1", "tasks"],
      ["/module/offers", "offers"],
    ] as const) {
      expect(
        resolveCurrentPageModule(
          makeSnapshot({
            route: { module_id: "", pathname, route_key: "detail" },
          })
        )
      ).toBe(expected);
    }
  });

  it("reports NO module at the space root", () => {
    // `/s/company` is the Work list, not a module. Returning the space key here
    // would send every module-scoped lookup after a module that does not exist.
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: { module_id: "", pathname: "/s/company", route_key: "work" },
        })
      )
    ).toBeUndefined();
  });

  it("resolves a short space segment back to the module ID", () => {
    // `/s/company/copilot/…` is the URL; `engenty-copilot` is what the skill
    // catalog and the tool contracts are keyed by.
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: {
            module_id: "",
            pathname: "/s/company/copilot/chat/x",
            route_key: "chat",
          },
        })
      )
    ).toBe("engenty-copilot");
  });

  it("still resolves the pre-alias space URL", () => {
    expect(
      resolveCurrentPageModule(
        makeSnapshot({
          route: {
            module_id: "",
            pathname: "/s/company/engenty-copilot/chat/x",
            route_key: "chat",
          },
        })
      )
    ).toBe("engenty-copilot");
  });

  it("reads the space key, and nothing outside /s/", () => {
    expect(
      resolveCurrentPageSpaceKey(
        makeSnapshot({
          route: {
            module_id: "",
            pathname: "/s/marketing/tasks",
            route_key: "list",
          },
        })
      )
    ).toBe("marketing");
    expect(
      resolveCurrentPageSpaceKey(
        makeSnapshot({
          route: { module_id: "", pathname: "/mdl/inbox", route_key: "list" },
        })
      )
    ).toBeUndefined();
  });
});
