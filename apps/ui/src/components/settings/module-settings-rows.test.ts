import { describe, expect, it } from "vitest";
import {
  buildModuleSettingsRows,
  filterModuleRows,
  isNonModuleSettingsPath,
  isSettingsCatalogPlugin,
  type ModulePluginMeta,
  type SettingsItemInput,
} from "./module-settings-rows";

function Icon() {
  return null;
}

function plugin(
  over: Partial<ModulePluginMeta> & Pick<ModulePluginMeta, "id">
): ModulePluginMeta {
  return {
    enabled: true,
    kind: "module",
    mandatory: false,
    name: over.id,
    sourceType: "module",
    ...over,
  };
}

function item(
  over: Partial<SettingsItemInput> &
    Pick<SettingsItemInput, "id" | "pluginId" | "to">
): SettingsItemInput {
  return {
    label: over.pluginId,
    ...over,
  };
}

describe("isNonModuleSettingsPath", () => {
  it("excludes core settings and connections (including legacy paths)", () => {
    expect(isNonModuleSettingsPath("/settings/profile")).toBe(true);
    expect(isNonModuleSettingsPath("/setup/ai")).toBe(true);
    expect(isNonModuleSettingsPath("/setup/connections")).toBe(true);
    expect(isNonModuleSettingsPath("/setup/connections/google")).toBe(true);
    expect(isNonModuleSettingsPath("/settings/contacts")).toBe(false);
    expect(isNonModuleSettingsPath("/mdl/projects/settings")).toBe(false);
  });
});

describe("isSettingsCatalogPlugin", () => {
  it("includes workspace modules and mandatory host plugins", () => {
    expect(
      isSettingsCatalogPlugin(plugin({ id: "files", enabled: false }))
    ).toBe(true);
    expect(
      isSettingsCatalogPlugin(
        plugin({
          id: "tenant-settings",
          kind: "package",
          mandatory: true,
          sourceType: "package",
        })
      )
    ).toBe(true);
  });

  it("excludes connections and connection providers", () => {
    expect(isSettingsCatalogPlugin(plugin({ id: "connections" }))).toBe(false);
    expect(isSettingsCatalogPlugin(plugin({ id: "connections-google" }))).toBe(
      false
    );
    expect(
      isSettingsCatalogPlugin(
        plugin({
          id: "s3",
          rootDir: "modules/connections/providers/s3",
        })
      )
    ).toBe(false);
  });

  it("excludes non-mandatory packages", () => {
    expect(
      isSettingsCatalogPlugin(
        plugin({ id: "ai-ui", kind: "package", sourceType: "package" })
      )
    ).toBe(false);
  });
});

describe("filterModuleRows", () => {
  const rows = [
    {
      category: "work" as const,
      enabled: true,
      icon: Icon,
      id: "contacts",
      label: "Contacts",
      mandatory: false,
      order: 1,
      pluginId: "contacts",
      to: "/settings/contacts",
    },
    {
      category: "work" as const,
      enabled: false,
      icon: Icon,
      id: "files",
      label: "Files",
      mandatory: false,
      order: 2,
      pluginId: "files",
    },
    {
      category: "engenty" as const,
      enabled: true,
      icon: Icon,
      id: "copilot",
      label: "Copilot",
      mandatory: true,
      order: 3,
      pluginId: "engenty-copilot",
    },
  ];

  it("active shows enabled non-mandatory modules only", () => {
    expect(filterModuleRows(rows, "active").map((row) => row.id)).toEqual([
      "contacts",
    ]);
  });

  it("all includes disabled and mandatory", () => {
    expect(filterModuleRows(rows, "all").map((row) => row.id)).toEqual([
      "contacts",
      "files",
      "copilot",
    ]);
  });
});

describe("buildModuleSettingsRows", () => {
  it("keeps settings rows and synthesizes disabled + mandatory plugins", () => {
    const rows = buildModuleSettingsRows({
      fallbackIcon: Icon,
      isAdmin: true,
      plugins: [
        plugin({
          id: "contacts",
          category: "work",
          description: "People",
        }),
        plugin({ id: "files", enabled: false, name: "Files" }),
        plugin({
          id: "engenty-copilot",
          mandatory: true,
          name: "Copilot",
        }),
        plugin({ id: "connections" }),
        plugin({ id: "connections-google" }),
      ],
      resolveIcon: () => Icon,
      settingsItems: [
        item({
          id: "contacts_settings",
          pluginId: "contacts",
          to: "/settings/contacts",
          category: "work",
          label: "Contacts",
        }),
        item({
          id: "profile",
          pluginId: "user-management-ui",
          to: "/settings/profile",
          label: "Profile",
        }),
      ],
    });

    expect(rows.map((row) => row.pluginId)).toEqual([
      "contacts",
      "files",
      "engenty-copilot",
    ]);
    expect(rows[0]?.to).toBe("/settings/contacts");
    expect(rows[1]?.to).toBeUndefined();
    expect(rows[1]?.enabled).toBe(false);
    expect(rows[2]?.mandatory).toBe(true);
  });

  it("does not synthesize catalog rows for members", () => {
    const rows = buildModuleSettingsRows({
      fallbackIcon: Icon,
      isAdmin: false,
      plugins: [plugin({ id: "files", enabled: false })],
      resolveIcon: () => Icon,
      settingsItems: [
        item({
          id: "copilot-memory",
          pluginId: "engenty-copilot",
          to: "/mdl/engenty-copilot/memory",
          label: "Memory",
          requiresAdmin: false,
        }),
        item({
          id: "projects",
          pluginId: "projects",
          to: "/settings/projects",
          label: "Projects",
        }),
      ],
    });

    expect(rows.map((row) => row.pluginId)).toEqual(["engenty-copilot"]);
  });
});
