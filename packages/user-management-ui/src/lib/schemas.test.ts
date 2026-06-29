import { describe, expect, it } from "vitest";
import { inviteUserSchema, updateUserProfileSchema } from "./schemas.js";

describe("user-management schemas", () => {
  it("validates invite member payload", () => {
    const valid = inviteUserSchema.safeParse({
      email: "person@example.com",
      password: "strong-password",
      display_name: "Person Example",
      role: "member",
    });
    expect(valid.success).toBe(true);

    const invalid = inviteUserSchema.safeParse({
      email: "person@example.com",
      password: "123",
      display_name: "",
      role: "member",
    });
    expect(invalid.success).toBe(false);
  });

  it("accepts profile updates with optional user fields", () => {
    const parsed = updateUserProfileSchema.safeParse({
      display_name: "Hans Dampf",
      phone: "+49 123 456",
    });
    expect(parsed.success).toBe(true);
  });
});
