// src/plugin.ts — EngentyPluginFactory for the Remote module.
// Phase 1: registers the AI capability (engenty.remote agent). Binding
// management operations and the pairing flow land in later phases; the
// channel runtime (Mastra AgentChannels + webhook routes) lives in apps/ai
// (see apps/ai/src/api/remote-channels.ts), mirroring how the team-chat
// mention consumer is hosted there.

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { remoteAiRegistration } from "../ai/registrar.js";

const registerRemotePlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;

  // Register AI capability: engenty.remote AgentConfig + instruction docs.
  // The dynamic registry in apps/ai picks this up via ModuleProvider.
  server.registerAiRegistration(remoteAiRegistration());
};

export default registerRemotePlugin;
