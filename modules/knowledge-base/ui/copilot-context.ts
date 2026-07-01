export const KB_MANAGER_AGENT_ID = "knowledge-base.manager";
export const KB_TRIAGE_INBOX_ACTION_ID = "knowledge-base.triage-inbox";
export const KB_PROMOTE_INBOX_ITEM_ACTION_ID =
  "knowledge-base.promote-inbox-item";
export const KB_PROMOTE_INBOX_BATCH_ACTION_ID =
  "knowledge-base.promote-inbox-batch";

export interface KbInboxCopilotEntity {
  inboxId: string;
  kbId: string;
  title: string;
}

function buildKbInboxBaseScope(entity: KbInboxCopilotEntity) {
  const title = entity.title.trim() || "Inbox item";
  return {
    currentModule: "knowledge-base",
    entityId: entity.inboxId,
    entity_title: title,
    kb_id: entity.kbId,
    inbox_id: entity.inboxId,
  };
}

/** Passive copilot routing on inbox detail (chat + tools; no forced action). */
export function buildKbInboxDetailCopilotContext(entity: KbInboxCopilotEntity) {
  return {
    moduleId: "knowledge-base",
    routeKey: "inbox",
    scope: buildKbInboxBaseScope(entity),
  };
}
