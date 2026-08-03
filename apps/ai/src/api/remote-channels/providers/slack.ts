import { createSlackAdapter } from "@chat-adapter/slack";
import type { RemoteChannelProvider } from "./types.js";

export const slackProvider: RemoteChannelProvider = {
  createAdapter: () => createSlackAdapter(),
  id: "slack",
  isConfigured: () =>
    Boolean(
      process.env.SLACK_BOT_TOKEN?.trim() &&
        process.env.SLACK_SIGNING_SECRET?.trim()
    ),
};
