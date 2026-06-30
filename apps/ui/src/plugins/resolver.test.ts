import type {
  PluginSourceInfo,
  UiPluginRegistrar,
} from "@engenty/ui-plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { UiPluginCatalogEntry } from "./catalog";
import { resolveUiPlugins } from "./resolver";
import { UiPluginRuntimeLoadError } from "./runtime-ui-loader";

function createCatalogEntry(
  id: string,
  registerUiPlugin: UiPluginRegistrar,
  sourceInfo?: PluginSourceInfo
): UiPluginCatalogEntry {
  return { id, loadUiPlugin: async () => registerUiPlugin, sourceInfo };
}

const contactsSourceInfo: PluginSourceInfo = {
  pluginId: "contacts",
  packageName: "@engenty/contacts",
  version: "0.0.1",
  sourceType: "module",
  rootDir: "modules/contacts",
  source: "@engenty/contacts/ui/plugin",
  manifestPath: "modules/contacts/engenty.plugin.json",
  manifestId: "contacts",
  registrationKind: "ui.plugin",
};

const invoicesSourceInfo: PluginSourceInfo = {
  pluginId: "invoices",
  packageName: "@engenty/invoices",
  version: "0.0.1",
  sourceType: "module",
  rootDir: "modules/invoices",
  source: "@engenty/invoices/ui/plugin",
  manifestPath: "modules/invoices/engenty.plugin.json",
  manifestId: "invoices",
  registrationKind: "ui.plugin",
};

describe("resolveUiPlugins", () => {
  it("skips UI registration for disabled plugins", async () => {
    const Page = () => null;
    const catalog = [
      createCatalogEntry("enabled-plugin", (engenty) => {
        engenty.UI.registerRoute({
          id: "enabled_route",
          path: "/enabled",
          component: Page,
        });
      }),
      createCatalogEntry("disabled-plugin", (engenty) => {
        engenty.UI.registerRoute({
          id: "disabled_route",
          path: "/disabled",
          component: Page,
        });
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "enabled-plugin", enabled: true, loaded: true },
        { id: "disabled-plugin", enabled: false, loaded: true },
      ],
    });

    expect(result.contributions.routes).toHaveLength(1);
    expect(result.contributions.routes[0]?.path).toBe("/enabled");
  });

  it("loads UI for enabled plugins even when the server plugin is not loaded", async () => {
    const Page = () => null;
    const catalog = [
      createCatalogEntry("kb", (engenty) => {
        engenty.UI.registerRoute({
          id: "kb_route",
          path: "/mdl/knowledge-base",
          component: Page,
        });
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [{ id: "kb", enabled: true, loaded: false }],
    });

    expect(result.contributions.routes).toHaveLength(1);
    expect(result.contributions.routes[0]?.path).toBe("/mdl/knowledge-base");
  });

  it("skips UI contributions when tenant effective state is blocked", async () => {
    const Page = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("invoices", (engenty) => {
          engenty.UI.registerRoute({
            id: "invoices_route",
            path: "/mdl/invoices",
            component: Page,
          });
        }),
      ],
      plugins: [
        {
          id: "invoices",
          enabled: true,
          loaded: true,
          effectiveState: {
            allowed: false,
            blockedReasons: ["dependency_disabled"],
            capabilityAvailable: true,
            dependencySatisfied: false,
            globallyEnabled: true,
            loaded: true,
            state: "tenant_enabled",
            tenantEnabled: true,
          },
        },
      ],
    });

    expect(result.contributions.routes).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.effective_state_blocked",
        pluginId: "invoices",
      })
    );
  });

  it("attaches catalog provenance to resolved UI contributions", async () => {
    const Page = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry(
          "contacts",
          (engenty) => {
            engenty.UI.registerRoute({
              id: "contacts_route",
              path: "/mdl/contacts",
              component: Page,
            });
          },
          contactsSourceInfo
        ),
      ],
      plugins: [{ id: "contacts", enabled: true, loaded: true }],
    });

    expect(result.contributions.routes[0]?.sourceInfo).toEqual({
      ...contactsSourceInfo,
      registrationKind: "ui.route",
    });
  });

  it("stamps resolved UI contributions with the active plugin generation", async () => {
    const Page = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry(
          "contacts",
          (engenty) => {
            engenty.UI.registerRoute({
              id: "contacts_route",
              path: "/mdl/contacts",
              component: Page,
            });
          },
          contactsSourceInfo
        ),
      ],
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 3 },
      ],
    });

    expect(result.contributions.routes[0]?.sourceInfo).toMatchObject({
      generationId: 3,
      pluginId: "contacts",
      registrationKind: "ui.route",
    });
  });

  it("removes filter-injected UI contributions from a stale plugin generation", async () => {
    const Page = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry(
          "contacts",
          (engenty) => {
            engenty.UI.registerRoute({
              id: "contacts_current",
              path: "/mdl/contacts",
              component: Page,
            });
            engenty.UI.on("ui.routes", (routes) => [
              ...routes,
              {
                id: "contacts_stale",
                path: "/mdl/contacts/stale",
                component: Page,
                pluginId: "contacts",
                sourceInfo: {
                  ...contactsSourceInfo,
                  generationId: 2,
                  registrationKind: "ui.route",
                },
              },
            ]);
          },
          contactsSourceInfo
        ),
      ],
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 3 },
      ],
    });

    expect(result.contributions.routes.map((route) => route.id)).toEqual([
      "contacts_current",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.stale_contribution_removed",
        pluginId: "contacts",
        sourceInfo: expect.objectContaining({
          generationId: 2,
          registrationKind: "ui.route",
        }),
      })
    );
  });

  it("applies filter handlers in registration order", async () => {
    const Page = () => null;
    const catalog = [
      createCatalogEntry("a", (engenty) => {
        engenty.UI.registerRoute({
          id: "a_route",
          path: "/mdl/a",
          component: Page,
        });
        engenty.UI.on("ui.routes", (routes) =>
          routes.filter((route) => route.path !== "/mdl/a")
        );
      }),
      createCatalogEntry("b", (engenty) => {
        engenty.UI.registerRoute({
          id: "b_route",
          path: "/mdl/b",
          component: Page,
        });
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "a", enabled: true, loaded: true },
        { id: "b", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.routes.map((route) => route.path)).toEqual([
      "/mdl/b",
    ]);
  });

  it("emits warnings for duplicate ids and paths", async () => {
    const Page = () => null;
    const catalog = [
      createCatalogEntry("a", (engenty) => {
        engenty.UI.registerRoute({
          id: "shared_id",
          path: "/mdl/first",
          component: Page,
        });
      }),
      createCatalogEntry("b", (engenty) => {
        engenty.UI.registerRoute({
          id: "shared_id",
          path: "/mdl/first",
          component: Page,
        });
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "a", enabled: true, loaded: true },
        { id: "b", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.routes).toHaveLength(1);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate route id")
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate route path")
      )
    ).toBe(false);
  });

  it("keeps only one shell copilot app contribution", async () => {
    const catalog = [
      createCatalogEntry("engenty-copilot", (engenty) => {
        engenty.UI.registerCopilotApp({
          id: "engenty_copilot_app",
          label: "Engenty Copilot",
          to: "/mdl/engenty-copilot/chat/new",
        });
      }),
      createCatalogEntry("other-ai", (engenty) => {
        engenty.UI.registerCopilotApp({
          id: "other_ai_app",
          label: "Aardvark AI",
          to: "/mdl/other-ai/chat/new",
        });
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "engenty-copilot", enabled: true, loaded: true },
        { id: "other-ai", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.copilotApps.map((item) => item.id)).toEqual([
      "engenty_copilot_app",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.registration.multiple_copilot_apps",
        pluginId: "other-ai",
      })
    );
  });

  it("adds stable diagnostic codes, remediation, and source info", async () => {
    const Page = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry(
          "contacts",
          (engenty) => {
            engenty.UI.registerRoute({
              id: "shared_id",
              path: "/mdl/contacts",
              component: Page,
            });
          },
          contactsSourceInfo
        ),
        createCatalogEntry(
          "invoices",
          (engenty) => {
            engenty.UI.registerRoute({
              id: "shared_id",
              path: "/mdl/invoices",
              component: Page,
            });
          },
          invoicesSourceInfo
        ),
      ],
      plugins: [
        { id: "contacts", enabled: true, loaded: true },
        { id: "invoices", enabled: true, loaded: true },
      ],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.registration.duplicate_route",
        pluginId: "invoices",
        remediation: expect.stringContaining("unique route id"),
        sourceInfo: {
          ...invoicesSourceInfo,
          registrationKind: "ui.route",
        },
      })
    );
  });

  it("supports cross-plugin methods via engenty.plugins", async () => {
    const Page = () => null;
    const catalog = [
      createCatalogEntry("contacts", (engenty) => {
        engenty.plugins.expose({
          getContacts: () => [{ id: "c1", display_name: "Acme" }],
        });
      }),
      createCatalogEntry("invoices", (engenty) => {
        const hasContacts = engenty.plugins.hasPluginApi("contacts");
        if (hasContacts) {
          const contactsPlugin = engenty.plugins.get<{
            getContacts: () => unknown[];
          }>("contacts");
          const list = contactsPlugin?.getContacts() ?? [];
          if (list.length > 0) {
            engenty.UI.registerRoute({
              id: "invoices_route",
              path: "/mdl/invoices",
              component: Page,
            });
          }
        }
      }),
    ];

    const result = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true },
        { id: "invoices", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.routes.map((route) => route.path)).toEqual([
      "/mdl/invoices",
    ]);
  });

  it("distinguishes enabled plugins from exposed plugin APIs", async () => {
    let enabled = false;
    let hasApi = false;

    await resolveUiPlugins({
      catalog: [
        createCatalogEntry("contacts", () => {
          // Intentionally do not expose methods.
        }),
        createCatalogEntry("projects", (engenty) => {
          enabled = engenty.plugins.isPluginEnabled("contacts");
          hasApi = engenty.plugins.hasPluginApi("contacts");
        }),
      ],
      plugins: [
        { id: "contacts", enabled: true, loaded: true },
        { id: "projects", enabled: true, loaded: true },
      ],
    });

    expect(enabled).toBe(true);
    expect(hasApi).toBe(false);
  });

  it("treats isPluginEnabled as false when the target is enabled but not loaded on the server", async () => {
    let enabled = true;

    await resolveUiPlugins({
      catalog: [
        createCatalogEntry("contacts", () => {
          // No exposed API — simulates a server load failure before expose().
        }),
        createCatalogEntry("projects", (engenty) => {
          enabled = engenty.plugins.isPluginEnabled("contacts");
        }),
      ],
      plugins: [
        { id: "contacts", enabled: true, loaded: false },
        { id: "projects", enabled: true, loaded: true },
      ],
    });

    expect(enabled).toBe(false);
  });

  it("collects dashboard widget contributions", async () => {
    const Widget = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("projects", (engenty) => {
          engenty.UI.registerDashboardWidget({
            id: "projects_summary",
            title: "Projects summary",
            component: Widget,
            category: "Projects",
            defaultSize: { w: 4, h: 3 },
          });
        }),
      ],
      plugins: [{ id: "projects", enabled: true, loaded: true }],
    });

    expect(result.contributions.dashboardWidgets).toHaveLength(1);
    expect(result.contributions.dashboardWidgets[0]?.id).toBe(
      "projects_summary"
    );
  });

  it("warns about duplicate dashboard widget ids", async () => {
    const Widget = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("a", (engenty) => {
          engenty.UI.registerDashboardWidget({
            id: "shared_widget",
            title: "A",
            component: Widget,
          });
        }),
        createCatalogEntry("b", (engenty) => {
          engenty.UI.registerDashboardWidget({
            id: "shared_widget",
            title: "B",
            component: Widget,
          });
        }),
      ],
      plugins: [
        { id: "a", enabled: true, loaded: true },
        { id: "b", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.dashboardWidgets).toHaveLength(1);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate dashboard widget id")
      )
    ).toBe(true);
  });

  it("collects tab contributions for a surface", async () => {
    const TabBody = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("files", (engenty) => {
          engenty.UI.registerTab({
            id: "files",
            surface: "projects.detail",
            component: TabBody,
            labelKey: "files:detail.tab",
          });
        }),
      ],
      plugins: [{ id: "files", enabled: true, loaded: true }],
    });

    expect(result.contributions.tabs).toHaveLength(1);
    expect(result.contributions.tabs[0]?.id).toBe("files");
    expect(result.contributions.tabs[0]?.surface).toBe("projects.detail");
    expect(result.contributions.tabs[0]?.pluginId).toBe("files");
  });

  it("omits tabs contributed by a disabled plugin", async () => {
    const TabBody = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("files", (engenty) => {
          engenty.UI.registerTab({
            id: "files",
            surface: "projects.detail",
            component: TabBody,
          });
        }),
      ],
      // Plugin present in the catalog but not enabled → never registers.
      plugins: [{ id: "files", enabled: false, loaded: true }],
    });

    expect(result.contributions.tabs).toHaveLength(0);
  });

  it("dedupes tabs per (surface, id) but allows the same id on other surfaces", async () => {
    const TabBody = () => null;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("a", (engenty) => {
          engenty.UI.registerTab({
            id: "files",
            surface: "projects.detail",
            component: TabBody,
          });
        }),
        createCatalogEntry("b", (engenty) => {
          engenty.UI.registerTab({
            id: "files",
            surface: "projects.detail",
            component: TabBody,
          });
          engenty.UI.registerTab({
            id: "files",
            surface: "agents.detail",
            component: TabBody,
          });
        }),
      ],
      plugins: [
        { id: "a", enabled: true, loaded: true },
        { id: "b", enabled: true, loaded: true },
      ],
    });

    const surfaces = result.contributions.tabs.map((tab) => tab.surface).sort();
    expect(surfaces).toEqual(["agents.detail", "projects.detail"]);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate tab")
      )
    ).toBe(true);
  });

  it("collects new UI runtime contribution slots and applies filters", async () => {
    const Panel = () => null;
    const prefetch = vi.fn(async () => undefined);
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("contacts", (engenty) => {
          engenty.UI.registerNavigationPrefetch({
            id: "contacts_detail",
            match: (pathname) => {
              const match = pathname.match(/^\/mdl\/contacts\/(?<id>[^/]+)$/);
              return match?.groups ?? null;
            },
            prefetch,
          });
          engenty.UI.registerDevelopmentPanel({
            id: "contacts_search",
            title: "Contacts search",
            component: Panel,
            order: 20,
          });
          engenty.UI.registerI18nNamespace({
            namespace: "contacts",
            loaders: { en: async () => ({ contacts: "Contacts" }) },
          });
          engenty.UI.on("ui.navigationPrefetch", (items) =>
            items.filter((item) => item.id !== "contacts_detail")
          );
        }),
      ],
      plugins: [{ id: "contacts", enabled: true, loaded: true }],
    });

    expect(result.contributions.navigationPrefetch).toHaveLength(0);
    expect(result.contributions.developmentPanels[0]?.id).toBe(
      "contacts_search"
    );
    expect(result.contributions.i18nNamespaces[0]?.namespace).toBe("contacts");
  });

  it("keeps navigation prefetch matchers executable after resolution", async () => {
    const prefetch = vi.fn(async () => undefined);
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("contacts", (engenty) => {
          engenty.UI.registerNavigationPrefetch({
            id: "contacts_detail",
            match: (pathname) => {
              const match = pathname.match(
                /^\/mdl\/contacts\/(?<id>[^/]+)(?:\/edit)?$/
              );
              return match?.groups ?? null;
            },
            prefetch,
          });
        }),
      ],
      plugins: [{ id: "contacts", enabled: true, loaded: true }],
    });

    const contribution = result.contributions.navigationPrefetch[0];
    expect(contribution?.pluginId).toBe("contacts");
    expect(contribution?.match("/mdl/contacts/abc/edit")).toEqual({
      id: "abc",
    });

    await contribution?.prefetch({
      params: { id: "abc" },
      pathname: "/mdl/contacts/abc/edit",
      queryClient: { prefetchQuery: vi.fn(async () => undefined) },
    });
    expect(prefetch).toHaveBeenCalledWith({
      params: { id: "abc" },
      pathname: "/mdl/contacts/abc/edit",
      queryClient: expect.any(Object),
    });
  });

  it("warns about duplicate new contribution ids and invalid route scopes", async () => {
    const Panel = () => null;
    const Page = () => null;
    const prefetch = async () => undefined;
    const result = await resolveUiPlugins({
      catalog: [
        createCatalogEntry("a", (engenty) => {
          engenty.UI.registerRoute({
            id: "a_route",
            path: "/mdl/a",
            component: Page,
          });
          engenty.UI.on("ui.routes", (routes) =>
            routes.map((route) => ({
              ...route,
              scope: "tenant" as "authenticated",
            }))
          );
          engenty.UI.registerNavigationPrefetch({
            id: "shared_prefetch",
            match: () => null,
            prefetch,
          });
          engenty.UI.registerDevelopmentPanel({
            id: "shared_panel",
            title: "A",
            component: Panel,
          });
          engenty.UI.registerI18nNamespace({
            namespace: "shared",
            loaders: { en: async () => ({}) },
          });
        }),
        createCatalogEntry("b", (engenty) => {
          engenty.UI.registerNavigationPrefetch({
            id: "shared_prefetch",
            match: () => null,
            prefetch,
          });
          engenty.UI.registerDevelopmentPanel({
            id: "shared_panel",
            title: "B",
            component: Panel,
          });
          engenty.UI.registerI18nNamespace({
            namespace: "shared",
            loaders: { en: async () => ({}) },
          });
        }),
      ],
      plugins: [
        { id: "a", enabled: true, loaded: true },
        { id: "b", enabled: true, loaded: true },
      ],
    });

    expect(result.contributions.navigationPrefetch).toHaveLength(1);
    expect(result.contributions.developmentPanels).toHaveLength(1);
    expect(result.contributions.i18nNamespaces).toHaveLength(1);
    expect(result.contributions.routes[0]?.scope).toBeUndefined();
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate navigation prefetch id")
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate development panel id")
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("duplicate i18n namespace")
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("invalid route scope")
      )
    ).toBe(true);
  });

  it("adds diagnostics when lazy loader fails", async () => {
    const result = await resolveUiPlugins({
      catalog: [
        {
          id: "broken-plugin",
          loadUiPlugin: async () => {
            throw new Error("import failed");
          },
        },
      ],
      plugins: [{ id: "broken-plugin", enabled: true, loaded: true }],
    });

    expect(
      result.diagnostics.some((entry) => entry.pluginId === "broken-plugin")
    ).toBe(true);
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("import failed")
      )
    ).toBe(true);
  });

  it("preserves runtime loader diagnostic codes", async () => {
    const result = await resolveUiPlugins({
      catalog: [
        {
          id: "contacts",
          loadUiPlugin: async () => {
            throw new UiPluginRuntimeLoadError({
              code: "plugin.ui.stale_generation",
              message: "stale generation",
              pluginId: "contacts",
              remediation: "Refetch plugin contributions.",
            });
          },
          sourceInfo: contactsSourceInfo,
        },
      ],
      plugins: [{ id: "contacts", enabled: true, loaded: true }],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.stale_generation",
        message: "stale generation",
        pluginId: "contacts",
        remediation: "Refetch plugin contributions.",
        sourceInfo: contactsSourceInfo,
      })
    );
  });
});
