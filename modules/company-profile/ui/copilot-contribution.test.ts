import { describe, expect, it } from "vitest";
import { companyProfileCopilotContribution } from "./copilot-contribution.js";

describe("companyProfileCopilotContribution", () => {
  it("matches the company-profile settings route", () => {
    expect(
      companyProfileCopilotContribution.matches({
        pathname: "/mdl/company-profile/settings",
        scope: { currentModule: "company-profile" },
      })
    ).toBe(true);

    expect(
      companyProfileCopilotContribution.matches({
        pathname: "/mdl/company-profile",
        scope: { currentModule: "company-profile" },
      })
    ).toBe(false);
  });
});
