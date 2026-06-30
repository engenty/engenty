import { describe, expect, it } from "vitest";
import { teamMembersAiRegistration } from "../registrar.js";

describe("teamMembersAiRegistration", () => {
  it("registers team content management skill", () => {
    const registration = teamMembersAiRegistration();
    expect(registration.module_id).toBe("team");
    expect(registration.skills?.map((skill) => skill.name)).toEqual([
      "team-content-management",
    ]);
  });
});
