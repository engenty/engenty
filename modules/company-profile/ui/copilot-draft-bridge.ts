import type { UiCopilotApplyHandler } from "@engenty/ui-plugin-sdk";

let companyProfileDraftApplyHandler: UiCopilotApplyHandler | null = null;

export function getCompanyProfileDraftApplyHandler() {
  return companyProfileDraftApplyHandler;
}

export function setCompanyProfileDraftApplyHandler(
  nextHandler: UiCopilotApplyHandler | null
) {
  companyProfileDraftApplyHandler = nextHandler;
}
