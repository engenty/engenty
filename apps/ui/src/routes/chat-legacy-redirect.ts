import { isAgentThreadId } from "@engenty/ai-ui";
import {
  COPILOT_CHAT_NEW,
  copilotChatThreadPath,
} from "@engenty/engenty-copilot/paths";

/** Explicit bookmark cutover from legacy `/chat/:threadId` to module chat. */
export function resolveChatLegacyRedirectTarget(
  threadId: string | undefined
): string {
  const raw = threadId?.trim() ?? "";
  if (raw === "new" || !raw) {
    return COPILOT_CHAT_NEW;
  }
  if (isAgentThreadId(raw)) {
    return copilotChatThreadPath(raw);
  }
  return COPILOT_CHAT_NEW;
}
