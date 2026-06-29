import { isAppsAiThreadHttpNotFound } from "../ag-ui/apps-ai/apps-ai-session-api.js";

export function isCopilotThreadNotFoundError(error: unknown): boolean {
  if (isAppsAiThreadHttpNotFound(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message ?? "";
  return /not_found/i.test(message);
}
