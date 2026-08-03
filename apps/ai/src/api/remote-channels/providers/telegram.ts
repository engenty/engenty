import { createTelegramAdapter } from "@chat-adapter/telegram";
import type { RemoteChannelProvider } from "./types.js";

export const telegramProvider: RemoteChannelProvider = {
  createAdapter: () => createTelegramAdapter(),
  id: "telegram",
  isConfigured: () => Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
};
