import { describe, expect, it } from "vitest";
import type { NavigationSection } from "../types/shell";
import {
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
        "/settings/ai-usage",
        "/settings/roles",
        "/settings/development",
        "/settings/features",
        "/settings/search-index",
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
            id: "user_management_menu",
            label: "Users",
            pluginId: "user-management",
            section: "admin" as const,
            to: "/admin/users",
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
      expect(memberTopLevel).not.toContain("/admin/users");
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

      const adminTargets = buildNavigationSections(contributions, {
        isTenantAdmin: true,
      })
        .flatMap((section) => section.items)
        .map((item) => item.to);
      expect(adminTargets).toContain("/admin/users");
      expect(adminTargets).toContain("/settings");
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
  });
});
