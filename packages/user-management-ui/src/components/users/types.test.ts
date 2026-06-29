import { describe, expect, it } from "vitest";
import {
  applyUserFilters,
  createDefaultUserColumnOrder,
  createDefaultUserColumnVisibility,
  type UserFilters,
} from "./types.js";

const users = [
  {
    id: "u1",
    display_name: "John Dow",
    role: "member",
    email: "john@example.com",
    phone: null,
    initials: null,
  },
  {
    id: "u2",
    display_name: "Hans Dampf",
    role: "admin",
    email: "hans@example.com",
    phone: null,
    initials: null,
  },
] as const;

describe("team table filter helpers", () => {
  it("keeps default column controls stable", () => {
    expect(createDefaultUserColumnVisibility().contact).toBe(true);
    expect(createDefaultUserColumnOrder()).toContain("accessLevel");
  });

  it("filters by role and search", () => {
    const roleFilter: UserFilters = {
      searchQuery: "",
      roleFilter: "admin",
    };
    expect(applyUserFilters([...users], roleFilter)).toHaveLength(1);

    const searchFilter: UserFilters = {
      searchQuery: "john@example.com",
      roleFilter: "all",
    };
    expect(applyUserFilters([...users], searchFilter)[0]?.id).toBe("u1");
  });
});
