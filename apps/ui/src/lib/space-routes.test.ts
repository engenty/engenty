import { describe, expect, it } from "vitest";
import {
  isSpaceDashboardBoundPath,
  isSpaceDataArtifactsListing,
  parseModulePath,
  parseSpacePath,
  spaceAgentDeskPath,
  spaceAgentHirePath,
  spaceAgentsPath,
  spaceDataArtifactsPath,
  spaceModulePath,
  spaceNotificationsPath,
  spaceRootPath,
  spaceSettingsPath,
  spaceSettingsPeoplePath,
} from "./space-routes";

describe("space routes", () => {
  it("builds the short human-typable shape", () => {
    expect(spaceRootPath("marketing")).toBe("/s/marketing");
    expect(spaceModulePath("marketing", "offers")).toBe("/s/marketing/offers");
    expect(spaceModulePath("marketing", "offers", "123")).toBe(
      "/s/marketing/offers/123"
    );
  });

  it("round-trips a module path with a nested rest", () => {
    const path = spaceModulePath("kunde-mueller", "projects", "abc/tasks/9");
    expect(parseSpacePath(path)).toEqual({
      moduleId: "projects",
      rest: "abc/tasks/9",
      segment: "projects",
      spaceKey: "kunde-mueller",
    });
  });

  it("parses the space root, where there is no module yet", () => {
    expect(parseSpacePath("/s/marketing")).toEqual({
      rest: "",
      spaceKey: "marketing",
    });
  });

  it("reports the RAW segment for the space's own pages, where there is no module", () => {
    // `moduleId` is deliberately absent — nothing should look for a module
    // called "data" — but the Data tab still has to read as active, and that
    // is what `segment` answers (PLAN-space-data.md D1).
    expect(parseSpacePath("/s/marketing/data")).toEqual({
      rest: "",
      segment: "data",
      spaceKey: "marketing",
    });
    expect(parseSpacePath("/s/marketing/settings")).toEqual({
      rest: "",
      segment: "settings",
      spaceKey: "marketing",
    });
    expect(parseSpacePath("/s/marketing/agents")).toEqual({
      rest: "",
      segment: "agents",
      spaceKey: "marketing",
    });
    expect(parseSpacePath("/s/marketing/agents/custom.researcher")).toEqual({
      rest: "custom.researcher",
      segment: "agents",
      spaceKey: "marketing",
    });
    expect(parseSpacePath("/s/marketing/notifications")).toEqual({
      rest: "",
      segment: "notifications",
      spaceKey: "marketing",
    });
  });

  it("is not fooled by other routes", () => {
    expect(parseSpacePath("/settings/spaces")).toBeNull();
    expect(parseSpacePath("/mdl/offers/123")).toBeNull();
    expect(parseSpacePath("/")).toBeNull();
  });

  it("reads a legacy module deep link apart so it can be redirected", () => {
    // Notification links, search hits and agent refs already in flight use this
    // shape; they must redirect, not 404.
    expect(parseModulePath("/mdl/offers/123")).toEqual({
      moduleId: "offers",
      rest: "123",
    });
    expect(parseModulePath("/mdl/offers")).toEqual({
      moduleId: "offers",
      rest: "",
    });
    expect(parseModulePath("/s/marketing/offers")).toBeNull();
  });

  it("encodes a key that would otherwise change which space is addressed", () => {
    // Space keys are constrained by `spaces_key_format_check`, but the builder
    // takes a string and a stray slash would silently walk elsewhere.
    expect(spaceRootPath("a/b")).toBe("/s/a%2Fb");
  });
});

describe("agent desk", () => {
  it("builds the reserved Space Agents list path", () => {
    expect(spaceAgentsPath("marketing")).toBe("/s/marketing/agents");
    expect(spaceAgentsPath("Sales / DACH")).toBe(
      "/s/Sales%20%2F%20DACH/agents"
    );
  });

  it("builds and parses the reserved Space Agent path", () => {
    const path = spaceAgentDeskPath("Sales / DACH", "custom/researcher");
    expect(path).toBe("/s/Sales%20%2F%20DACH/agents/custom%2Fresearcher");
    expect(parseSpacePath(path)).toEqual({
      rest: "custom%2Fresearcher",
      segment: "agents",
      spaceKey: "Sales / DACH",
    });
  });

  it("builds hire under agents/new, which is not captured as an agent id", () => {
    expect(spaceAgentHirePath("marketing")).toBe("/s/marketing/agents/new");
    expect(parseSpacePath("/s/marketing/agents/new")).toEqual({
      rest: "new",
      segment: "agents",
      spaceKey: "marketing",
    });
  });
});

describe("short module segments", () => {
  it("builds the copilot's path with its short segment", () => {
    expect(spaceModulePath("company", "engenty-copilot", "chat/abc")).toBe(
      "/s/company/copilot/chat/abc"
    );
  });

  it("reads the short segment back as the module ID", () => {
    // Callers ask "which module is open" — the answer has to be the id the
    // mounts, manifests and tool names use, never the URL's short form.
    expect(parseSpacePath("/s/company/copilot/chat/abc")?.moduleId).toBe(
      "engenty-copilot"
    );
  });

  it("still reads a pre-alias URL as the same module", () => {
    expect(
      parseSpacePath("/s/company/engenty-copilot/chat/abc")?.moduleId
    ).toBe("engenty-copilot");
  });

  it("leaves an unaliased module untouched in both directions", () => {
    expect(spaceModulePath("company", "offers", "42")).toBe(
      "/s/company/offers/42"
    );
    expect(parseSpacePath("/s/company/offers/42")?.moduleId).toBe("offers");
  });
});

describe("space notifications", () => {
  it("builds the reserved inbox path", () => {
    expect(spaceNotificationsPath("marketing")).toBe(
      "/s/marketing/notifications"
    );
  });

  it("does NOT report `notifications` as an open module", () => {
    // The shell used to treat this as a module called "notifications" and
    // hide the space sidebar — the inbox is the dashboard's list.
    const parsed = parseSpacePath("/s/company/notifications");
    expect(parsed?.spaceKey).toBe("company");
    expect(parsed?.moduleId).toBeUndefined();
    expect(parsed?.segment).toBe("notifications");
  });

  it("is virtually bound to the dashboard, and only the inbox is", () => {
    expect(
      isSpaceDashboardBoundPath("/s/company/notifications", "company")
    ).toBe(true);
    expect(isSpaceDashboardBoundPath("/s/company", "company")).toBe(false);
    expect(isSpaceDashboardBoundPath("/s/company/agents", "company")).toBe(
      false
    );
    expect(isSpaceDashboardBoundPath("/s/other/notifications", "company")).toBe(
      false
    );
  });
});

describe("space settings", () => {
  it("builds the space's own settings path", () => {
    expect(spaceSettingsPath("company")).toBe("/s/company/settings");
  });

  it("lands on the people section from the home team-space link", () => {
    expect(spaceSettingsPeoplePath("company")).toBe(
      "/s/company/settings#people"
    );
  });

  it("does NOT report `settings` as an open module", () => {
    // The shell reads this to decide whether a module is open; calling the
    // space's own page a module hid the space sidebar and showed that
    // module's (non-existent) nav instead.
    const parsed = parseSpacePath("/s/company/settings");
    expect(parsed?.spaceKey).toBe("company");
    expect(parsed?.moduleId).toBeUndefined();
  });
});

describe("space data artifacts listing", () => {
  it("addresses the Artifacts root as a folder listing", () => {
    expect(spaceDataArtifactsPath("company")).toBe(
      "/s/company/data?as=artifacts"
    );
  });

  it("does not treat an open artifact as the section listing", () => {
    expect(
      isSpaceDataArtifactsListing(
        new URLSearchParams("as=artifacts&artifact=abc")
      )
    ).toBe(false);
    expect(
      isSpaceDataArtifactsListing(new URLSearchParams("as=artifacts"))
    ).toBe(true);
  });
});
