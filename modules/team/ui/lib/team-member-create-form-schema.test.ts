import { describe, expect, it } from "vitest";
import { teamMemberCreateFormSchema } from "./team-member-create-form-schema.js";

describe("teamMemberCreateFormSchema", () => {
  const base = {
    name_prefix: "",
    first_name: "Alex",
    middle_name: "",
    last_name: "Example",
    name_suffix: "",
    phonetic_name: "",
    birth_name: "",
    custom_display_name: false,
    full_name_override: "",
    member_type: "internal" as const,
    connect_user_id: "none",
    email: "",
    password: "",
    invite_role: "member" as const,
  };

  it("accepts optional profile email without format validation", () => {
    expect(
      teamMemberCreateFormSchema.safeParse({ ...base, email: "not-an-email" })
        .success
    ).toBe(true);
  });

  it("requires last name", () => {
    expect(
      teamMemberCreateFormSchema.safeParse({ ...base, last_name: "" }).success
    ).toBe(false);
  });

  it("requires email when creating a user account", () => {
    const result = teamMemberCreateFormSchema.safeParse({
      ...base,
      connect_user_id: "create_new",
      email: "   ",
      password: "secret1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "email")).toBe(true);
    }
  });
});
