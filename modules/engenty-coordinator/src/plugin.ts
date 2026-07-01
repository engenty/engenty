// src/plugin.ts — EngentyPluginFactory for the Coordinator module.
// No HTTP routes, no database — purely registers the AI capability
// (engenty.coordinator agent + coordinator-workflow skill) into the core registry.

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { coordinatorAiRegistration } from "../ai/registrar.js";

const registerCoordinatorPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;

  // Register AI capability: engenty.coordinator AgentConfig + skills.
  // The dynamic registry in apps/ai picks this up via ModuleProvider.
  server.registerAiRegistration(coordinatorAiRegistration());
};

export default registerCoordinatorPlugin;
