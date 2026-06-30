import { describe, expect, it } from "vitest";
import { companyProfileCopilotContribution } from "./copilot-contribution.js";
import {
  getCompanyProfileDraftApplyHandler,
  setCompanyProfileDraftApplyHandler,
} from "./copilot-draft-bridge.js";

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

  it("resolves the active draft apply handler", async () => {
    const appliedPatches: Record<string, string | null>[] = [];
    const handler = async (patch: Record<string, string | null>) => {
      appliedPatches.push(patch);
    };

    setCompanyProfileDraftApplyHandler(handler);
    expect(getCompanyProfileDraftApplyHandler()).toBe(handler);

    const resolvedHandler =
      companyProfileCopilotContribution.resolveApplySuggestions?.({
        pathname: "/mdl/company-profile/settings",
        scope: { currentModule: "company-profile" },
      }) ?? null;

    expect(resolvedHandler).toBe(handler);
    await resolvedHandler?.({ website: "https://example.com" });
    expect(appliedPatches).toEqual([{ website: "https://example.com" }]);

    setCompanyProfileDraftApplyHandler(null);
  });
});
