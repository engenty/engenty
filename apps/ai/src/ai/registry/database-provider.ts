import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./types.js";

export interface DynamicAiDatabaseStore {
  getAgentConfig(
    tenantId: string,
    id: string
  ): Promise<AgentConfig | undefined>;
  getTool(
    tenantId: string,
    id: string
  ): Promise<MastraToolDefinition | undefined>;
  listAgents?(tenantId: string): Promise<AgentConfig[]>;
}

export interface DatabaseProviderOptions {
  tenantId?: string;
}

/** Typed seam for tenant/user-defined AI capabilities. */
export class DatabaseProvider implements AiRegistryProvider {
  readonly providerId = "database";

  private readonly tenantId?: string;
  private readonly store?: DynamicAiDatabaseStore | null;

  constructor(
    store?: DynamicAiDatabaseStore | null,
    options: DatabaseProviderOptions = {}
  ) {
    this.store = store;
    this.tenantId = options.tenantId;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | undefined> {
    if (!(this.store && this.tenantId)) {
      return;
    }
    const config = await this.store.getAgentConfig(this.tenantId, id);
    return config ? { ...config, source: "database" } : undefined;
  }

  async getTool(id: string): Promise<MastraToolDefinition | undefined> {
    if (!(this.store && this.tenantId)) {
      return;
    }
    return this.store.getTool(this.tenantId, id);
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    if (!(this.store && this.tenantId && this.store.listAgents)) {
      return [];
    }
    const configs = await this.store.listAgents(this.tenantId);
    return configs.map((config) => ({ ...config, source: "database" }));
  }
}
