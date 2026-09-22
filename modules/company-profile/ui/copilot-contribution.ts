import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";

export const companyProfileCopilotContribution: UiCopilotContribution = {
  moduleId: "company-profile",
  routeKey: "chat",
  requestedAgentId: "company-profile.manager",
  title: "Company Profile",
  starterPrompts: [
    {
      id: "company-profile.fill-from-website",
      label: "Research from website",
      prompt:
        "/research Research our public company information from the website and public sources, then suggest updates for this company profile form.",
    },
    {
      id: "company_profile_verify",
      label: "Verify current fields",
      prompt:
        "/research Review the current company profile against public sources and suggest corrections or missing values only.",
    },
  ],
  matches: (context) =>
    context.pathname === "/mdl/company-profile/settings" &&
    context.scope?.currentModule === "company-profile",
};
