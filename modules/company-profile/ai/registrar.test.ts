import { describe, expect, it } from "vitest";
import {
  companyProfileAiRegistration,
  companyProfileDynamicAiCapability,
} from "./registrar.js";

describe("companyProfileAiRegistration", () => {
  it("registers a manager agent and the research action", () => {
    const registration = companyProfileAiRegistration({
      invokeCompanyProfileOperation: async () => null,
    });
    const agent = registration.dynamic?.agent_configs?.find(
      (item) => item.id === "company-profile.manager"
    );
    const action = registration.workflows?.find(
      (item) => item.id === "company-profile.research"
    );

    expect(agent).toBeTruthy();
    expect(action?.owner_agent_id).toBe("company-profile.manager");
  });

  it("exposes company profile manager as a dynamic module capability", async () => {
    const capability = companyProfileDynamicAiCapability({
      invokeCompanyProfileOperation: async (name: string, input: unknown) => {
        expect(name).toBe("company_profile_get");
        expect(input).toEqual({});
        return { company_name: "Engenty" };
      },
    });

    expect(capability.moduleId).toBe("company-profile");
    expect(capability.agentConfigs?.[0]).toMatchObject({
      id: "company-profile.manager",
      skillIds: [],
      source: "module",
      toolIds: [
        "loadCompanyProfile",
        "updateCompanyProfile",
        "setCompanyLogo",
        "uploadAsset",
        "companyWebsitePages",
        "convert_image",
        "web_search",
      ],
    });
    expect(capability.tools).toHaveProperty("loadCompanyProfile");
    expect(capability.tools).toHaveProperty("updateCompanyProfile");
    expect(capability.tools).toHaveProperty("setCompanyLogo");
    expect(capability.tools).toHaveProperty("companyWebsitePages");

    await expect(
      (
        capability.tools?.loadCompanyProfile as {
          execute: (input: Record<string, never>) => Promise<unknown>;
        }
      ).execute({})
    ).resolves.toEqual({ company_name: "Engenty" });
  });
});

describe("company profile skills", () => {
  it("ships the playbooks the copilot loads for this module", () => {
    // The module had an agent and tools but no SKILL.md, so the copilot got no
    // guidance for it — unlike offers and invoices.
    const registration = companyProfileAiRegistration({
      invokeCompanyProfileOperation: async () => null,
    });
    expect(
      (registration.skills ?? []).map((skill) => skill.name).sort()
    ).toEqual([
      "company-profile-branding-assets",
      "company-profile-research-and-fill",
    ]);
  });

  it("tells the profile skill never to research bank details", () => {
    // An IBAN found on the web is either wrong or someone else's, and it lands
    // on invoices the tenant sends.
    const registration = companyProfileAiRegistration({
      invokeCompanyProfileOperation: async () => null,
    });
    expect(
      registration.dynamic?.skills?.["company-profile-research-and-fill"]
    ).toMatch(/Never research bank details/i);
    expect(
      registration.dynamic?.skills?.["company-profile-research-and-fill"]
    ).toMatch(/one tenant legal\/company profile shared across Spaces/);
  });
});
