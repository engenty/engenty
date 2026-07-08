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
        "/settings/ai",
        "/settings/ai-usage",
        "/settings/appearance",
        "/settings/development",
        "/settings/features",
        "/settings/search-index",
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
