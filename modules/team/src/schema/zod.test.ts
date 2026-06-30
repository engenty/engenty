import { describe, expect, it } from "vitest";
import {
  teamMemberCreateInputSchema,
  teamMemberInputSchema,
  teamMemberSchema,
  teamMembersListQuerySchema,
  teamMemberUpdateSchema,
} from "./zod.js";

describe("team schema", () => {
  it("validates team member input", () => {
    const valid = teamMemberInputSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      user_id: null,
      initials: null,
      phone: null,
      position: null,
      department: null,
      location: null,
      profile_image_storage_key: null,
    });
    expect(valid.success).toBe(true);

    const missingName = teamMemberInputSchema.safeParse({
      position: "Engineer",
    });
    expect(missingName.success).toBe(false);

    const legacyFullName = teamMemberCreateInputSchema.safeParse({
      full_name: "Jane Doe",
    });
    expect(legacyFullName.success).toBe(true);
  });

  it("accepts partial update", () => {
    const parsed = teamMemberUpdateSchema.safeParse({
      full_name: "Jane Smith",
      position: "Senior Engineer",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts taxonomy term clears on update", () => {
    const parsed = teamMemberUpdateSchema.safeParse({
      role_term_id: "",
      location_term_id: "01934567-0000-7000-8000-000000000002",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts list filters by term id", () => {
    const parsed = teamMembersListQuerySchema.safeParse({
      role_term_id: "01934567-0000-7000-8000-000000000001",
      location_term_id: "01934567-0000-7000-8000-000000000002",
    });
    expect(parsed.success).toBe(true);
  });

  it("validates list query params", () => {
    const valid = teamMembersListQuerySchema.safeParse({
      page: 1,
      pageSize: 25,
      sortBy: "full_name",
      sortOrder: "asc",
      search: "Jane",
    });
    expect(valid.success).toBe(true);

    const empty = teamMembersListQuerySchema.safeParse({});
    expect(empty.success).toBe(true);

    const maxPageSize = teamMembersListQuerySchema.safeParse({
      pageSize: 1000,
    });
    expect(maxPageSize.success).toBe(true);

    const overMax = teamMembersListQuerySchema.safeParse({ pageSize: 1001 });
    expect(overMax.success).toBe(false);
  });

  it("accepts org hierarchy fields on member schema", () => {
    const parsed = teamMemberSchema.safeParse({
      id: "p1",
      tenant_id: "t1",
      scope_id: "s1",
      user_id: null,
      member_type: "internal",
      full_name: "Jane",
      name_prefix: null,
      first_name: "Jane",
      middle_name: null,
      last_name: null,
      name_suffix: null,
      phonetic_name: null,
      birth_name: null,
      full_name_override: null,
      initials: null,
      phone: null,
      email: null,
      position: null,
      department: null,
      location: null,
      profile_image_storage_key: null,
      import_id: null,
      last_imported_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      org_node_id: "n1",
      reports_to_id: "n0",
      reports_to_display_name: "CEO",
    });
    expect(parsed.success).toBe(true);
  });
});
