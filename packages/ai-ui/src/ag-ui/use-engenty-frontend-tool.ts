/**
 * CopilotKit-shaped frontend tool registration: one handler per tool name via app-shell,
 * with optional custom transcript cards via `registerToolCallUi` (not a second local state tree).
 */

import { buildFrontendToolDefinitionFromZod } from "@engenty/ag-ui-bridge";
import {
  type AgentUiFrontendToolHandler,
  type FrontendToolDefinition,
  useFrontendTool,
} from "@engenty/app-shell";
import { useCallback, useMemo, useRef } from "react";
import type { z } from "zod";
import {
  type EngentyZodFrontendToolConfig,
  isZodFrontendToolConfig,
  toAgentUiFrontendToolHandler,
} from "./zod-frontend-tool.js";

export type { EngentyZodFrontendToolConfig } from "./zod-frontend-tool.js";

export type EngentyFrontendToolStatus =
  | "idle"
  | "running"
  | "completed"
  | "error";

export interface EngentyFrontendToolRenderProps {
  error?: string;
  input?: unknown;
  output?: unknown;
  status: EngentyFrontendToolStatus;
}

export interface UseEngentyFrontendToolOptions {
  /**
   * False = withhold the tool from the agent for now. Its schema is in every
   * model call while registered, so state-specific tools should register only
   * in that state.
   */
  enabled?: boolean;
  /**
   * Reserved for custom in-transcript UI. Register a matching `registerToolCallUi` card
   * and derive `status` from the lane `dynamic-tool` part (`output-available`, etc.).
   */
  render?: (props: EngentyFrontendToolRenderProps) => void;
}

/**
 * Registers a browser frontend tool the agent calls by name (AG-UI-native: the
 * run suspends, the browser handler runs, the run resumes with the result).
 * Wraps `useFrontendTool` from `@engenty/app-shell` — the lane owns tool status.
 *
 * Two call shapes, same harness path (gating, run-state, metering, suspend/resume):
 * - Zod config: one colocated object with a typed `schema` + `handler`; the JSON
 *   Schema the agent sees is generated and the handler receives validated args.
 * - Definition + handler: the low-level form, for hand-written JSON Schema.
 */
export function useEngentyFrontendTool<TSchema extends z.ZodType>(
  config: EngentyZodFrontendToolConfig<TSchema>
): void;
export function useEngentyFrontendTool(
  definition: FrontendToolDefinition,
  handler: AgentUiFrontendToolHandler,
  options?: UseEngentyFrontendToolOptions
): void;
export function useEngentyFrontendTool(
  definitionOrConfig:
    | FrontendToolDefinition
    | EngentyZodFrontendToolConfig<z.ZodType>,
  handler?: AgentUiFrontendToolHandler,
  options?: UseEngentyFrontendToolOptions
): void {
  const isZod = isZodFrontendToolConfig(definitionOrConfig);

  // Definition is generated from the schema (zod form) or passed through (low-level
  // form). Memoize on the tool name so an inline schema does not re-register each render.
  const definition = useMemo(
    () =>
      isZod
        ? buildFrontendToolDefinitionFromZod(definitionOrConfig)
        : (definitionOrConfig as FrontendToolDefinition),
    [isZod, (definitionOrConfig as { name: string }).name]
  );

  const handlerRef = useRef<AgentUiFrontendToolHandler>(() => {
    throw new Error("frontend tool handler not initialized");
  });
  handlerRef.current = isZod
    ? toAgentUiFrontendToolHandler(definitionOrConfig)
    : (handler as AgentUiFrontendToolHandler);

  const stableHandler = useCallback<AgentUiFrontendToolHandler>(
    (input, request) => handlerRef.current(input, request),
    []
  );
  useFrontendTool(definition, stableHandler, {
    enabled:
      (isZod
        ? (definitionOrConfig as { enabled?: boolean }).enabled
        : options?.enabled) !== false,
  });
}
