import { isEngentyDevelopmentEnvironment } from "@engenty/environment";

const PREFIX = "[copilot:chat-new]";

/** Dev-only trace for the copilot's thread/session hand-off. */
export function logCopilotChatNew(
  event: string,
  fields?: Record<string, unknown>
): void {
  if (!isEngentyDevelopmentEnvironment()) {
    return;
  }
  if (fields && Object.keys(fields).length > 0) {
    console.debug(PREFIX, event, fields);
  } else {
    console.debug(PREFIX, event);
  }
}

/** Log when panel-visible transcript state changes (filter console on this). */
export function logCopilotChatPanel(
  event: string,
  fields?: Record<string, unknown>
): void {
  logCopilotChatNew(`panel:${event}`, fields);
}
