/** Built-in outcome provider ids. Not a closed enum for plugins. */
export const DESK_CHAT_PROVIDER_ID = "desk.chat";
export const AGENT_MESSAGE_PROVIDER_ID = "agent.message";
export const NOTIFICATION_UPDATE_PROVIDER_ID = "notification.update";
export const NOTIFICATION_HIGH_PROVIDER_ID = "notification.high";
export const EMAIL_PROVIDER_ID = "email";
export const ARTIFACT_POINTER_PROVIDER_ID = "artifact.pointer";
export const WEBHOOK_PROVIDER_ID = "webhook";

/**
 * Destinations that stay inside Engenty. Everything else — email, webhooks,
 * plugin providers such as Slack — sends a run's result outside the app.
 */
const IN_APP_PROVIDER_IDS: ReadonlySet<string> = new Set([
  AGENT_MESSAGE_PROVIDER_ID,
  ARTIFACT_POINTER_PROVIDER_ID,
  DESK_CHAT_PROVIDER_ID,
  NOTIFICATION_HIGH_PROVIDER_ID,
  NOTIFICATION_UPDATE_PROVIDER_ID,
]);

export function isExternalOutcomeProvider(providerId: string): boolean {
  return !IN_APP_PROVIDER_IDS.has(providerId);
}

export const SETTLE_IDEMPOTENCY_KEY = "settle";
export const FAILURE_FLOOR_IDEMPOTENCY_KEY = "failure_floor";
export const AGENT_IDEMPOTENCY_KEY = "agent";
