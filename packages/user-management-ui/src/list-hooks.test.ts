import { describe, expect, it } from "vitest";
import {
  getUserManagementListColumns,
  getUserManagementListEnrichers,
  registerUserManagementListColumn,
  registerUserManagementListEnricher,
  resetUserManagementListHooks,
} from "./list-hooks.js";

describe("user management list hooks", () => {
  it("registers and resets list columns", () => {
    resetUserManagementListHooks();

    registerUserManagementListColumn({
      key: "teamMember",
      label: "Team Member",
      order: 15,
      renderCell: () => null,
    });

    expect(getUserManagementListColumns().map((column) => column.key)).toEqual([
      "teamMember",
    ]);

    resetUserManagementListHooks();
    expect(getUserManagementListColumns()).toEqual([]);
  });

  it("registers enrichers by id", () => {
    resetUserManagementListHooks();

    registerUserManagementListEnricher({
      id: "team",
      enrich: async () => ({}),
    });

    expect(
      getUserManagementListEnrichers().map((enricher) => enricher.id)
    ).toEqual(["team"]);
  });
});
