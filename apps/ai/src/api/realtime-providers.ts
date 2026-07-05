import {
  normalizeRealtimeProviderId,
  type RealtimeProviderId,
  type RealtimeVoiceProvider,
} from "@engenty/ai-core";

export interface RealtimeProviderRegistry {
  resolve(provider: string | null | undefined): RealtimeVoiceProvider | null;
}

export function createRealtimeProviderRegistry(
  providers: readonly RealtimeVoiceProvider[]
): RealtimeProviderRegistry {
  const byId = new Map<RealtimeProviderId, RealtimeVoiceProvider>(
    providers.map((provider) => [provider.id, provider])
  );
  return {
    resolve(provider) {
      return byId.get(normalizeRealtimeProviderId(provider)) ?? null;
    },
  };
}
