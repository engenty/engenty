import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api/client", () => ({
  getPlugins: vi.fn(),
}));

vi.mock("../lib/config", () => ({
  config: {},
}));

vi.mock("@engenty/i18n/ui", () => ({
  getEngentyI18nApi: () => ({
    preloadCoreNamespaces: vi.fn(async () => undefined),
    registerNamespace: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@engenty/ai-ui/plugin", () => ({ default: () => {} }));
vi.mock("@engenty/auth-ui/plugin", () => ({ default: () => {} }));
vi.mock("@engenty/user-management-ui/plugin", () => ({ default: () => {} }));
vi.mock("@engenty/audit-logs/plugin", () => ({ default: () => {} }));
vi.mock("@engenty/company-profile/ui/plugin", () => ({ default: () => {} }));
vi.mock("@engenty/engenty-copilot/ui/plugin", () => ({
  default: (engenty: {
    UI: {
      registerCopilotApp: (item: {
        id: string;
        label: string;
        pluginId?: string;
        to: string;
      }) => void;
      registerRoute: (item: {
        id: string;
        path: string;
        component: () => null;
      }) => void;
    };
  }) => {
    engenty.UI.registerCopilotApp({
      id: "engenty_copilot_app",
      label: "Engenty Copilot",
      to: "/mdl/engenty-copilot/chat/new",
    });
    engenty.UI.registerRoute({
      id: "engenty_copilot_chat",
      path: "/mdl/engenty-copilot/chat/new",
      component: () => null,
    });
  },
}));

import { getPlugins } from "../lib/api/client";
import {
  consumePluginReloadUiRefresh,
  pruneStaleUiPluginContributionsData,
  shouldInvalidateUiPluginCacheEntry,
  type UiPluginContributionsData,
  uiPluginContributionsOptions,
} from "./ui-plugin-contributions-queries";

describe("ui plugin contribution invalidation", () => {
  it("keeps generated copilot routes when the plugin is absent from the plugins API", async () => {
    vi.mocked(getPlugins).mockResolvedValue([]);

    const options = uiPluginContributionsOptions("tenant-1", true);
    const data = await options.queryFn({ signal: undefined } as never);

    expect(data.contributions.routes).toContainEqual(
      expect.objectContaining({
        id: "engenty_copilot_chat",
        path: "/mdl/engenty-copilot/chat/new",
        pluginId: "engenty-copilot",
      })
    );
  });

  it("keeps the Copilot app contribution visible even when tenant state disables the plugin", async () => {
    vi.mocked(getPlugins).mockResolvedValue([
      {
        id: "engenty-copilot",
        enabled: false,
        effectiveState: {
          allowed: false,
          blockedReasons: ["tenant_disabled"],
          capabilityAvailable: true,
          dependencySatisfied: true,
          globallyEnabled: true,
          loaded: true,
          state: "tenant_disabled",
          tenantEnabled: false,
        },
        generationId: 1,
        loaded: true,
        manifestPath: "modules/engenty-copilot/engenty.plugin.json",
        packageName: "@engenty/engenty-copilot",
        rootDir: "modules/engenty-copilot",
        sourceType: "module",
        ui: {
          entry: "@engenty/engenty-copilot/ui/plugin",
          export: "default",
          load: "workspace",
        },
        capabilities: { ui: true },
      },
    ]);

    const options = uiPluginContributionsOptions("tenant-1", true);
    const data = await options.queryFn({ signal: undefined } as never);

    expect(data.contributions.copilotApps).toContainEqual(
      expect.objectContaining({
        id: "engenty_copilot_app",
        pluginId: "engenty-copilot",
        to: "/mdl/engenty-copilot/chat/new",
      })
    );
  });

  it("invalidates queries when a reload response carries a UI refresh marker", async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
    };

    await consumePluginReloadUiRefresh(queryClient, {
      uiRefresh: {
        generationId: 2,
        invalidationRequired: true,
        pluginId: "contacts",
        reason: "ui_contributions_may_have_changed",
      },
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["ui-plugin-contributions"],
    });
  });

  it("removes stale plugin-owned contribution slices before invalidating queries", async () => {
    const Page = () => null;
    const activeData: UiPluginContributionsData = {
      contributions: {
        routes: [
          {
            id: "contacts_route",
            path: "/mdl/contacts",
            component: Page,
            pluginId: "contacts",
          },
          {
            id: "projects_route",
            path: "/mdl/projects",
            component: Page,
            pluginId: "projects",
          },
        ],
        copilotApps: [],
        adminMenuItems: [
          {
            id: "contacts_menu",
            label: "Contacts",
            pluginId: "contacts",
            section: "modules",
            to: "/mdl/contacts",
          },
        ],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [
          {
            loaders: {},
            namespace: "contacts",
            pluginId: "contacts",
          },
        ],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      },
      diagnostics: [],
      pluginGenerations: {
        contacts: 1,
        projects: 1,
      },
    };
    let cachedData: UiPluginContributionsData | undefined = activeData;
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
      setQueriesData: vi.fn((_filters, updater) => {
        cachedData = updater(cachedData);
      }),
    };

    await consumePluginReloadUiRefresh(queryClient, {
      uiRefresh: {
        generationId: 2,
        invalidationRequired: true,
        pluginId: "contacts",
        reason: "ui_contributions_may_have_changed",
      },
    });

    expect(queryClient.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["ui-plugin-contributions"] },
      expect.any(Function)
    );
    expect(cachedData?.contributions.routes.map((route) => route.id)).toEqual([
      "projects_route",
    ]);
    expect(cachedData?.contributions.adminMenuItems).toHaveLength(0);
    expect(cachedData?.contributions.i18nNamespaces).toHaveLength(0);
    expect(cachedData?.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.stale_contributions_removed",
        pluginId: "contacts",
      })
    );
  });

  it("keeps contribution query data when the plugin generation is already current", () => {
    const Page = () => null;
    const activeData: UiPluginContributionsData = {
      contributions: {
        routes: [
          {
            id: "contacts_route",
            path: "/mdl/contacts",
            component: Page,
            pluginId: "contacts",
          },
        ],
        adminMenuItems: [],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      },
      diagnostics: [],
      pluginGenerations: {
        contacts: 2,
      },
    };

    expect(
      pruneStaleUiPluginContributionsData(activeData, {
        generationId: 2,
        pluginId: "contacts",
      })
    ).toBe(activeData);
  });

  it("ignores reload responses without UI contribution refresh markers", async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
    };

    await consumePluginReloadUiRefresh(queryClient, {
      uiRefresh: {
        invalidationRequired: false,
        pluginId: "contacts",
        reason: "ui_contributions_may_have_changed",
      },
    });

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("scopes memory cache invalidation by plugin generation", () => {
    const cacheGenerations = {
      contacts: 1,
      projects: 7,
    };

    expect(
      shouldInvalidateUiPluginCacheEntry(cacheGenerations, {
        generationId: 2,
        pluginId: "contacts",
      })
    ).toBe(true);
    expect(
      shouldInvalidateUiPluginCacheEntry(cacheGenerations, {
        generationId: 7,
        pluginId: "projects",
      })
    ).toBe(false);
    expect(
      shouldInvalidateUiPluginCacheEntry(cacheGenerations, {
        generationId: 3,
        pluginId: "files",
      })
    ).toBe(false);
  });
});
