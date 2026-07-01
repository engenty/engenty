import { describe, expect, it } from "vitest";
import { buildContactsListToolbarLabels } from "./contacts-list-toolbar-labels.js";

describe("buildContactsListToolbarLabels", () => {
  it("builds role options from visible menu items", () => {
    const t = (key: string) => key;
    const labels = buildContactsListToolbarLabels({
      t,
      roleMenuItems: [
        { slug: "client", visible: true, order: 1, title: "Clients" },
        { slug: "partner", visible: false, order: 0 },
      ],
      selectedCount: 2,
      total: 10,
    });
    expect(labels.roleOptions).toEqual([{ value: "client", label: "Clients" }]);
    expect(labels.filterByRole).toBe("filterByRole");
    expect(labels.paginationSummary).toBe("paginationSummary");
  });
});
