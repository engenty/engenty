import type {
  EngentyCoreAiAgentListItem,
  EngentyCoreModuleCapabilitySeed,
  EngentyPluginListItem,
  EngentyToolContract,
  EngentyWorkspaceContext,
} from "../../../../src/ai/core-http-client.js";

export interface NormalizedEngentyToolEntry {
  auth: {
    requiredCapabilities: string[];
    requiredPermissions: string[];
    requiredScopes: string[];
    requiresApproval: boolean;
    riskLevel: "low" | "medium" | "high" | "critical";
  };
  description?: string;
  execution: {
    approvalBehavior: "none" | "may_require_approval" | "requires_approval";
    readOnly: boolean;
    recommendedForAgents: boolean;
  };
  id: string;
  input: {
    jsonSchema?: Record<string, unknown>;
    schemaHint?: string;
    schemaType?: string;
  };
  kind: "tool";
  moduleId?: string;
  output: {
    jsonSchema?: Record<string, unknown>;
    schemaHint?: string;
    schemaType?: string;
  };
  pluginId?: string;
  summary?: string;
  title: string;
  tool: {
    invokePath: string;
    toolId: string;
  };
}

export interface EngentyToolsClient {
  /** Answer an approval request core filed alongside a 202 `approval_required`. */
  decideApproval(
    requestId: string,
    body: { decision: "allow_once" | "allow_policy"; subject_id?: string }
  ): Promise<unknown>;
  describeTool(toolId: string): Promise<EngentyToolContract>;
  getWorkspaceContext(): Promise<EngentyWorkspaceContext>;
  invokeTool<TInput, TResult>(
    toolId: string,
    input: TInput,
    options?: { spaceId?: string }
  ): Promise<TResult>;
  listAiAgents(
    moduleId?: string | null
  ): Promise<{ agents: EngentyCoreAiAgentListItem[] }>;
  listModuleCapabilitySeeds(): Promise<{
    capabilities: EngentyCoreModuleCapabilitySeed[];
  }>;
  listPlugins(tenantId?: string | null): Promise<EngentyPluginListItem[]>;
  listToolContracts(): Promise<EngentyToolContract[]>;
}

export type EngentyToolsClientResult =
  | { ok: true; client: EngentyToolsClient }
  | {
      ok: false;
      code: "service_unavailable" | "unauthorized";
      message: string;
    };
