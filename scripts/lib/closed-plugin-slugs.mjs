/**
 * Plugin slugs that stay pro-only (see CLOSED_PREFIXES in publish-open.sh).
 * Public engenty.plugins must not list these — modules are stripped on publish.
 */
export const CLOSED_PLUGIN_SLUGS = [
  "banking",
  "engenty-apps",
  "engenty-remote",
  "team-chat-slack-bridge",
  "team-hr",
  "time-tracking",
];
