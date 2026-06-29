import type {
  AgentConfig,
  AiRegistryProvider,
  DynamicAiModuleCapabilityLoader,
  MastraToolDefinition,
} from "./types.js";

/**
 * ModuleProvider is the runtime seam for plugin-discovered AI capabilities.
 *
 * It intentionally accepts already-discovered contributions instead of scanning
 * `modules/*` itself, so `apps/ai` does not import optional module code. The
 * next integration step is to feed this from the plugin discovery manifest or
 * a core-provided capability endpoint.
 */
export class ModuleProvider implements AiRegistryProvider {
  readonly providerId = "module";

  private readonly loader: DynamicAiModuleCapabilityLoader;

  private loaded?: Promise<{
    agentConfigs: Map<string, AgentConfig>;
    tools: Map<string, MastraToolDefinition>;
  }>;

  constructor(loader: DynamicAiModuleCapabilityLoader) {
    this.loader = loader;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | undefined> {
    const loaded = await this.load();
    return loaded.agentConfigs.get(id);
  }

  async getTool(id: string): Promise<MastraToolDefinition | undefined> {
    const loaded = await this.load();
    return loaded.tools.get(id);
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    const loaded = await this.load();
    return [...loaded.agentConfigs.values()];
  }

  private load() {
    this.loaded ??= this.loader
      .listModuleCapabilities()
      .then((capabilities) => {
        const agentConfigs = new Map<string, AgentConfig>();
        const tools = new Map<string, MastraToolDefinition>();

        for (const capability of capabilities) {
          for (const config of capability.agentConfigs ?? []) {
            agentConfigs.set(config.id, { ...config, source: "module" });
          }
          for (const [id, tool] of Object.entries(capability.tools ?? {})) {
            tools.set(id, tool);
          }
        }

        return { agentConfigs, tools };
      });
    return this.loaded;
  }
}
