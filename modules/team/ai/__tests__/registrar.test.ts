import { describe, expect, it } from "vitest";
import { teamMembersAiRegistration } from "../registrar.js";

describe("teamMembersAiRegistration", () => {
  it("registers team content management skill", () => {
    const registration = teamMembersAiRegistration();
    expect(registration.module_id).toBe("team");
    expect(registration.skills?.map((skill) => skill.name)).toEqual([
      "team-content-management",
    ]);
    expect(registration.dynamic?.skills?.["team-content-management"]).toContain(
      "tenant-global"
    );
    expect(registration.dynamic?.skills?.["team-content-management"]).toContain(
      "/settings/team"
    );
    expect(registration.dynamic?.skills?.["team-content-management"]).toContain(
      "no member `space_id`"
    );
  });
});
