import { describe, expect, it } from "vitest";
import {
  isTeamSettingsPath,
  TEAM_IMPORT_PATH,
  TEAM_MODULE_SETTINGS_PATH,
} from "./team-paths.js";

describe("team paths", () => {
  it("uses module-scoped settings path", () => {
    expect(TEAM_MODULE_SETTINGS_PATH).toBe("/mdl/team/settings");
  });

  it("uses import path under module base", () => {
    expect(TEAM_IMPORT_PATH).toBe("/mdl/team/import");
  });

  it("detects team settings routes", () => {
    expect(isTeamSettingsPath("/mdl/team/settings")).toBe(true);
    expect(isTeamSettingsPath("/mdl/team/settings/statuses")).toBe(true);
    expect(isTeamSettingsPath("/settings/team")).toBe(false);
    expect(isTeamSettingsPath("/mdl/team")).toBe(false);
  });
});
