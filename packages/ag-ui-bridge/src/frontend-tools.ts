import type { Tool } from "@ag-ui/core";
import { ToolSchema } from "@ag-ui/core";
import type {
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
} from "./agent-ui-state.js";
import { isAgentUiStateSnapshotV1 } from "./agent-ui-state.js";
import type { JsonValue } from "./json-value.js";
import { isJsonValue, isRecord } from "./json-value.js";

export type FrontendToolAvailability = "enabled" | "disabled" | "remote";

export interface EngentyFrontendToolMetadata {
  availability: FrontendToolAvailability;
  /** Module owner for tenant/effective-state gating; omitted for core tools. */
  owner_module_id?: string;
  title?: string;
}

export type FrontendToolDefinition = Tool & {
  metadata: Record<string, unknown> & {
    engenty: EngentyFrontendToolMetadata;
  };
  parameters: Record<string, JsonValue>;
};

export interface CreateFrontendToolDefinitionInput {
  availability: FrontendToolAvailability;
  description: string;
  name: string;
  owner_module_id?: string;
  parameters: Record<string, JsonValue>;
  title?: string;
}

export function createFrontendToolDefinition(
  input: CreateFrontendToolDefinitionInput
): FrontendToolDefinition {
  const { availability, owner_module_id, title, ...tool } = input;
  return {
    ...tool,
    metadata: {
      engenty: {
        availability,
        ...(owner_module_id ? { owner_module_id } : {}),
        ...(title ? { title } : {}),
      },
    },
  };
}

export function toAgUiTool(tool: FrontendToolDefinition): Tool {
  return {
    description: tool.description,
    metadata: tool.metadata,
    name: tool.name,
    parameters: tool.parameters,
  };
}

export interface FrontendToolCallRequest {
  call_id: string;
  input: JsonValue;
  run_id: string;
  tool_name: string;
}

export interface FrontendToolCallResult {
  call_id: string;
  error?: string;
  output?: JsonValue;
  rejected?: boolean;
  run_id: string;
  tool_name: string;
}

export interface AgentUiRunContext {
  frontend_tools: FrontendToolDefinition[];
  state_delta?: AgentUiStateDeltaV1;
  state_snapshot: AgentUiStateSnapshotV1;
}

function isEngentyFrontendToolMetadata(
  value: unknown
): value is EngentyFrontendToolMetadata {
  return (
    isRecord(value) &&
    (value.availability === "enabled" ||
      value.availability === "disabled" ||
      value.availability === "remote") &&
    (value.owner_module_id === undefined ||
      typeof value.owner_module_id === "string") &&
    (value.title === undefined || typeof value.title === "string")
  );
}

export function isFrontendToolDefinition(
  value: unknown
): value is FrontendToolDefinition {
  const parsed = ToolSchema.safeParse(value);
  if (!parsed.success) {
    return false;
  }
  const metadata = isRecord(parsed.data.metadata)
    ? parsed.data.metadata
    : undefined;
  return (
    isRecord(parsed.data.parameters) &&
    isJsonValue(parsed.data.parameters) &&
    metadata !== undefined &&
    isEngentyFrontendToolMetadata(metadata.engenty)
  );
}

export function isAgentUiRunContext(
  value: unknown
): value is AgentUiRunContext {
  return (
    isRecord(value) &&
    isAgentUiStateSnapshotV1(value.state_snapshot) &&
    Array.isArray(value.frontend_tools) &&
    value.frontend_tools.every(isFrontendToolDefinition)
  );
}

export function isFrontendToolCallResult(
  value: unknown
): value is FrontendToolCallResult {
  return (
    isRecord(value) &&
    typeof value.call_id === "string" &&
    typeof value.run_id === "string" &&
    typeof value.tool_name === "string" &&
    (value.output === undefined || isJsonValue(value.output)) &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.rejected === undefined || typeof value.rejected === "boolean")
  );
}
