import { slackProvider } from "./slack.js";
import { telegramProvider } from "./telegram.js";
import type { RemoteChannelProvider } from "./types.js";

export type { RemoteChannelProvider } from "./types.js";

/** The provider set. Adding a platform = one file + one entry here. */
export const remoteChannelProviders: readonly RemoteChannelProvider[] = [
  slackProvider,
  telegramProvider,
];

export function configuredRemoteChannelProviders(): RemoteChannelProvider[] {
  return remoteChannelProviders.filter((p) => p.isConfigured());
}
