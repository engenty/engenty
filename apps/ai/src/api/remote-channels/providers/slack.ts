import { createSlackAdapter } from "@chat-adapter/slack";
import type { RemoteChannelProvider } from "./types.js";

export const slackProvider: RemoteChannelProvider = {
  // SLACK_API_URL overrides the Slack Web API base URL (dev/E2E only: lets a
  // stub Slack accept the bot's posts so the full turn can run without a real
  // workspace). Unset in any real deployment.
  createAdapter: () =>
    createSlackAdapter(
      process.env.SLACK_API_URL?.trim()
        ? { apiUrl: process.env.SLACK_API_URL.trim() }
        : {}
    ),
  id: "slack",
  isConfigured: () =>
    Boolean(
      process.env.SLACK_BOT_TOKEN?.trim() &&
        process.env.SLACK_SIGNING_SECRET?.trim()
    ),
};
