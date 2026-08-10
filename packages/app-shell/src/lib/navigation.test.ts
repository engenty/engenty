import { describe, expect, it } from "vitest";
import type { NavigationSection } from "../types/shell";
import {
  applyDockModuleOrder,
  buildNavigationSections,
  getSecondaryNavItems,
  matchesPath,
} from "./navigation";

describe("navigation", () => {
  describe("buildNavigationSections", () => {
    it("renders copilot apps in the primary sidebar top section", () => {
      const sections = buildNavigationSections({
        routes: [],
        adminMenuItems: [
          {
            id: "contacts_menu",
            label: "Contacts",
            pluginId: "contacts",
            section: "modules",
            to: "/mdl/contacts",
          },
        ],
        copilotApps: [
          {
            id: "engenty_copilot_app",
            label: "Engenty Copilot",
            pluginId: "engenty-copilot",
            to: "/mdl/engenty-copilot/chat",
            icon: () => null,
          },
        ],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      });

      expect(sections[0]?.items.map((item) => item.to)).toEqual([
        "/mdl/engenty-copilot/chat",
      ]);
      expect(sections[1]?.items.map((item) => item.to)).toEqual([
        "/mdl/contacts",
      ]);
    });

    it("renders projects and tasks in the primary sidebar top section", () => {
      const sections = buildNavigationSections({
        routes: [],
        adminMenuItems: [
          {
            id: "projects_module_menu",
            label: "Projects",
            pluginId: "projects",
            section: "modules",
            to: "/mdl/projects",
          },
          {
            id: "tasks_module_menu",
            label: "Tasks",
            pluginId: "tasks",
            section: "modules",
            to: "/mdl/tasks",
          },
          {
            id: "contacts_menu",
            label: "Contacts",
            pluginId: "contacts",
            section: "modules",
            to: "/mdl/contacts",
          },
        ],
        copilotApps: [
          {
            id: "engenty_copilot_app",
            label: "Engenty Copilot",
            pluginId: "engenty-copilot",
            to: "/mdl/engenty-copilot/chat",
            icon: () => null,
          },
        ],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      });

      expect(sections[0]?.items.map((item) => item.to)).toEqual([
        "/mdl/engenty-copilot/chat",
        "/mdl/tasks",
        "/mdl/projects",
      ]);
      expect(sections[1]?.items.map((item) => item.to)).toEqual([
        "/mdl/contacts",
      ]);
    });

    it("applies a persisted dock module order over category defaults", () => {
      const sections = buildNavigationSections({
        routes: [],
        adminMenuItems: [
          {
            id: "invoices_module_menu",
            label: "Invoices",
            pluginId: "invoices",
            section: "modules",
            category: "commercial",
            to: "/mdl/invoices",
            order: 20,
          },
          {
            id: "contacts_module_menu",
            label: "Contacts",
            pluginId: "contacts",
            section: "modules",
            category: "work",
            to: "/mdl/contacts",
            order: 10,
          },
          {
            id: "kb_menu",
            label: "Knowledge Base",
            pluginId: "knowledge-base",
            section: "modules",
            category: "knowledge",
            to: "/mdl/knowledge-base",
            order: 10,
          },
        ],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      });

      const reordered = applyDockModuleOrder(sections, [
        "kb_menu",
        "invoices_module_menu",
      ]);
      expect(
        reordered.find((s) => s.id === "modules")?.items.map((i) => i.id)
      ).toEqual(["kb_menu", "invoices_module_menu", "contacts_module_menu"]);
    });

    it("orders modules section by plugin category then within-category order", () => {
      const sections = buildNavigationSections({
        routes: [],
        adminMenuItems: [
          {
            id: "secrets_module_menu",
            label: "Secrets",
            pluginId: "secrets",
            section: "modules",
            category: "platform",
            to: "/mdl/secrets",
            order: 10,
          },
          {
            id: "team_module_menu",
            label: "Team",
            pluginId: "team",
            section: "modules",
            category: "work",
            to: "/mdl/team",
            order: 20,
          },
          {
            id: "invoices_module_menu",
            label: "Invoices",
            pluginId: "invoices",
            section: "modules",
            category: "commercial",
            to: "/mdl/invoices",
            order: 20,
          },
          {
            id: "contacts_module_menu",
            label: "Contacts",
            pluginId: "contacts",
            section: "modules",
            category: "work",
            to: "/mdl/contacts",
            order: 10,
          },
          {
            id: "kb_menu",
            label: "Knowledge Base",
            pluginId: "knowledge-base",
            section: "modules",
            category: "knowledge",
            to: "/mdl/knowledge-base",
            order: 10,
          },
          {
            id: "team_chat_module_menu",
            label: "Team Chat",
            pluginId: "team-chat",
            section: "modules",
            category: "engenty",
            to: "/mdl/team-chat",
            order: 16,
          },
          {
            id: "offers_module_menu",
            label: "Offers",
            pluginId: "offers",
            section: "modules",
            category: "commercial",
            to: "/mdl/offers",
            order: 21,
          },
          {
            id: "tasks_module_menu",
            label: "Plan",
            pluginId: "tasks",
            section: "modules",
            category: "engenty",
            to: "/mdl/tasks",
            order: 11,
          },
        ],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      });

      expect(sections[0]?.items.map((item) => item.to)).toEqual(["/mdl/tasks"]);
      expect(sections[1]?.items.map((item) => item.to)).toEqual([
        "/mdl/team-chat",
        "/mdl/invoices",
        "/mdl/offers",
        "/mdl/contacts",
        "/mdl/team",
        "/mdl/knowledge-base",
        "/mdl/secrets",
      ]);
    });

    it("places Engenty first in the bottom admin rail for admins", () => {
      const EngentyIcon = () => null;
      const contributions = {
        routes: [],
        adminMenuItems: [
          {
            id: "ai_ui_admin_menu",
            label: "Engenty",
            pluginId: "ai-ui",
            section: "admin" as const,
            to: "/admin/engenty",
            icon: EngentyIcon,
          },
          {
            id: "files_admin_menu",
            label: "Vault",
            pluginId: "files",
            section: "admin" as const,
            to: "/admin/files",
          },
          {
            id: "tasks_module_menu",
            label: "Tasks",
            pluginId: "tasks",
            section: "modules" as const,
            to: "/mdl/tasks",
          },
        ],
        copilotApps: [
          {
            id: "engenty_copilot_app",
            label: "Engenty Copilot",
            pluginId: "engenty-copilot",
            to: "/mdl/engenty-copilot/chat",
            icon: () => null,
          },
        ],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      };

      const adminSections = buildNavigationSections(contributions, {
        isTenantAdmin: true,
      });
      expect(adminSections[0]?.items.map((item) => item.to)).toEqual([
        "/mdl/engenty-copilot/chat",
        "/mdl/tasks",
      ]);
      expect(adminSections[0]?.items.map((item) => item.to)).not.toContain(
        "/admin/engenty"
      );

      const adminRail =
        adminSections
          .find((section) => section.label === "navigation.admin")
          ?.items.map((item) => item.to) ?? [];
      expect(adminRail[0]).toBe("/admin/engenty");
      expect(adminRail).toEqual([
        "/admin/engenty",
        "/admin/files",
        "/settings",
      ]);

      const memberTop =
        buildNavigationSections(contributions, {})[0]?.items.map(
          (item) => item.to
        ) ?? [];
      expect(memberTop).not.toContain("/admin/engenty");
      const memberAdmin =
        buildNavigationSections(contributions, {})
          .find((section) => section.label === "navigation.admin")
          ?.items.map((item) => item.to) ?? [];
      expect(memberAdmin).not.toContain("/admin/engenty");
    });

    it("shows Setup admin nav for superadmins only", () => {
      const contributions = {
        routes: [],
        adminMenuItems: [],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      };
      const adminItems = (
        sections: ReturnType<typeof buildNavigationSections>
      ) =>
        sections
          .find((section) => section.label === "navigation.admin")
          ?.items.map((item) => item.to) ?? [];

      expect(
        adminItems(
          buildNavigationSections(contributions, { isSuperAdmin: true })
        )
      ).toContain("/setup");
      expect(
        adminItems(
          buildNavigationSections(contributions, { isTenantAdmin: true })
        )
      ).not.toContain("/setup");
    });

    it("hides developer settings links unless developer mode is enabled", () => {
      const contributions = {
        routes: [],
        adminMenuItems: [],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      };
      const settingsChildren = (
        sections: ReturnType<typeof buildNavigationSections>
      ) =>
        sections
          .flatMap((section) => section.items)
          .find((item) => item.to === "/settings")?.children ?? [];

      const hidden = settingsChildren(
        buildNavigationSections(contributions, {
          developerModeEnabled: false,
          isSuperAdmin: true,
        })
      ).map((item) => item.to);

      expect(hidden).not.toContain("/settings/development");
      expect(hidden).not.toContain("/settings/features");
      expect(hidden).not.toContain("/settings/search-index");

      const visible = settingsChildren(
        buildNavigationSections(contributions, {
          developerModeEnabled: true,
          isSuperAdmin: true,
        })
      ).map((item) => item.to);

      expect(visible).toEqual([
        "/settings/appearance",
        "/settings/ai",
        "/settings/integration-keys",
        "/settings/development",
        "/settings/features",
        "/settings/search-index",
      ]);
    });

    it("promotes Connections into the core settings block after integration keys", () => {
      const ConnectionsIcon = () => null;
      const InvoicesIcon = () => null;
      const settingsChildren = (
        sections: ReturnType<typeof buildNavigationSections>
      ) =>
        sections
          .flatMap((section) => section.items)
          .find((item) => item.to === "/settings")?.children ?? [];

      const contributions = {
        routes: [],
        adminMenuItems: [],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [
          {
            id: "invoices_settings_menu",
            label: "Invoices",
            pluginId: "invoices",
            to: "/mdl/invoices/settings",
            category: "commercial" as const,
            icon: InvoicesIcon,
          },
          {
            id: "connections_settings_menu",
            label: "Connections",
            pluginId: "connections",
            to: "/settings/connections",
            icon: ConnectionsIcon,
            requiresAdmin: false as const,
          },
        ],
      };

      const adminChildren = settingsChildren(
        buildNavigationSections(contributions, { isTenantAdmin: true })
      );

      expect(adminChildren.map((item) => item.to)).toEqual([
        "/settings/appearance",
        "/settings/ai",
        "/settings/integration-keys",
        "/settings/connections",
        "",
        "",
        "/mdl/invoices/settings",
      ]);
      expect(
        adminChildren.find(
          (item) => item.type === "heading" && item.label.includes("commercial")
        )
      ).toBeTruthy();
      expect(
        adminChildren.find((item) => item.to === "/settings/connections")?.icon
      ).toBe(ConnectionsIcon);

      // Members keep Connections (personal surface) without tenant admin rows.
      const memberChildren = settingsChildren(
        buildNavigationSections(contributions, {})
      );
      expect(memberChildren.map((item) => item.to)).toEqual([
        "/settings/connections",
      ]);
    });

    it("inserts category headings for module settings order bands", () => {
      const settingsChildren = (
        sections: ReturnType<typeof buildNavigationSections>
      ) =>
        sections
          .flatMap((section) => section.items)
          .find((item) => item.to === "/settings")?.children ?? [];

      const children = settingsChildren(
        buildNavigationSections(
          {
            routes: [],
            adminMenuItems: [],
            copilotApps: [],
            copilotContributions: [],
            dashboardWidgets: [],
            developmentPanels: [],
            i18nNamespaces: [],
            liveBindings: [],
            navigationPrefetch: [],
            settingsItems: [
              {
                id: "invoices_settings_menu",
                label: "Invoices",
                pluginId: "invoices",
                to: "/mdl/invoices/settings",
                category: "commercial" as const,
                order: 20,
              },
              {
                id: "projects_settings_menu",
                label: "Projects",
                pluginId: "projects",
                to: "/mdl/projects/settings",
                category: "engenty" as const,
                order: 10,
              },
              {
                id: "company_profile_settings_menu",
                label: "Company Profile",
                pluginId: "company-profile",
                to: "/mdl/company-profile/settings",
                category: "commercial" as const,
                order: 10,
              },
            ],
          },
          { isTenantAdmin: true }
        )
      );

      expect(
        children.map((item) => ({
          to: item.to,
          type: item.type,
          label: item.label,
        }))
      ).toEqual([
        {
          to: "/settings/appearance",
          type: undefined,
          label: "settings.appearanceTitle",
        },
        {
          to: "/settings/ai",
          type: undefined,
          label: "settings.aiModels.menuLabel",
        },
        {
          to: "/settings/integration-keys",
          type: undefined,
          label: "settings.integrationKeys.menuLabel",
        },
        { to: "", type: "separator", label: "" },
        {
          to: "",
          type: "heading",
          label: "settings.categories.engenty",
        },
        {
          to: "/mdl/projects/settings",
          type: undefined,
          label: "Projects",
        },
        {
          to: "",
          type: "heading",
          label: "settings.categories.commercial",
        },
        {
          to: "/mdl/company-profile/settings",
          type: undefined,
          label: "Company Profile",
        },
        {
          to: "/mdl/invoices/settings",
          type: undefined,
          label: "Invoices",
        },
      ]);
    });

    it("keeps settings item icons and reuses module admin menu icons", () => {
      const InvoicesIcon = () => null;
      const TasksIcon = () => null;
      const sections = buildNavigationSections(
        {
          routes: [],
          adminMenuItems: [
            {
              id: "invoices_module_menu",
              label: "Invoices",
              pluginId: "invoices",
              section: "modules",
              to: "/mdl/invoices",
              icon: InvoicesIcon,
            },
            {
              id: "tasks_module_menu",
              label: "Tasks",
              pluginId: "tasks",
              section: "modules",
              to: "/mdl/tasks",
              icon: TasksIcon,
            },
          ],
          copilotApps: [],
          copilotContributions: [],
          dashboardWidgets: [],
          developmentPanels: [],
          i18nNamespaces: [],
          liveBindings: [],
          navigationPrefetch: [],
          settingsItems: [
            {
              id: "invoices_settings_menu",
              label: "Invoices",
              pluginId: "invoices",
              to: "/mdl/invoices/settings",
              icon: InvoicesIcon,
            },
            {
              id: "tasks_settings_menu",
              label: "Tasks",
              pluginId: "tasks",
              to: "/mdl/tasks/settings",
            },
          ],
        },
        { isTenantAdmin: true }
      );

      const settingsChildren = sections
        .flatMap((section) => section.items)
        .find((item) => item.to === "/settings")?.children;

      expect(
        settingsChildren?.find((item) => item.to === "/mdl/invoices/settings")
          ?.icon
      ).toBe(InvoicesIcon);
      expect(
        settingsChildren?.find((item) => item.to === "/mdl/tasks/settings")
          ?.icon
      ).toBe(TasksIcon);
    });

    it("hides /admin/* consoles and the tenant General page from members", () => {
      const contributions = {
        routes: [],
        adminMenuItems: [
          {
            id: "files_admin_menu",
            label: "Vault",
            pluginId: "files",
            section: "admin" as const,
            to: "/admin/files",
          },
        ],
        copilotApps: [],
        copilotContributions: [],
        dashboardWidgets: [],
        developmentPanels: [],
        i18nNamespaces: [],
        liveBindings: [],
        navigationPrefetch: [],
        settingsItems: [],
      };

      const memberSections = buildNavigationSections(contributions, {});
      const memberTopLevel = memberSections
        .flatMap((section) => section.items)
        .map((item) => item.to);
      // Members keep the Settings gear (at /settings, so the secondary nav
      // resolves) but no /admin/* console.
      expect(memberTopLevel).not.toContain("/admin/files");
      expect(memberTopLevel).toContain("/settings");
      // Their settings hold no tenant-wide surfaces — not even Appearance
      // (that's the tenant branding editor); AI models/usage and roles are out
      // too. Personal theme/language live in the user menu.
      const memberSettingsChildren =
        memberSections
          .flatMap((section) => section.items)
          .find((item) => item.to === "/settings")
          ?.children?.map((child) => child.to) ?? [];
      expect(memberSettingsChildren).not.toContain("/settings/appearance");
      expect(memberSettingsChildren).not.toContain("/settings/ai");
      expect(memberSettingsChildren).not.toContain("/settings/roles");
      expect(memberTopLevel).not.toContain("/setup");

      const adminTargets = buildNavigationSections(contributions, {
        isTenantAdmin: true,
      })
        .flatMap((section) => section.items)
        .map((item) => item.to);
      expect(adminTargets).toContain("/admin/files");
      expect(adminTargets).toContain("/settings");
      expect(adminTargets).not.toContain("/setup");
      expect(adminTargets).not.toContain("/admin/users");

      const setupChildren =
        buildNavigationSections(contributions, { isSuperAdmin: true })
          .flatMap((section) => section.items)
          .find((item) => item.to === "/setup")
          ?.children?.map((child) => child.to) ?? [];
      expect(setupChildren).toEqual([
        "/setup/platform",
        "/setup/plugins",
        "/setup/roles",
        "/setup/connectors",
      ]);
    });
  });

  describe("matchesPath", () => {
    it("matches exact path", () => {
      expect(matchesPath("/", "", "/")).toBe(true);
      expect(matchesPath("/settings", "", "/settings")).toBe(true);
    });

    it("matches prefix path", () => {
      expect(matchesPath("/settings/ai", "", "/settings")).toBe(true);
    });

    it("does not match unrelated paths", () => {
      expect(matchesPath("/dashboard", "", "/settings")).toBe(false);
    });

    it("does not match empty item paths (separators)", () => {
      expect(matchesPath("/setup/connectors", "", "")).toBe(false);
      expect(matchesPath("/settings/ai", "", "")).toBe(false);
      expect(matchesPath("/", "", "")).toBe(false);
    });
  });

  describe("getSecondaryNavItems", () => {
    const mockSections: NavigationSection[] = [
      {
        items: [{ to: "/", label: "Dashboard", icon: () => null }],
      },
      {
        label: "Modules",
        items: [
          {
            to: "/mdl/contacts",
            label: "Contacts",
            icon: () => null,
            children: [{ to: "/mdl/contacts?status=active", label: "Active" }],
          },
          {
            to: "/mdl/projects",
            label: "Projects",
            icon: () => null,
          },
        ],
      },
      {
        label: "Admin",
        items: [
          {
            to: "/settings",
            label: "Settings",
            icon: () => null,
            children: [
              { to: "/settings/ai", label: "AI" },
              { to: "/settings/appearance", label: "Appearance" },
            ],
          },
          {
            to: "/admin/audit",
            label: "Audit Logs",
            icon: () => null,
            children: [
              { to: "/admin/audit/activity", label: "Activity" },
              { to: "/admin/audit/security", label: "Security" },
            ],
          },
        ],
      },
    ];

    it("returns null for items with no children", () => {
      expect(getSecondaryNavItems("/", "", mockSections)).toBeNull();
      expect(
        getSecondaryNavItems("/mdl/projects", "", mockSections)
      ).toBeNull();
    });

    it("returns children for module with children", () => {
      const items = getSecondaryNavItems("/mdl/contacts", "", mockSections);
      expect(items).toHaveLength(1);
      expect(items?.[0].label).toBe("Active");
    });

    it("returns settings tree for /settings path", () => {
      const items = getSecondaryNavItems("/settings", "", mockSections);
      expect(items).toHaveLength(2);
      expect(items?.[0].label).toBe("AI");
    });

    it("returns settings tree for deeply nested /settings path", () => {
      const items = getSecondaryNavItems(
        "/settings/features",
        "",
        mockSections
      );
      expect(items).toHaveLength(2);
      expect(items?.[0].label).toBe("AI");
    });

    it("returns admin children for admin parent with children", () => {
      const items = getSecondaryNavItems("/admin/audit", "", mockSections);
      expect(items).toHaveLength(2);
      expect(items?.[0].label).toBe("Activity");
    });

    it("returns admin children when on a child route", () => {
      const items = getSecondaryNavItems(
        "/admin/audit/security",
        "",
        mockSections
      );
      expect(items).toHaveLength(2);
      expect(items?.[1].label).toBe("Security");
    });

    it("returns setup children for /setup paths", () => {
      const setupChildren = [
        { to: "/setup/plugins", label: "Plugins" },
        { to: "/setup/roles", label: "Roles & permissions" },
        { to: "/setup/connectors", label: "External connectors" },
      ];
      const sectionsWithSetup = [
        ...mockSections.slice(0, 2),
        {
          label: "Admin",
          items: [
            ...mockSections[2].items,
            {
              to: "/setup",
              label: "Setup",
              children: setupChildren,
            },
          ],
        },
      ];
      expect(getSecondaryNavItems("/setup", "", sectionsWithSetup)).toEqual(
        setupChildren
      );
      expect(
        getSecondaryNavItems("/setup/plugins", "", sectionsWithSetup)
      ).toEqual(setupChildren);
      expect(
        getSecondaryNavItems("/setup/roles", "", sectionsWithSetup)
      ).toEqual(setupChildren);
      expect(
        getSecondaryNavItems("/setup/connectors", "", sectionsWithSetup)
      ).toEqual(setupChildren);
    });

    it("does not let settings separators steal /setup secondary nav", () => {
      const setupChildren = [
        { to: "/setup/plugins", label: "Plugins" },
        { to: "/setup/roles", label: "Roles & permissions" },
        { to: "/setup/connectors", label: "External connectors" },
      ];
      const settingsChildren = [
        { to: "/settings/ai", label: "AI" },
        { to: "/settings/connections", label: "Connections" },
        { to: "", label: "", type: "separator" as const },
        { to: "/settings/secrets", label: "Secrets" },
      ];
      const sections = [
        ...mockSections.slice(0, 2),
        {
          label: "Admin",
          items: [
            {
              to: "/settings",
              label: "Settings",
              icon: () => null,
              children: settingsChildren,
            },
            {
              to: "/setup",
              label: "Setup",
              icon: () => null,
              children: setupChildren,
            },
          ],
        },
      ];
      expect(getSecondaryNavItems("/setup/connectors", "", sections)).toEqual(
        setupChildren
      );
      expect(getSecondaryNavItems("/setup", "", sections)).toEqual(
        setupChildren
      );
      expect(getSecondaryNavItems("/settings/ai", "", sections)).toEqual(
        settingsChildren
      );
    });
  });
});
