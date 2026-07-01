import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("./request.js", () => ({
  apiRequest: apiRequestMock,
}));

import {
  getContactsRoleMenuConfig,
  getRolePluralLabel,
  getRoleTitleLabel,
  normalizeRoleSlug,
  setContactsRoleMenuConfig,
} from "./role-menu-settings.js";

describe("role menu settings", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("normalizes role slug input", () => {
    expect(normalizeRoleSlug("  Team Mitglied  ")).toBe("team-mitglied");
    expect(normalizeRoleSlug("Sales/Partner")).toBe("sales-partner");
    expect(normalizeRoleSlug("A!@#B")).toBe("ab");
  });

  it("resolves labels for fixed and custom roles", () => {
    const t = (key: string) => `translated:${key}`;
    expect(getRoleTitleLabel("client", t)).toBe("translated:role.client");
    expect(getRolePluralLabel("partner", t)).toBe("translated:menu.partners");
    expect(getRoleTitleLabel("custom-role", t)).toBe("custom-role");
    expect(getRolePluralLabel("custom-role", t)).toBe("custom-role");
  });

  it("parses legacy and new role fields from tenant settings", async () => {
    apiRequestMock.mockResolvedValue({
      name: "contacts.roles.menu",
      type: "json",
      value: {
        items: [
          {
            role: "client",
            label: "Kunde",
            plural: "Kunden",
            visible: true,
            order: 0,
          },
          {
            slug: "custom-role",
            title: "Custom Role",
            plural: "Custom Roles",
            visible: false,
            order: 1,
          },
        ],
      },
    });

    const result = await getContactsRoleMenuConfig();
    const bySlug = new Map(result.items.map((item) => [item.slug, item]));

    expect(bySlug.get("client")?.title).toBe("Kunde");
    expect(bySlug.get("client")?.plural).toBe("Kunden");
    expect(bySlug.get("custom-role")?.title).toBe("Custom Role");
    expect(bySlug.get("custom-role")?.visible).toBe(false);
    expect(bySlug.has("partner")).toBe(true);
    expect(bySlug.has("supplier")).toBe(true);
    expect(bySlug.has("team")).toBe(true);
  });

  it("saves normalized slug/title/plural and keeps fixed roles", async () => {
    apiRequestMock.mockResolvedValue({});

    await setContactsRoleMenuConfig({
      items: [
        {
          slug: "  Sales Role  ",
          title: " Sales ",
          plural: " Sales Roles ",
          visible: true,
          order: 99,
        },
        {
          slug: "sales-role",
          title: "Duplicate",
          visible: false,
          order: 100,
        },
      ],
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [, init] = apiRequestMock.mock.calls[0] as [string, { body: string }];
    const payload = JSON.parse(init.body) as {
      value_jsonb: {
        items: Array<{ slug: string; title?: string; plural?: string }>;
      };
    };
    const slugs = payload.value_jsonb.items.map((item) => item.slug);

    expect(slugs).toContain("sales-role");
    expect(slugs).toContain("client");
    expect(slugs).toContain("partner");
    expect(slugs).toContain("supplier");
    expect(slugs).toContain("team");
    expect(
      payload.value_jsonb.items.find((item) => item.slug === "sales-role")
        ?.title
    ).toBe("Sales");
    expect(
      payload.value_jsonb.items.find((item) => item.slug === "sales-role")
        ?.plural
    ).toBe("Sales Roles");
  });
});
