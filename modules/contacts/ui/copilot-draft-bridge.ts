import type { UiCopilotApplyHandler } from "@engenty/ui-plugin-sdk";

let contactsDraftApplyHandler: UiCopilotApplyHandler | null = null;

export function getContactsDraftApplyHandler() {
  return contactsDraftApplyHandler;
}

export function setContactsDraftApplyHandler(
  nextHandler: UiCopilotApplyHandler | null
) {
  contactsDraftApplyHandler = nextHandler;
}
