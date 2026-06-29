import { createLogger } from "@engenty/telemetry";

const logger = createLogger({
  name: "copilot:chat-new",
  baseLevel: "debug",
  debugOverride: true,
});

/** Dev-only trace for full-page copilot chat panel render state. */
export function logCopilotChatPanel(
  event: string,
  fields?: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const message = `panel:${event}`;
  if (fields && Object.keys(fields).length > 0) {
    logger.debug(message, fields);
  } else {
    logger.debug(message);
  }
}
