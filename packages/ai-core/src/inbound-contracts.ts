/** Source channel hints for module agent chat routing metadata. */
export type ChannelKind =
  | "web_copilot"
  /* Using Vercel Chat SDK _ https://chat-sdk.dev/adapters */
  | "chat_telegram"
  | "chat_slack"
  | "chat_teams"
  | "chat_discord"
  | "chat_gchat"
  | "chat_github"
  // | "chat_signal" - coming soon
  | "system";

/** Router-facing page context for agent `can_handle` callbacks. */
export type InboundRoutingContext = Record<string, unknown> & {
  current_module: string;
  page_snapshot?: Record<string, unknown>;
  pathname?: string;
  route_key: string;
  source_payload?: Record<string, unknown>;
  ui_language?: string;
  visible_entity_ids?: string[];
};
